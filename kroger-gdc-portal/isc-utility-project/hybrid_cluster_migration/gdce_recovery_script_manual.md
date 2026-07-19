# GDCE Cluster Rehydration — `gdce_recovery.sh`

Simple post-cleanup recovery script. Brings platform namespaces back up, refreshes Kong TLS, restarts ngpos workloads, and restores replica counts from a backup file.

> **Note:** For full hybrid-migration recovery (per-group backups, operator CR restore, health gates), use `Archive/gdce_k8_recovery_sequence.sh` and the orchestrator scripts instead. This script is a lighter, single-file runbook with hardcoded namespace lists.

---

## Prerequisites

| Requirement | Details |
|-------------|---------|
| **kubectl** | Configured and pointed at the target cluster |
| **jq** | Required for step 8 (restore from backup) |
| **Bash** | Git Bash or Linux shell (`set -euo pipefail`) |
| **Backup file** | `replica-backup.json` in the same directory as the script (optional but recommended for step 8) |

Verify access before running:

```bash
kubectl config current-context
kubectl get nodes
```

---

## Quick start

```bash
cd hybrid_cluster_migration
chmod +x gdce_recovery.sh   # once, if needed
./gdce_recovery.sh
```

The script runs **live** immediately — there is no `--dry-run` or confirmation prompt.

Output is printed to the terminal and appended to **`rehydration-report.txt`**.

---

## What it does (step by step)

| Step | Action |
|------|--------|
| **1** | Delete unhealthy/completed pods in platform namespaces (CMS, namespace-labeler, rabbitmq, elastic, mongo, kroger-issuer, Kong, etc.) |
| **2** | Scale `config-management-system` deployments to **1**, rollout restart |
| **3** | Scale `namespace-labeler` deployments to **2**, rollout restart |
| **4** | Infra check: `rabbitmq-system`, `elastic-system`, `mongodb`, `es` — restart deploys or scale STS in elastic-system if replicas=0 |
| **4A** | Delete `kong-default-tls` secrets in all Kong namespaces (lets cert-manager re-issue) |
| **5** | Scale `kroger-issuer` to **1**, rollout restart |
| **6** | Scale Kong namespaces to **1** replica each, rollout restart |
| **7** | Delete **all pods and services** in ngpos/application namespaces (hardcoded list) |
| **8** | Restore deploy/sts replica counts from `replica-backup.json` (only `action: scale` entries) |
| **8A** | Final rollout restart of `config-management-system` |
| **9** | Cluster-wide scan for unhealthy pods (`Error`, `CrashLoopBackOff`, `Pending`) → written to report |

Missing namespaces are skipped and logged in `rehydration-report.txt`.

---

## Files used

| File | Role |
|------|------|
| `replica-backup.json` | Input for step 8 — JSON array of `{namespace, kind, name, action, replicas, ...}` |
| `rehydration-report.txt` | Output report (created/overwritten each run) |

### Backup format (step 8)

Only entries with `"action": "scale"` are applied. Example:

```json
[
  {"namespace": "ngpos-shared", "kind": "Deployment", "name": "my-app", "action": "scale", "replicas": 3}
]
```

Entries for DaemonSet, Job, CronJob, or operator CR patches are **ignored** by this script.

---

## When to use this script

**Use `gdce_recovery.sh` when:**

- You have a legacy single-file `replica-backup.json` from an earlier cleanup
- You want a fast, one-command rehydration without the orchestrator tooling
- You are recovering a cluster that matches the hardcoded namespace lists in the script

**Use the orchestrator sequence instead when:**

- You have per-group backups (`replica-backup-pci.json`, etc.)
- You need operator CR restore (RabbitMQ / Elastic / Mongo)
- You want dry-run, confirmations, CMS sequencing, or step-by-step control

---

## Typical workflow

```text
1. Run cleanup (drain / backup workloads)
2. Run ./gdce_recovery.sh
3. Review rehydration-report.txt for remaining unhealthy pods
4. Fix any namespaces still failing manually
```

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| `jq: command not found` | Install jq; step 8 is skipped without it |
| `replica-backup.json` missing | Step 8 logs "Restoring replicas" but applies nothing — run cleanup backup first |
| Namespace `not found` in report | Expected if that NS does not exist on this cluster |
| Kong certs not Ready | Step 4A deletes stale TLS secrets; wait for cert-manager after step 6 |
| Ngpos apps still down | Step 7 only deletes pods/svc; step 8 must restore deploy replicas from backup |
| elastic-system STS at 0 | Step 4 scales STS to 1 if spec.replicas=0 |

---

## Limitations

- Namespace lists are **hardcoded** in the script — edit the arrays to match your cluster if needed
- No `--cluster` flag — uses current `kubectl` context only
- No dry-run mode
- Restore supports **scale** actions only (not `patch_ds`, `patch_job`, `patch_cronjob`, or operator CR entries)
- Does not pause or coordinate with CMS the way `gdce_k8_cleanup_orchestrator.sh` does

---

## Related scripts

| Script | Purpose |
|--------|---------|
| `Archive/gdce_k8_recovery_sequence.sh` | Full 15-step recovery runbook |
| `Archive/gdce_k8_recovery_orchestrator.sh` | Individual recovery modes and health steps |
| `Archive/gdce_k8_cleanup_sequence.sh` | Ordered cleanup + per-group backup |
| `k8s_cleanup.sh` | Legacy namespace drain |
