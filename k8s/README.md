# ☸️ Kubernetes GitOps Workloads & RootSync Configurations

This directory provides standardized Kubernetes test workloads and Anthos Config Management (`RootSync`) manifests for validating automated GitOps continuous reconciliation across Google Distributed Cloud (GDC) bare-metal edge nodes.

## 📁 Directory Structure
* **`root-sync/`**: Contains administrative GitOps synchronization definitions (`RootSync`).
  * `root-sync-demo.yaml`: Points Anthos Config Management to this repository's `k8s/workloads/` folder to continuously reconcile demo deployments every 60 seconds.
* **`workloads/`**: Contains test Kubernetes applications designed for edge deployment verification.
  * `demo-workloads.yaml`: NGINX 3-replica web deployment with NodePort `30080` service and a Redis in-memory cache pod.

---

## 🔄 How RootSync Works
Anthos Config Management runs an in-cluster controller (`reconciler`) that continuously polls your target Git repository directory. When you apply a `RootSync` object, you tell Kubernetes:
1. **Repository URL**: `https://github.com/savagecrs1/GDC_Factory.git`
2. **Target Directory**: `k8s/workloads/`
3. **Reconciliation Period**: Check every `60s` for git commits or drift.

If someone manually deletes a pod or modifies a ConfigMap on the bare-metal servers using `kubectl`, the ConfigSync controller automatically detects the configuration drift and self-heals the cluster back to the state declared in Git!

---

## 🖥️ Utilizing Config Sync in the GDC Portal UI

The GDC Portal GUI makes testing and orchestrating GitOps effortless:

1. **Navigate to GitOps Config Sync**: Open your browser to `http://localhost:3000` (Template UI) or `http://localhost:3001` (Kroger UI) and click the **`GitOps Config Sync`** tab in the navbar.
2. **1-Click Preset Launchers**: In the top section (**Preset Workload Profiles**), you will see out-of-the-box launcher buttons:
   * Click **`☸️ Standard K8s Demo Workloads`** to apply `root-sync-demo.yaml` across your bare-metal cluster.
   * The portal invokes `kubectl apply` over SSH/API and streams live reconciliation feedback directly to your screen.
3. **Live Commit Drift Detection**: Watch the status indicator turn **`Synced (🟢 0s drift)`** as your NGINX and Redis pods provision automatically across `node-1`, `node-2`, and `node-3`!
4. **Manual RootSync Editor**: You can also use the interactive YAML editor on the left side of the screen to point the cluster to your own custom GitHub repositories or branches on the fly.
