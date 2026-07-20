# Google Distributed Cloud (Software-Only) on GCP

This project provisions a Google Distributed Cloud Software-Only (GDCSO) Hybrid cluster on Google Compute Engine (GCE) instances. It mimics a GDC Connected Servers environment using virtual resources in GCP.

## Architecture

This project uses an enterprise **Two-Tier (Foundation / Cluster) Architecture** to ensure you can scale to hundreds of ephemeral clusters without destroying your shared management infrastructure.

1. **The Foundation (`terraform/foundation`):** This layer provisions the permanent, shared infrastructure: the core VPC network, Cloud NAT, Service Accounts, and a dedicated, decoupled Admin Workstation (`gem-admin-ws`). This workstation is used to safely orchestrate Anthos installations.
2. **Ephemeral Clusters (`terraform/`):** This layer is used as a template to rapidly stamp out ephemeral 3-node GDCSO cluster footprints (`node1`, `node2`, `node3`). It uses data sources to automatically attach these new nodes to the shared foundation.
3. **The Edge Router (`terraform/edge-router`):** This layer provides an optional, dedicated ingress VM (`e2-small`) that participates in all emulated secondary networks (VXLANs). It allows you to route traffic from your local workstation directly into isolated cluster VLANs (like MetalLB VIPs) using tools like Traefik or a SOCKS5 proxy, bypassing the Kubernetes control plane.

### 💻 GDC Hardware Profiles vs. GCP Machine Size Equivalents

| GDC Physical Hardware | GDC Node Profile | Physical Specs (Per Node) | GCP Machine Type Equivalent | GCP Instance Specs | Recommended Use Case |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Dell PowerEdge XR11** | **Medium** | 32 vCPU, 128 GB RAM | **`n2-standard-32`** | 32 vCPU, 128 GB RAM | **1:1 Direct Match** for GDC XR11 Medium Edge Nodes. |
| **Dell PowerEdge XR11** | **Scaled Dev** | 16 vCPU, 64 GB RAM | **`n2-standard-16`** | 16 vCPU, 64 GB RAM | 50% scale profile for quota-constrained dev labs. |
| **Dell 8K / XR8000** | **Medium** | 64 vCPU, 256 GB RAM | **`n2-standard-64`** | 64 vCPU, 256 GB RAM | **1:1 Direct Match** for Dell 8K / XR8000 GDC Sleds. |
| **Dell 8K / XR8000** | **Medium (High-Mem)** | 32 vCPU, 256 GB RAM | **`n2-highmem-32`** | 32 vCPU, 256 GB RAM | Memory-heavy workloads (AI/ML models, data pipelines). |
| **Virtual Sandbox** | **Micro / Lab** | 8 vCPU, 32 GB RAM | **`n2-standard-8`** | 8 vCPU, 32 GB RAM | Low-quota dev testing & rapid CI/CD validation. |

## Prerequisites
- Google Cloud SDK (`gcloud`) installed and authenticated.
- **Google Cloud Auth**: Run both `gcloud auth login` AND `gcloud auth application-default login` (required for Terraform GCS backend impersonation).
- Google Cloud SDK `gke-gcloud-auth-plugin` component installed (required for local connection gateway auth: `gcloud components install gke-gcloud-auth-plugin`).
- HashiCorp Terraform CLI (`terraform`) installed.
- Ansible (`ansible`, `ansible-playbook`) installed.
- Node.js & npm installed (for web portals) or Docker Desktop (for containerized launch).

### Required GCP Project Configurations & IAM Permissions

Before executing the setup scripts, ensure the following cloud-side prerequisites are met within your target GCP Project:

1. **User IAM Context:** The identity running `./project-setup.sh` must possess `Owner` privileges or a combination of the following administrative roles on the target project:
   - **Project IAM Admin** (`roles/resourcemanager.projectIamAdmin`)
   - **Service Account Admin** (`roles/iam.serviceAccountAdmin`)
   - **Storage Admin** (`roles/storage.admin`)
2. **Active Billing:** The project must be linked to an active billing account to support GCE local SSD and nested virtualization SKU allocations.
3. **Organization Policy Exemptions:** If deploying within an enterprise folder, ensure the following constraints are relaxed or permit external resource access:
   - `constraints/compute.trustedImageProjects` (must allow GDC system image projects)
   - `constraints/gcp.restrictServiceUsage` (must permit `edgecontainer.googleapis.com` and `gkeconnect.googleapis.com`)
   - `constraints/iam.disableServiceAccountKeyCreation`
   - `constraints/compute.requireOsLogin`
   - `constraints/compute.vmCanIpForward`
   - `constraints/compute.requireShieldedVm`

> 💡 **Quick Pre-flight Check**: Run `./verify-setup.sh` in the project root to automatically check all host dependencies and authentication before starting.

---

## 🌐 Hybrid PCI Network Architecture & Presets

This portal natively supports the three-tier network architecture validated with Kroger's QSA (Coalfire), retiring restrictive kernel sandboxing (gVisor) in favor of high-performance `runc` containers mapped to dedicated Multus VLAN interfaces:

| Network Tier | Network Name | VLAN ID | Node CIDR | Pod CIDR | VIP / LB Pool | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **k8s Default** | `default` | `3030` | `192.168.120.12/30` | `10.0.2.0/23` | N/A | Primary GKE Control Plane & Platform Management. |
| **Non-PCI Secondary** | `non-pci-network-3130` | `3130` | `192.168.88.12/30` | `172.16.0.0/16` | `192.168.88.65/26` | Island-Mode Store Operations & Out-of-Scope Apps. |
| **PCI Secondary** | `pci-network-3430` | `3430` | `192.168.80.12/30` | `172.18.0.0/16` | `192.168.80.65/26` | Island-Mode CDE, NGPOS, and Fuel Payment Workloads. |

---

## 🚀 Getting Started: Setting Up & Testing the Kroger UI

### Option A: Local Script Launcher (Recommended)
```bash
./launch-kroger.sh
```
Open **http://localhost:3001** in your web browser.

### Option B: Containerized Deployment via Docker Compose
```bash
docker-compose -f docker-compose.kroger.yml up -d --build
```
Open **http://localhost:3001** in your web browser.

---

### 🧪 How to Test the Kroger UI Features

1. **Select Target GCP Project**:
   - In the top header bar, select your **GCP Project ID** (e.g. `kroger-store-test1` or `core-edge-dm1`).

2. **Run 1-Click E2E Test Suite (Recommended First Test)**:
   - Click the **🚀 E2E Test Harness** button in the top right navigation bar.
   - Click **Start End-to-End Suite**.
   - Watch the stepper execute all 5 phases:
     * **Phase 1**: Infrastructure Provisioning
     * **Phase 2**: VM & Workload Ingestion
     * **Phase 3**: Stress & Database Benchmarks
     * **Phase 4**: AI Sentinel Watchdog Audit
     * **Phase 5**: **Automated Teardown** (automatically decommissions all GCP resources when complete).

3. **Test Manual Teardown & Cluster Management**:
   - On the main **Cluster Environment Health** banner, click the red **Tear Down Cluster** button (`Trash2` icon) to test manual cluster decommissioning.

4. **Test Real-Time Operations Console**:
   - Click the **Operations Console** pill (`Active: X`) in the top navigation bar to open the live background log streaming panel.

---

## CLI Deployment Workflow

### 1. Setup Provisioning Service Account & State

The infrastructure is created by Terraform using service account impersonation. A setup script creates this dedicated service account (`tf-provisioner`), grants impersonation permissions, and creates the remote GCS state bucket:

1. Set your target GCP Project ID:
   ```bash
   export PROJECT_ID="your-gcp-project-id"
   ```
2. Run the setup script:
   ```bash
   ./project-setup.sh "${PROJECT_ID}"
   ```
   *This script creates the remote GCS bucket `gem-${PROJECT_ID}-tfstate` and configures Terraform backends.*

### 2. Deploy the Shared Foundation

Deploy the permanent networking, VPC NAT, and the dedicated Admin Workstation (`gem-admin-ws`). **You only need to run this step once per GCP project.**

1. Navigate to the foundation directory:
   ```bash
   cd terraform/foundation
   ```
2. Initialize with backend configuration and apply:
   ```bash
   export PROVISIONING_SA_EMAIL="tf-provisioner@${PROJECT_ID}.iam.gserviceaccount.com"

   terraform init \
     -backend-config="bucket=gem-${PROJECT_ID}-tfstate" \
     -backend-config="prefix=foundation/state" \
     -backend-config="impersonate_service_account=${PROVISIONING_SA_EMAIL}"

   terraform apply
   ```

## 3. Deploy the Edge Router (Optional)

If you plan on accessing secondary networks (Island Mode) from your local workstation, deploy the Edge Router. This creates a dedicated VM that sits on the VXLAN fabric and proxies incoming traffic.

1. Navigate to the edge-router directory:
   ```bash
   cd ../edge-router
   ```
2. Initialize and apply:
   ```bash
   export PROVISIONING_SA_EMAIL="tf-provisioner@${PROJECT_ID}.iam.gserviceaccount.com"

   terraform init \
     -backend-config="bucket=gem-${PROJECT_ID}-tfstate" \
     -backend-config="prefix=edge-router/state" \
     -backend-config="impersonate_service_account=${PROVISIONING_SA_EMAIL}"

   terraform apply
   ```

### 4. Provision a Cluster Footprint

Deploy a 3-node virtual hardware footprint for your new cluster. Because this uses a separate state file, you can destroy these VMs later without deleting your shared admin workstation.

Before running Terraform, set an environment variable with your desired cluster name. You must use this variable when initializing Terraform so that each cluster gets its own dedicated state file in the Google Cloud Storage bucket.

1. Navigate to the cluster directory:
   ```bash
   cd ../cluster
   ```
2. Export your cluster name:
   ```bash
   export CLUSTER_NAME="my-gdc-on-gcp-cluster"
   ```
3. Initialize Terraform with a parameterized state prefix (using -reconfigure ensures you don't conflict with previous deployments):
   ```bash
   export PROVISIONING_SA_EMAIL="tf-provisioner@${PROJECT_ID}.iam.gserviceaccount.com"

   terraform init -reconfigure \
     -backend-config="bucket=gem-${PROJECT_ID}-tfstate" \
     -backend-config="prefix=clusters/${CLUSTER_NAME}/state" \
     -backend-config="impersonate_service_account=${PROVISIONING_SA_EMAIL}"
   ```
4. Apply the infrastructure:
   ```bash
   terraform apply -var="cluster_name=${CLUSTER_NAME}"
   ```

## 5. Configuration & Deployment (Ansible)

The configuration is split into two distinct playbooks to support the Two-Tier architecture: one to configure the permanent foundation, and another to orchestrate ephemeral clusters.

### Foundation Phase
This playbook installs the required binaries (`kubectl`, `bmctl`, Docker), sets up the user environment, and configures the Edge Router. **You only need to run this step once per GCP project.**

1. Navigate to the Ansible directory (stepping out of the `terraform/cluster` directory):
   ```bash
   cd ../../ansible
   ```
2. Run the foundation playbook:
   ```bash
   ansible-playbook setup-foundation.yaml
   ```

### Cluster Phase
This playbook dynamically reads your Terraform state, configures the internal VxLAN network across your new cluster VMs, and asynchronously kicks off the Anthos `bmctl` deployment from the shared workstation.

1. Run the cluster playbook:
   ```bash
   ansible-playbook create-cluster.yaml
   ```

---

## Monitoring and Accessing the Cluster

Because the Anthos deployment takes 15-20 minutes, the Ansible playbook launches it as a background process on the `gem-admin-ws` workstation to protect it from SSH timeouts.

To monitor the installation progress in real-time, SSH into your dedicated admin workstation:

```bash
# Connect to the admin workstation
gcloud compute ssh gem-admin-ws --tunnel-through-iap

# Switch to the dedicated Anthos service user
sudo su - gdc

# Tail the active deployment logs
tail -f ~/bmctl-workspace/${CLUSTER_NAME}/log/create-cluster-*/create-cluster.log
```

Once the installation finishes, you can use the generated `kubeconfig` file on that same workstation to interact with your new cluster:

```bash
kubectl get nodes --kubeconfig /home/gdc/bmctl-workspace/${CLUSTER_NAME}/${CLUSTER_NAME}-kubeconfig
```

### Local Access via GKE Connect Gateway

You can also access the cluster from your local machine using standard GCP IAM identities via the GKE Connect Gateway. This requires impersonating the `gem-cluster-admin` service account.

1. Configure `gcloud` to impersonate the cluster admin service account for your active project:
   ```bash
   gcloud config set auth/impersonate_service_account gem-cluster-admin@${PROJECT_ID}.iam.gserviceaccount.com
   ```
2. Get the cluster credentials:
   ```bash
   gcloud container fleet memberships get-credentials ${CLUSTER_NAME}
   ```
3. You can now use `kubectl` locally:
   ```bash
   kubectl get nodes
   ```
4. To stop impersonating the service account:
   ```bash
   gcloud config unset auth/impersonate_service_account
   ```

---

## 6. Deleting a Cluster

To safely delete an individual cluster, you must first unregister it from Google Cloud before destroying its VMs. This ensures a clean state for your GCP project and prevents orphan resources.

1. **Step 1: Unregister with Ansible**
   Navigate to the `ansible` directory and run the cleanup playbook:
   ```bash
   cd ansible
   ansible-playbook cleanup.yaml -e "cluster_name=${CLUSTER_NAME}"
   ```
   *This command runs `bmctl reset` from the Admin Workstation to unregister the cluster from GKE Hub and clean up its nodes.*

2. **Step 2: Destroy with Terraform**
   Navigate to the cluster subdirectory and destroy the specific cluster's VMs:
   ```bash
   cd ../terraform/cluster

   # Re-initialize to the correct state for this specific cluster using the designated state bucket
   terraform init -reconfigure \
     -backend-config="bucket=gem-${PROJECT_ID}-tfstate" \
     -backend-config="prefix=clusters/${CLUSTER_NAME}/state" \
     -backend-config="impersonate_service_account=${PROVISIONING_SA_EMAIL}"

   # Destroy the resources
   terraform destroy -var="cluster_name=${CLUSTER_NAME}"
   ```

*(Note: To delete the optional Edge Router, you must first navigate to `terraform/edge-router`, edit `main.tf` to set `deletion_protection = false`, apply the change, and then run `terraform destroy`).*

---

## 7. Validation & Compliance (TDD)

This project includes a comprehensive E2E validation suite using **[Kyverno Chainsaw](https://kyverno.github.io/chainsaw/)** to ensure your ABM cluster accurately emulates the workload restrictions of GDC Connected Servers.

### Running the Tests
Ensure you have the Chainsaw CLI installed and your `kubectl` context is pointed to the target cluster (either directly or via the GKE Connect Gateway).

1. From the project root, run the test suite:
   ```bash
   chainsaw test tests/e2e --config tests/e2e/chainsaw-configuration.yaml
   ```

### Manual Cleanup
All resources created by the test suite are labeled with `testsuite: "true"`. If a test run is interrupted, you can manually purge all test resources:

```bash
kubectl delete pods,namespaces -l testsuite=true --all-namespaces
```

---

---

## 💻 GDC Web Portals & Sentinel Self-Healing

This project includes dual React-based portal control panels (`ui` on port 3002 and `ui-kroger` on port 3001) that emulate GDC edge portal experiences.

### Features
1. **Cluster Provisioner Stepper**: Visual stepper tracking GCP setup, network foundation layers, GCE nodes, `bmctl` deployment, and retail app pre-deploys.
2. **Sentinel AI Watchdog**: Automatically triages deployment failures (e.g. Org policy blocks, unlinked billing, credentials errors), parses logs, and offers an **"Auto-Fix with Sentinel"** automated remediation helper.
3. **Resumable Builds**: Failed deployments can be auto-remediated and resumed directly from the failed stage instead of rebuilds from scratch.
4. **Operations Console**: Real-time navbar status indicator tracking active background provisioning, teardowns, and jobs with one-click log streaming.
5. **Container-Level Smooth Terminal Scroll**: Isolates log streaming scroll to the inner console window without jumping the outer browser viewport.
6. **GDC Interactive Web Console**: Securely access any virtual machine container terminal on the edge cluster using IAP-tunneled `kubectl exec` shells directly from your browser.
7. **Kroger Secondary Networks (IPAM)**: Customize store VLAN configs (VLAN Name, ID, Subnet, Gateway, VIP Range, Pod CIDR) directly inside the Kroger provisioning wizard.
8. **Dynamic Header Navigation**: Access sub-pages and wizards with instant return capabilities using a unified "Return to Fleet Hub" header button.

---

## 🛡️ Upcoming Capabilities & Architecture Roadmap

### 1. 🌐 GDC Connectivity & Network Diagnostics Suite
Allows store engineers to test and troubleshoot GDC network communications before and after cluster provisioning via a **"Test GDC Connectivity"** button:
* **Google Cloud APIs**: Tests `googleapis.com:443`, `accounts.google.com:443`, `oauth2.googleapis.com:443`.
* **GKE Connect & QBone Tunnel**: Validates `gkeconnect.googleapis.com:443` & `gkehub.googleapis.com:443` with ALPN `h2` HTTP/2 protocol negotiation to detect Deep Packet Inspection (DPI) proxy interference.
* **VLAN Tagging & Switch Infrastructure**: Probes secondary VLAN subinterfaces (e.g., `eth0.123`) with 802.1Q ARP/DHCP tests to detect switch ports incorrectly set to Access Mode instead of Trunk Mode.
* **NAT Egress & MTU Fragmentation**: Verifies Cloud NAT egress IP (`curl ifconfig.me`) and tests 1400-byte ICMP packet fragmentation to prevent QBone tunnel drops.
* **Inter-Node Subnet Ports**: Verifies internal VPC subnet ports (`6443` API, `10250` Kubelet, `7946` VXLAN/Serf).
* **Pinpointed Troubleshooting UI**: Displays exact failure location (DNS, Firewall, Switch Port, NAT, MTU) with specific fix instructions.

### 2. 🛡️ gVisor (`runsc`) Sandbox Simulation (`b/523229462`)
Simulates physical GDC container sandboxing using gVisor:
* **What It Is**: gVisor is a Go-based application kernel that intercepts container system calls, isolating untrusted store workloads from the host Linux kernel.
* **How It Works**: Registers `runsc` as an additional CRI runtime handler in `/etc/containerd/config.toml` alongside standard `runc`. Automatically configures `--platform=systrap` or `--platform=kvm` based on host virtualization capabilities per internal specification `b/523229462`.
* **Dynamic Workload Toggle**: Allows toggling `"Sandbox with gVisor"` ON/OFF per workload (adding `runtimeClassName: gvisor` to Pod specs). **Requires 0 cluster recreations**—workloads switch dynamically via standard rolling pod updates.

### 3. 💾 `ReadWriteMany` (RWX) Shared Storage Simulation
* **Robin.io vs. GDC Storage**: While typical Robin.io installations restrict volumes to `ReadWriteOnce` (RWO) block mode, GDC supports POSIX-compliant `ReadWriteMany` (RWX) shared file storage.
* **Feature Roadmap**: Adds a `shared-rwx` StorageClass allowing multiple POS checkout microservices across different nodes to concurrently read and write to the same persistent volume.

