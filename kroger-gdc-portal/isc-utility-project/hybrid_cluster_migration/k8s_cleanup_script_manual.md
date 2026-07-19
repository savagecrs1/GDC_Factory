# GDCE Network Cleanup — `k8s_cleanup.sh`

Legacy namespace drain script. Scales workloads to zero, deletes pods, pauses Anthos Config Management (CMS) reconcilers, and deletes the Network CR when all mapped namespaces are empty.

> **Note:** For production hybrid-migration cleanup (per-group backup, CMS restore on exit, operator CR suspend, dry-run), use `Archive/gdce_k8_cleanup_orchestrator.sh` or `Archive/gdce_k8_cleanup_sequence.sh` instead. Pair this script with `gdce_recovery.sh` for a minimal cleanup → rehydrate flow.

---

## Prerequisites

| Requirement | Details |
|-------------|---------|
| **kubectl** | Configured and pointed at the target cluster |
| **Bash** | Git Bash or Linux shell (`set -euo pipefail`) |
| **Network CR name** | The GDCE `Network` resource tied to the namespaces you are draining |
| **Namespace list** | Comma-separated namespaces attached to that network |

Verify access before running:

```bash
kubectl config current-context
kubectl get network
kubectl get ns
```

---

## Quick start

```bash
cd hybrid_cluster_migration
chmod +x k8s_cleanup.sh   # once, if needed

# One network and its namespaces (net=name, ns=comma-separated list)
./k8s_cleanup.sh --network pci-network-3430=rabbitmq-system,elastic-system,mongodb,ngpos-lab
```

The script runs **live** immediately — there is no `--dry-run`, `--yes`, or confirmation prompt.

---

## Command syntax

```bash
./k8s_cleanup.sh --network <NETWORK_CR_NAME>=<ns1>,<ns2>,<ns3> [--network <OTHER_NET>=<nsA>,<nsB> ...]
```

| Part | Description |
|------|-------------|
| `NETWORK_CR_NAME` | Kubernetes `Network` custom resource to delete when drain completes |
| `ns1,ns2,...` | Namespaces to drain (spaces allowed after commas in the script parser) |

### Example: all three migration groups (separate invocations)

Use network names from `Archive/namespace_groups.sh` for your cluster:

```bash
# PCI
./k8s_cleanup.sh --network pci-network-3430=rabbitmq-system,elastic-system,mongodb,ngpos-lab,ngpos-payments-pci,ngpos-shared-pci,prom-monitoring-pci,kong-system-pci,ngpos-fuel-pci-l1

# Non-PCI
./k8s_cleanup.sh --network non-pci-network-3130=ngpos-apex,ngpos-dev,ngpos-isa,ngpos-mx,ngpos-mxc,ngpos-payments,ngpos-platform,ngpos-shared,ngpos-tax,prom-monitoring,local-image-registry,edsmongodb,kong-system,ngpos-fuel,mx-offers

# Fuel
./k8s_cleanup.sh --network fuel-network-3421=ngpos-fuel-pci-l0,filebeat,prom-monitoring-fuel,kong-system-fuel
```

### Example: multiple networks in one run

```bash
./k8s_cleanup.sh \
  --network pci-network-3430=rabbitmq-system,elastic-system,mongodb \
  --network fuel-network-3421=ngpos-fuel-pci-l0,kong-system-fuel
```

Each network runs its own background monitor loop in parallel.

---

## What it does

| Phase | Action |
|-------|--------|
| **Start** | Background CMS watcher: scales all deployments in `config-management-system` to **0** and force-deletes pods every **5s** |
| **Per network** | Background monitor loop (every **10s**) for each `--network` entry |
| **Per namespace (each tick)** | `scale_everything`: deploy/sts → 0; DaemonSet nodeSelector patch; Job parallelism 0; CronJob suspend |
| **Pods** | If pods remain: clear finalizers if present, force-delete each pod |
| **Network delete** | When every namespace under that network has **0 pods**, deletes the `Network` CR |
| **End** | `wait` for all background jobs; prints `Cleanup completed` |

Progress logs look like:

```text
[Net:pci-network-3430] ngpos-lab → 3 pod(s) remaining
[Net:pci-network-3430] rabbitmq-system → CLEAN ✅
[Net:pci-network-3430] ✅ ALL namespaces empty → deleting network
```

---

## Workload actions (`scale_everything`)

| Kind | Cleanup action |
|------|----------------|
| Deployment | `replicas=0` |
| StatefulSet | `replicas=0` |
| DaemonSet | Patch `nodeSelector: {cleanup: "true"}` (stops scheduling) |
| Job | `parallelism=0` |
| CronJob | `suspend=true` |

---

## CMS behavior (important)

- CMS (`config-management-system`) is scaled to **0** for the entire script run via a background watcher.
- **CMS is not restored** when the script exits — unlike `gdce_k8_cleanup_orchestrator.sh`.
- After cleanup, bring CMS back manually or run **`gdce_recovery.sh`** (step 2 scales CMS to 1).

---

## Backup and restore

| Topic | This script |
|-------|-------------|
| **Replica backup** | **No** — `REPLICA_FILE="replica-backup.json"` is defined but never written |
| **Restore** | Use `gdce_recovery.sh` or the orchestrator `--restore-replicas` mode separately |

If you need backup before drain, run the orchestrator backup first:

```bash
./Archive/gdce_k8_cleanup_orchestrator.sh --cluster <CLUSTER> --backup-ngpos-replicas --yes
```

---

## Typical workflow

```text
1. (Optional) Create replica backup via orchestrator
2. ./k8s_cleanup.sh --network <net>=<namespaces>
3. Confirm Network CR deleted and namespaces empty: kubectl get pods -n <ns>
4. ./gdce_recovery.sh   # or full recovery sequence
5. Manually verify CMS / platform health if needed
```

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| `Use --network net=ns1,ns2` | No arguments passed — add at least one `--network` |
| Pods keep respawning | CMS watcher may be insufficient; operators (RabbitMQ/Elastic/Mongo) are **not** suspended by this script — use orchestrator for operator-aware drain |
| Network never deletes | One namespace still has pods; check `kubectl get pods -n <ns>` |
| CMS still at 0 after script | Expected — run recovery or scale CMS deployments manually |
| Script hangs | Normal while draining; loops until all namespaces empty or network CR gone |
| Wrong network name | `kubectl get network` — name must match your cluster’s Network CR |

---

## Limitations

- **No replica backup** built in
- **No CMS restore** on exit
- **No operator CR suspend** (RabbitmqCluster / Elasticsearch / MongoDBCommunity keep reconciling)
- **No dry-run** or pre-run confirmation
- **No `--delete-network false`** — network is always deleted when namespaces are empty (`DELETE_NETWORK=true` hardcoded)
- Re-scales and re-deletes pods **every monitor tick** (10s) until empty — not a one-pass delete
- Uses current `kubectl` context only (no `--cluster` flag)

---

## Related scripts

| Script | Purpose |
|--------|---------|
| `gdce_recovery.sh` | Post-cleanup rehydration (pairs with this script) |
| `gdce_recovery_script_manual.md` | Manual for recovery script |
| `Archive/gdce_k8_cleanup_orchestrator.sh` | Full cleanup with backup, CMS restore, operator CR suspend |
| `Archive/gdce_k8_cleanup_sequence.sh` | Ordered pci → non-pci → fuel cleanup runbook |
| `Archive/k8s_cleanup.sh` | Identical archive copy of this script |
