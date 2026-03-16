# Google Distributed Cloud (Software-Only) on GCP

This project provisions a 3-node Google Distributed Cloud Software-Only (GDCSO) Hybrid cluster on Google Compute Engine (GCE) instances. It mimics a GDC Connected Servers environment using virtual resources in GCP.

## Prerequisites
- Google Cloud SDK (`gcloud`) installed and authenticated.
- HashiCorp Terraform CLI (`terraform`) installed.
- Ansible (`ansible`, `ansible-playbook`) installed.

## 1. Setup Provisioning Service Account
The cluster infrastructure is created by Terraform using service account impersonation. A script is provided to create this dedicated service account, grant you permissions to impersonate it, and generate a `terraform.tfvars` file and a `backend.tf` file so Terraform handles the impersonation natively and stores the state securely in a newly created GCS bucket.

1. Set your target GCP Project ID:
   ```bash
   export PROJECT_ID="your-gcp-project-id"
   ```
2. Run the setup script:
   ```bash
   ./project-setup.sh
   ```
   *This script will create `terraform/terraform.tfvars` containing your project ID and the new service account email. It will also create `terraform/backend.tf` configuring a GCS bucket for remote state storage.*

## 2. Infrastructure Setup (Terraform)
Navigate to the `terraform` directory to provision the GCE VMs, enable necessary GCP APIs, and create the `baremetal-gcr` service account used by Anthos.

1. Navigate to the Terraform directory:
   ```bash
   cd terraform
   ```
2. Initialize Terraform:
   ```bash
   terraform init
   ```
3. Apply the infrastructure changes:
   ```bash
   terraform apply
   ```
4. Verify the infrastructure is created. Terraform will output the node IP addresses. *(Note: The `baremetal-gcr` service account key is securely generated dynamically later during the Ansible run, not stored in Terraform state).*

## 3. Configuration & Deployment (Ansible)
Navigate to the `ansible` directory to run the Ansible playbook. This will:
- Set up VxLAN across all VMs for Layer 2 connectivity.
- Prepare the Admin Workstation (`kubectl`, `bmctl`, Docker, Anthos SA Key).
- Configure SSH access between the workstation and cluster nodes using the configurable `gdc` user.
- Deploy the 3-node GDCSO Hybrid cluster via `bmctl`.

1. Navigate to the Ansible directory:
   ```bash
   cd ../ansible
   ```
2. Run the Ansible playbook:
   ```bash
   ansible-playbook playbook.yaml
   ```

## Accessing the Cluster
Once the Ansible playbook finishes successfully, you can SSH into the admin workstation to interact with the cluster:

1. Retrieve the workstation's external IP from Terraform outputs:
   ```bash
   cd ../terraform
   terraform output workstation_public_ip
   ```
2. SSH into the workstation (typically handled via `gcloud`):
   ```bash
   gcloud compute ssh abm-cluster-ws
   ```
3. Switch to the configured `gdc` user (which has passwordless sudo and owns the cluster config):
   ```bash
   sudo su - gdc
   ```
4. Verify cluster nodes:
   ```bash
   kubectl get nodes --kubeconfig /home/gdc/bmctl-workspace/abm-cluster/abm-cluster-kubeconfig
   ```
