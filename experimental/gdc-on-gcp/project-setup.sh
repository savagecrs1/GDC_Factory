#!/bin/bash
# project-setup.sh
# Creates a dedicated service account for provisioning and grants it the necessary permissions.

set -euo pipefail

if [[ -z "${PROJECT_ID:-}" ]]; then
  echo "🚨 Environment variable PROJECT_ID is not set."
  exit 1
fi

echo "🔄 Enabling essential APIs..."
gcloud services enable cloudresourcemanager.googleapis.com serviceusage.googleapis.com --project="${PROJECT_ID}"

# GCP APIs can sometimes take a moment to propagate globally after being enabled.
echo "⏳ Waiting for APIs to fully activate (10s)..."
sleep 10

PROVISIONING_SA_NAME="tf-provisioner"
PROVISIONING_SA_EMAIL="${PROVISIONING_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "🔄 Creating provisioning Service Account: ${PROVISIONING_SA_NAME}..."
gcloud iam service-accounts create ${PROVISIONING_SA_NAME} \
  --display-name="Terraform Provisioning SA for GDCSO" \
  --project="${PROJECT_ID}" || true

echo "🔄 Granting roles to the provisioning Service Account..."
# Required roles for Terraform to manage infrastructure
ROLES=(
  "roles/editor"
  "roles/iam.serviceAccountAdmin"
  "roles/compute.admin"
  "roles/resourcemanager.projectIamAdmin"
  "roles/serviceusage.serviceUsageAdmin"
)

for role in "${ROLES[@]}"; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${PROVISIONING_SA_EMAIL}" \
    --role="${role}" \
    --condition=None \
    --no-user-output-enabled
done

# Allow your user account to impersonate this service account
USER_EMAIL=$(gcloud config get-value account)
echo "🔄 Allowing user ${USER_EMAIL} to impersonate ${PROVISIONING_SA_EMAIL}..."
gcloud iam service-accounts add-iam-policy-binding "${PROVISIONING_SA_EMAIL}" \
  --member="user:${USER_EMAIL}" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --project="${PROJECT_ID}" \
  --no-user-output-enabled

echo "✅ Provisioning Service Account setup complete."

echo "🔄 Generating terraform.tfvars files..."
cat <<EOF > terraform/bootstrap/terraform.tfvars
project_id            = "${PROJECT_ID}"
EOF

cat <<EOF > terraform/terraform.tfvars
project_id            = "${PROJECT_ID}"
provisioning_sa_email = "${PROVISIONING_SA_EMAIL}"
EOF
echo "✅ terraform.tfvars created successfully."

echo "🔄 Creating Terraform state bucket..."
gcloud storage buckets create "gs://gdc-on-gcp-${PROJECT_ID}-tfstate" --project="${PROJECT_ID}" --location="us-central1" || true
gcloud storage buckets update "gs://gdc-on-gcp-${PROJECT_ID}-tfstate" --versioning || true

echo "🔄 Generating backend.tf files..."
cat <<EOF > terraform/bootstrap/backend.tf
terraform {
  backend "gcs" {
    bucket                      = "gdc-on-gcp-${PROJECT_ID}-tfstate"
    prefix                      = "terraform/bootstrap/state"
    impersonate_service_account = "${PROVISIONING_SA_EMAIL}"
  }
}
EOF

cat <<EOF > terraform/backend.tf
terraform {
  backend "gcs" {
    bucket                      = "gdc-on-gcp-${PROJECT_ID}-tfstate"
    prefix                      = "terraform/cluster/state"
    impersonate_service_account = "${PROVISIONING_SA_EMAIL}"
  }
}
EOF
echo "✅ backend.tf created successfully. Terraform will automatically use GCS for remote state!"

echo "=========================================================================================="
echo "🚀 Bootstrap complete! Please follow these steps to deploy your environment:"
echo "1. Deploy the foundation: cd terraform/bootstrap && terraform init && terraform apply"
echo "2. Deploy the cluster VMs: cd ../ && terraform init && terraform apply -var='cluster_name=abm-cluster-1'"
echo "=========================================================================================="