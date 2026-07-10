#!/bin/bash
# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# project-setup.sh
# Creates a dedicated service account for provisioning and grants it the necessary permissions.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-${1:-}}"
if [[ -z "${PROJECT_ID}" ]]; then
  echo "🚨 Environment variable PROJECT_ID (or positional argument $1) is not set."
  exit 1
fi

echo "🔍 Verifying GCP project '${PROJECT_ID}' exists and is accessible..."
if ! gcloud projects describe "${PROJECT_ID}" >/dev/null 2>&1; then
  echo "❌ ERROR: Project '${PROJECT_ID}' does not exist or you do not have permission to access it!"
  echo "💡 Tip: Check for typos in the project ID. For example, use 'kroger-store-test1' instead of 'gem-kroger-store-test1'."
  exit 1
fi

echo "💳 Checking billing status for '${PROJECT_ID}'..."
if ! gcloud beta billing projects describe "${PROJECT_ID}" --format="value(billingEnabled)" | grep -q "True"; then
  echo "⚠️ Billing is not enabled on '${PROJECT_ID}'. Attempting to link billing account..."
  if [[ -n "${BILLING_ACCOUNT_ID:-}" ]]; then
    BILLING_ACC="${BILLING_ACCOUNT_ID##*/}"
  else
    BILLING_ACC=$(gcloud billing accounts list --format="value(name)" --filter="open=true" | head -n 1 || true)
    BILLING_ACC="${BILLING_ACC##*/}"
  fi
  if [[ -n "$BILLING_ACC" ]]; then
    gcloud beta billing projects link "${PROJECT_ID}" --billing-account="${BILLING_ACC}" || {
      echo "❌ ERROR: Failed to link billing account '${BILLING_ACC}' on '${PROJECT_ID}'."
      exit 1
    }
  else
    echo "❌ ERROR: No billing account provided or found. Cannot enable billing on '${PROJECT_ID}'."
    exit 1
  fi
fi

echo "🔄 Enabling essential APIs..."
gcloud services enable cloudresourcemanager.googleapis.com serviceusage.googleapis.com orgpolicy.googleapis.com --project="${PROJECT_ID}"

# GCP APIs can sometimes take a moment to propagate globally after being enabled.
echo "⏳ Waiting for APIs to fully activate (10s)..."
sleep 10

echo "🔄 Relaxing Org Policy constraints for GDCSO infrastructure deployment..."
gcloud org-policies reset constraints/iam.disableServiceAccountKeyCreation --project="${PROJECT_ID}" --quiet 2>/dev/null || true
gcloud org-policies reset constraints/compute.requireOsLogin --project="${PROJECT_ID}" --quiet 2>/dev/null || true
gcloud org-policies reset constraints/compute.vmCanIpForward --project="${PROJECT_ID}" --quiet 2>/dev/null || true
gcloud org-policies reset constraints/compute.requireShieldedVm --project="${PROJECT_ID}" --quiet 2>/dev/null || true

PROVISIONING_SA_NAME="tf-provisioner"
PROVISIONING_SA_EMAIL="${PROVISIONING_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "🔄 Creating provisioning Service Account: ${PROVISIONING_SA_NAME}..."
gcloud iam service-accounts create ${PROVISIONING_SA_NAME} \
  --display-name="Terraform Provisioning SA for GDCSO" \
  --project="${PROJECT_ID}" || true

echo "⏳ Waiting 15s for IAM Service Account propagation across GCP..."
sleep 15

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
  echo "  -> Assigning ${role}..."
  n=0
  until [ "$n" -ge 5 ]; do
    gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
      --member="serviceAccount:${PROVISIONING_SA_EMAIL}" \
      --role="${role}" \
      --condition=None \
      --no-user-output-enabled && break
    n=$((n+1))
    echo "  ⚠️ IAM propagation delay detected, retrying in 5s ($n/5)..."
    sleep 5
  done
done

# Allow your user account to impersonate this service account
USER_EMAIL=$(gcloud config get-value account)
echo "🔄 Allowing user ${USER_EMAIL} to impersonate ${PROVISIONING_SA_EMAIL}..."
n=0
until [ "$n" -ge 5 ]; do
  gcloud iam service-accounts add-iam-policy-binding "${PROVISIONING_SA_EMAIL}" \
    --member="user:${USER_EMAIL}" \
    --role="roles/iam.serviceAccountTokenCreator" \
    --project="${PROJECT_ID}" \
    --no-user-output-enabled && break
  n=$((n+1))
  echo "  ⚠️ SA token creator binding delay, retrying in 5s ($n/5)..."
  sleep 5
done

echo "⏳ Verifying IAM impersonation propagation for ${PROVISIONING_SA_EMAIL}..."
n=0
until [ "$n" -ge 12 ]; do
  if gcloud auth print-access-token --impersonate-service-account="${PROVISIONING_SA_EMAIL}" >/dev/null 2>&1; then
    echo "✅ IAM token impersonation successfully verified!"
    break
  fi
  n=$((n+1))
  echo "  ⚠️ Waiting for token creator permission to propagate across IAM endpoints ($n/12)..."
  sleep 5
done

echo "✅ Provisioning Service Account setup complete."

echo "🔑 Uploading local SSH public key to GCP project metadata..."
PUB_KEY=$(cat ~/.ssh/google_compute_engine.pub 2>/dev/null || cat ~/.ssh/id_ed25519.pub 2>/dev/null || cat ~/.ssh/id_rsa.pub 2>/dev/null || true)
if [[ -n "$PUB_KEY" ]]; then
  echo "${USER}:${PUB_KEY}" > /tmp/gcp_ssh_key.pub
  gcloud compute project-info add-metadata --project="${PROJECT_ID}" --metadata-from-file=ssh-keys=/tmp/gcp_ssh_key.pub --quiet 2>/dev/null || true
  rm -f /tmp/gcp_ssh_key.pub
  echo "✅ SSH public key injected into project '${PROJECT_ID}'."

echo "🛡️ Pre-flight check: Disabling compute instance deletion protection across existing project VMs..."
for inst in $(gcloud compute instances list --project="${PROJECT_ID}" --format="value(name)" 2>/dev/null); do
  gcloud compute instances update "$inst" --project="${PROJECT_ID}" --zone="us-central1-a" --no-deletion-protection --quiet 2>/dev/null || true
done
echo "✅ Deletion protection stripped from existing VMs."
else
  echo "⚠️ No local SSH public key found in ~/.ssh. Skipping SSH key injection."
fi

echo "🔄 Generating terraform.tfvars files..."
cat <<EOF > terraform/foundation/terraform.tfvars
project_id            = "${PROJECT_ID}"
EOF

cat <<EOF > terraform/admin-workstation/terraform.tfvars
project_id            = "${PROJECT_ID}"
EOF

cat <<EOF > terraform/edge-router/terraform.tfvars
project_id            = "${PROJECT_ID}"
EOF

cat <<EOF > terraform/cluster/terraform.tfvars
project_id            = "${PROJECT_ID}"
provisioning_sa_email = "${PROVISIONING_SA_EMAIL}"
EOF
echo "✅ terraform.tfvars created successfully."

echo "🔄 Creating Terraform state bucket..."
gcloud storage buckets create "gs://gem-${PROJECT_ID}-tfstate" --project="${PROJECT_ID}" --location="us-central1" || true
gcloud storage buckets update "gs://gem-${PROJECT_ID}-tfstate" --versioning || true

echo "🔄 Generating backend.tf files..."
cat <<EOF > terraform/foundation/backend.tf
terraform {
  backend "gcs" {}
}
EOF

cat <<EOF > terraform/admin-workstation/backend.tf
terraform {
  backend "gcs" {}
}
EOF

cat <<EOF > terraform/edge-router/backend.tf
terraform {
  backend "gcs" {}
}
EOF

cat <<EOF > terraform/cluster/backend.tf
terraform {
  backend "gcs" {}
}
EOF
echo "✅ backend.tf created successfully. Terraform will automatically use GCS for remote state!"


echo "🚀 Bootstrap complete! Please follow these steps to deploy your environment:"
echo "1. Deploy the foundation:"
echo "   cd terraform/foundation"
echo "   terraform init -reconfigure -backend-config=\"bucket=gem-\${PROJECT_ID}-tfstate\" \\"
echo "                  -backend-config=\"prefix=foundation/state\" \\"
echo "                  -backend-config=\"impersonate_service_account=\${PROVISIONING_SA_EMAIL}\""
echo "   terraform apply"
echo ""
echo "2. Deploy the admin workstation:"
echo "   cd ../admin-workstation"
echo "   terraform init -reconfigure -backend-config=\"bucket=gem-\${PROJECT_ID}-tfstate\" \\"
echo "                  -backend-config=\"prefix=admin-workstation/state\" \\"
echo "                  -backend-config=\"impersonate_service_account=\${PROVISIONING_SA_EMAIL}\""
echo "   terraform apply"
echo "   cd ../../ansible"
echo "   ansible-playbook admin-workstation.yaml"
echo ""
echo "3. Deploy the Edge Router (Optional):"
echo "   cd ../terraform/edge-router"
echo "   terraform init -reconfigure -backend-config=\"bucket=gem-\${PROJECT_ID}-tfstate\" \\"
echo "                  -backend-config=\"prefix=edge-router/state\" \\"
echo "                  -backend-config=\"impersonate_service_account=\${PROVISIONING_SA_EMAIL}\""
echo "   terraform apply"
echo "   cd ../../ansible"
echo "   ansible-playbook edge-router.yaml"
echo ""
echo "4. Set your cluster name: export CLUSTER_NAME='abm-cluster-1'"
echo ""
echo "5. Deploy the cluster VMs:"
echo "   cd ../terraform/cluster"
echo "   terraform init -reconfigure -backend-config=\"bucket=gem-\${PROJECT_ID}-tfstate\" \\"
echo "                  -backend-config=\"prefix=clusters/\${CLUSTER_NAME}/state\" \\"
echo "                  -backend-config=\"impersonate_service_account=\${PROVISIONING_SA_EMAIL}\""
echo "   terraform apply -var=\"cluster_name=\${CLUSTER_NAME}\""
