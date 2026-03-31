# Google Distributed Cloud (Software-Only) on GCP

This project provisions a Google Distributed Cloud Software-Only (GDCSO) Hybrid cluster on Google Compute Engine (GCE) instances. It mimics a GDC Connected Servers environment using virtual resources in GCP.

## Architecture

This project uses an enterprise **Two-Tier (Foundation / Cluster) Architecture** to ensure you can scale to hundreds of ephemeral clusters without destroying your shared management infrastructure.

1. **The Foundation (`terraform/bootstrap`):** This layer provisions the permanent, shared infrastructure: the core VPC network, Cloud NAT, Service Accounts, and a dedicated, decoupled Admin Workstation (`gong-ws`). This workstation is used to safely orchestrate Anthos installations.
2. **Ephemeral Clusters (`terraform/`):** This layer is used as a template to rapidly stamp out ephemeral 3-node GDCSO cluster footprints (`node1`, `node2`, `node3`). It uses data sources to automatically attach these new nodes to the shared foundation.

## Prerequisites
- Google Cloud SDK (`gcloud`) installed and authenticated.
- HashiCorp Terraform CLI (`terraform`) installed.
- Ansible (`ansible`, `ansible-playbook`) installed.

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

Deploy the permanent networking and the dedicated Admin Workstation (`gong-ws`). **You only need to run this step once per GCP project.**

1. Navigate to the bootstrap directory:
   ```bash
   cd terraform/bootstrap
   ```
2. Initialize with partial configuration and apply:
   ```bash
   export PROVISIONING_SA_EMAIL="tf-provisioner@${PROJECT_ID}.iam.gserviceaccount.com"
   
   terraform init \
     -backend-config="bucket=gdc-on-gcp-${PROJECT_ID}-tfstate" \
     -backend-config="prefix=terraform/bootstrap/state" \
     -backend-config="impersonate_service_account=${PROVISIONING_SA_EMAIL}"

   terraform apply
   ```

## 3. Provision a Cluster Footprint

Deploy a 3-node virtual hardware footprint for your new cluster. Because this uses a separate state file, you can destroy these VMs later without deleting your shared admin workstation.

Before running Terraform, set an environment variable with your desired cluster name. You must use this variable when initializing Terraform so that each cluster gets its own dedicated state file in the Google Cloud Storage bucket.

1. Navigate to the cluster directory:
   ```bash
   cd ../../terraform
   ```
2. Export your cluster name:
   ```bash
   export CLUSTER_NAME="my-gdc-on-gcp-cluster"
   ```
3. Initialize Terraform with a parameterized state prefix (clearing the cache first ensures you don't conflict with previous deployments):
   ```bash
   export PROVISIONING_SA_EMAIL="tf-provisioner@${PROJECT_ID}.iam.gserviceaccount.com"
   rm -rf .terraform

   terraform init \
     -backend-config="bucket=gdc-on-gcp-${PROJECT_ID}-tfstate" \
     -backend-config="prefix=clusters/${CLUSTER_NAME}/state" \
     -backend-config="impersonate_service_account=${PROVISIONING_SA_EMAIL}"
   ```
4. Apply the infrastructure:
   ```bash
   terraform apply -var="cluster_name=${CLUSTER_NAME}"
   ```

## 4. Configuration & Deployment (Ansible)

Navigate to the `ansible` directory to run the orchestration playbook. This will dynamically read your Terraform state, configure the internal VxLAN network across your VMs, and asynchronously kick off the Anthos `bmctl` deployment from the shared workstation.

1. Navigate to the Ansible directory:
   ```bash
   cd ../ansible
   ```
2. Run the Ansible playbook:
   ```bash
   ansible-playbook create-cluster.yaml
   ```

---

## Monitoring and Accessing the Cluster

Because the Anthos deployment takes 15-20 minutes, the Ansible playbook launches it as a background process on the `gong-ws` workstation to protect it from SSH timeouts.

To monitor the installation progress in real-time, SSH into your dedicated admin workstation:

```bash
# Connect to the admin workstation
gcloud compute ssh gong-ws --tunnel-through-iap

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

You can also access the cluster from your local machine using standard GCP IAM identities via the GKE Connect Gateway. This requires impersonating the `gong-cluster-admin` service account.

1. Configure `gcloud` to impersonate the cluster admin service account:
   ```bash
   gcloud config set auth/impersonate_service_account gong-cluster-admin@gdc-on-gcp2.iam.gserviceaccount.com
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

## 5. Deleting a Cluster

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
   
   # Re-initialize to the correct state for this specific cluster
   terraform init \
     -backend-config="bucket=gdc-on-gcp-${PROJECT_ID}-tfstate" \
     -backend-config="prefix=clusters/${CLUSTER_NAME}/state" \
     -backend-config="impersonate_service_account=${PROVISIONING_SA_EMAIL}"
   
   # Destroy the resources
   terraform destroy -var="cluster_name=${CLUSTER_NAME}"
   ```

---

## 6. Validation & Compliance (TDD)

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
