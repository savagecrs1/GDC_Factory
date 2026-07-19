# 🔥 Kubernetes Network Cleanup & Rehydration Toolkit

This toolkit provides a **complete lifecycle solution for Kubernetes environments**:


It enables **safe, deterministic teardown and controlled recovery** of application and infrastructure stacks.

---

# 🔥 Kubernetes Network Cleanup & Teardown Script

This companion script performs **controlled teardown of Kubernetes network environments** by safely scaling down workloads and removing all dependent pods before deleting the network.

It is designed to work in conjunction with the rehydration script to provide a **complete lifecycle (cleanup → recovery)** workflow.

---

## 🚀 Features

- ✅ Handles **multi-network** cleanup with per-namespace mapping  
- ✅ Continuously enforces **replica scaling to 0** for:
  - Deployments
  - StatefulSets  
- ✅ Safely disables:
  - DaemonSets (via `nodeSelector`)  
  - Jobs (`parallelism=0`)  
  - CronJobs (`suspend=true`)  
- ✅ Intelligent **reconciler suppression**:
  - Scales down all deployments in `config-management-system`  
  - Prevents resource re-creation during cleanup  
- ✅ Active cleanup loop:
  - Detects pods in real time  
  - Force deletes only existing pods  
  - Removes finalizers if required  
- ✅ Progress visibility:
  - `namespace → X pods remaining`  
- ✅ Ensures **network deletion ONLY when all pods = 0**  
- ✅ Self-healing logic:
  - Re-applies scaling & cleanup until convergence  
- ✅ Safe operation:
  - No deletion of Deployments / StatefulSets / DaemonSets  
- ✅ Automatic termination:
  - Stops once all networks are deleted  
  - Cleans up background processes  

---

## 📋 Prerequisites

- `kubectl` configured with access to the cluster  
- `jq` installed (for replica backup/restore if used)

---

## 🧠 How It Works

1. **Reconciler Suppression**
   - All reconcilers are scaled down to prevent drift  

2. **Workload Neutralization**
   - Deployments / StatefulSets → scaled to 0  
   - DaemonSets → scheduling disabled  
   - Jobs → paused (`parallelism=0`)  
   - CronJobs → suspended  

3. **Active Cleanup Loop**
   - Finds remaining pods  
   - Deletes only existing pods  
   - Removes blocking finalizers  

4. **Continuous Enforcement**
   - Re-applies scaling and cleanup until:
     ```
     ALL namespaces → pod count = 0
     ```

5. **Network Deletion**
   - Network is deleted **only after full cleanup**

6. **Graceful Exit**
   - Background processes are terminated  
   - Script exits cleanly  

---

## ✅ Result

- ✅ No orphan pods  
- ✅ No reconciliation conflicts  
- ✅ Deterministic network deletion  
- ✅ Safe, non-destructive cleanup  

---

## 🛠️ Usage

### 🔹 Basic Cleanup

```bash
./k8s-cleanup.sh \
  --network net1=ns1,ns2,common-ns \
  --network net2=ns3,ns4

🔄 Kubernetes Cluster Rehydration & Recovery Script
This script performs a controlled recovery of Kubernetes clusters by restoring workloads, repairing infrastructure components, and validating network readiness.
It complements the cleanup script to provide a complete lifecycle (cleanup → recovery) workflow.

🚀 Features


✅ Targeted cleanup:

Removes Error, CrashLoopBackOff, Completed, and Evicted pods
Operates only on defined namespaces (safe, non-global)



✅ Intelligent recovery sequencing:

Restores critical system namespaces first
Ensures dependency order:
Gateway → DNS → Core Infra → Issuers → Kong → App workloads





✅ Gateway self-healing:

Detects Programmed=False gateways in kube-system
Automatically removes stuck finalizers
Deletes invalid gateways lacking:

Programmed status
Assigned address



✅ DNS stabilization:

Early restart of dns-config namespace
Ensures service discovery consistency before workload recovery


✅ Stateful workload protection:

Detects and repairs elastic-system StatefulSets
Auto-scales STS back from 0 replicas
Prevents cluster-level data system outages



✅ Kong ingress recovery:

Restarts all Kong deployments
Validates gateway readiness:

Programmed=True
Address present


Automatically removes broken gateways


✅ TLS reset:

Deletes kong-default-tls secrets
Forces certificate regeneration


✅ Replica restoration:

Restores Deployments/StatefulSets from replica-backup.json
Supports declarative scaling with action: scale



✅ Infrastructure refresh:

Re-runs config-management-system rollout to reconcile final state


✅ Observability:

Generates consolidated report:

Unhealthy pods
Invalid gateways
Missing namespaces



✅ Safe and idempotent:

No deletion of:

Deployments
StatefulSets
DaemonSets


Handles empty states gracefully


📋 Prerequisites

kubectl configured with cluster access
jq installed for JSON parsing


🧠 How It Works


Gateway Pre-Check (Step 0)

Identifies unhealthy gateways in kube-system
Removes blocking finalizers:
Programmed != True → patch finalizers=[]


DNS Recovery (Step 0A)

Restarts dns-config
Ensures DNS is stable before proceeding



Targeted Cleanup (Step 1)

Deletes only problematic pods:

Error / CrashLoopBackOff / Completed / Evicted



Core Services Initialization (Step 2–3)

Scales and restarts:

config-management-system
namespace-labeler



Infrastructure Recovery (Step 4)

Restores infra namespaces:

RabbitMQ, Elasticsearch, MongoDB


Special logic:
elastic-system STS replicas == 0 → scale to 1



TLS Reset (Step 4A)

Deletes Kong TLS secret
Triggers certificate regeneration


Issuer Recovery (Step 5)

Restarts kroger-issuer
Ensures certificate issuance pipeline is active


Ingress Recovery (Step 6)

Restarts Kong deployments
Validates gateways:
Programmed=True AND Address exists


Deletes invalid gateways


Workload Reinitialization (Step 7)

Deletes pods and services in target namespaces
Forces fresh scheduling


Replica Restoration (Step 8)

Re-applies scaling from backup:
replica-backup.json → desired state


Final Reconciliation (Step 8A)

Restarts config-management-system
Ensures cluster state matches intent


Final Health Report (Step 9)

Lists:

Unhealthy pods
Invalid gateways


Outputs results to report file


✅ Result

✅ Cluster restored to operational state
✅ Gateways fully programmed and routable
✅ DNS and ingress stabilized
✅ Stateful services recovered safely
✅ No orphan resources or partial recovery
✅ Deterministic, repeatable recovery process


📊 Output
rehydration-report.txt

Includes:

Unhealthy pods
Gateway issues
Missing namespaces


⚠️ Safety Guarantees

✅ Namespace-scoped operations only
✅ No destructive infra deletion
✅ Handles empty or already healthy states
✅ Safe to re-run (idempotent)


🔄 Full Lifecycle Summary


PhasePurposeCleanupRemove workloads and networks safelyRecoveryRestore full cluster functionality

📌 Summary
This toolkit provides:

Controlled teardown of Kubernetes workloads
Dependency-aware cluster recovery
Automated gateway and DNS repair
Safe workload restoration
Complete post-recovery validation
Deterministic, repeatable operations