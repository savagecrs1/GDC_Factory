# Google Distributed Cloud (Software-Only) on GCP

This project provisions a Google Distributed Cloud Software-Only (GDCSO) Hybrid cluster on Google Compute Engine (GCE) instances. It mimics a GDC Connected Servers environment using virtual resources in GCP.

## Architecture

This project uses an enterprise **Two-Tier (Foundation / Cluster) Architecture** to ensure you can scale to hundreds of ephemeral clusters without destroying your shared management infrastructure.

1. **The Foundation (`terraform/bootstrap`):** This layer provisions the permanent, shared infrastructure: the core VPC network, Cloud NAT, Service Accounts, and a dedicated, decoupled Admin Workstation (`gong-ws`). This workstation is used to safely orchestrate Anthos installations.
2. **Ephemeral Clusters (`terraform/`):** This layer is used as a template to rapidly stamp out ephemeral 3-node GDCSO cluster footprints (`gong1`, `gong2`, `gong3`). It uses data sources to automatically attach these new nodes to the shared foundation.

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
2. Initialize and apply:
   ```bash
   terraform init
   terraform apply
   ```

## 3. Provision a Cluster Footprint

Deploy a 3-node virtual hardware footprint for your new cluster. Because this uses a separate state file, you can destroy these VMs later without deleting your shared admin workstation.

1. Navigate to the cluster directory:
   ```bash
   cd ../../terraform
   ```
2. Initialize and apply (you can override the cluster name if you want to deploy multiple side-by-side):
   ```bash
   terraform init
   terraform apply -var="cluster_name=abm-cluster-1"
   ```

## 4. Configuration & Deployment (Ansible)

Navigate to the `ansible` directory to run the orchestration playbook. This will dynamically read your Terraform state, configure the internal VxLAN network across your VMs, and asynchronously kick off the Anthos `bmctl` deployment from the shared workstation.

1. Navigate to the Ansible directory:
   ```bash
   cd ../ansible
   ```
2. Run the Ansible playbook:
   ```bash
   ansible-playbook playbook.yaml
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

# Tail the active deployment logs (replace cluster name if you changed it)
tail -f ~/bmctl-workspace/abm-cluster-1/log/create-cluster-*/create-cluster.log
```

Once the installation finishes, you can use the generated `kubeconfig` file on that same workstation to interact with your new cluster:

```bash
kubectl get nodes --kubeconfig /home/gdc/bmctl-workspace/abm-cluster-1/abm-cluster-1-kubeconfig
```