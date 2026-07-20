# Google Distributed Cloud (Software-Only) on GCP

This project provisions a Google Distributed Cloud Software-Only (GDCSO) Hybrid cluster on Google Compute Engine (GCE) instances. It mimics a GDC Connected Servers environment using virtual resources in GCP.

## Architecture

This project uses an enterprise **Two-Tier (Foundation / Cluster) Architecture** to ensure you can scale to hundreds of ephemeral clusters without destroying your shared management infrastructure.

1. **The Foundation (`terraform/bootstrap`):** This layer provisions the permanent, shared infrastructure: the core VPC network, Cloud NAT, Service Accounts, and a dedicated, decoupled Admin Workstation (`gem-admin-ws`). This workstation is used to safely orchestrate Anthos installations.
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
- HashiCorp Terraform CLI (`terraform`) installed.
- Ansible (`ansible`, `ansible-playbook`) installed.

### Required GCP Project Configurations & IAM Permissions

Before executing the setup scripts, ensure the following cloud-side prerequisites are met within your target GCP Project:

1. **User IAM Context:** The identity running the initial `./project-setup.sh` script must possess `Owner` privileges or a combination of the following administrative roles on the target project:
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

---

## 1. Setup Provisioning Service Account & State

The infrastructure is created by Terraform using service account impersonation. A bootstrap script is provided to create this dedicated service account, grant you permissions to impersonate it, and generate the necessary `terraform.tfvars` and `backend.tf` files for **both** the foundation and cluster layers.

1. Set your target GCP Project ID:
   ```bash
   export PROJECT_ID="your-gcp-project-id"
   ```
2. Run the setup script:
   ```bash
   ./project-setup.sh
   ```
   *This script creates a remote GCS bucket and seamlessly configures remote state for both Terraform environments.*

## 2. Deploy the Shared Foundation

Deploy the permanent networking and the dedicated Admin Workstation (`gem-admin-ws`). **You only need to run this step once per GCP project.**

1. Navigate to the bootstrap directory:
   ```bash
   cd terraform/bootstrap
   ```
2. Initialize with partial configuration and apply:
   ```bash
   export PROVISIONING_SA_EMAIL="tf-provisioner@${PROJECT_ID}.iam.gserviceaccount.com"

   terraform init \
     -backend-config="bucket=gem-${PROJECT_ID}-tfstate" \
     -backend-config="prefix=terraform/bootstrap/state" \
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
     -backend-config="prefix=terraform/edge-router/state" \
     -backend-config="impersonate_service_account=${PROVISIONING_SA_EMAIL}"

   terraform apply
   ```

## 4. Provision a Cluster Footprint

Deploy a 3-node virtual hardware footprint for your new cluster. Because this uses a separate state file, you can destroy these VMs later without deleting your shared admin workstation.

Before running Terraform, set an environment variable with your desired cluster name. You must use this variable when initializing Terraform so that each cluster gets its own dedicated state file in the Google Cloud Storage bucket.

1. Navigate to the cluster directory:
   ```bash
   cd ../
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

1. Navigate to the Ansible directory:
   ```bash
   cd ../ansible
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
   Navigate to the `terraform` directory and destroy the specific cluster's VMs:
   ```bash
   cd ../terraform

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
