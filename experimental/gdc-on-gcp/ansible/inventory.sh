#!/bin/bash
# inventory.sh
# Dynamic inventory script that reads Terraform outputs and configures IAP tunneling.

set -euo pipefail

TF_DIR="../terraform"

# Ensure terraform output is available
if ! command -v terraform &> /dev/null; then
  echo "{}"
  exit 0
fi

cd "$TF_DIR" || exit 1

# If terraform is not initialized or state is missing, return empty
if ! terraform output -json &> /dev/null || [ "$(terraform output -json 2>/dev/null)" == "{}" ]; then
  echo "{}"
  exit 0
fi

# Get outputs
GCP_PROJECT=$(terraform output -raw project_id 2>/dev/null || echo "")
GCP_ZONE=$(terraform output -raw zone 2>/dev/null || echo "")

WS_NAME=$(terraform output -raw workstation_name 2>/dev/null || echo "")
GONG1_NAME=$(terraform output -json cluster_nodes_names 2>/dev/null | jq -r '.gong1' || echo "")
GONG2_NAME=$(terraform output -json cluster_nodes_names 2>/dev/null | jq -r '.gong2' || echo "")
GONG3_NAME=$(terraform output -json cluster_nodes_names 2>/dev/null | jq -r '.gong3' || echo "")

WS_INTERNAL_IP=$(terraform output -raw workstation_ip 2>/dev/null || echo "")
GONG1_INTERNAL_IP=$(terraform output -json cluster_nodes_ips 2>/dev/null | jq -r '.gong1' || echo "")
GONG2_INTERNAL_IP=$(terraform output -json cluster_nodes_ips 2>/dev/null | jq -r '.gong2' || echo "")
GONG3_INTERNAL_IP=$(terraform output -json cluster_nodes_ips 2>/dev/null | jq -r '.gong3' || echo "")

# Find the OS Login username for SSH
GCP_USER=$(gcloud compute os-login describe-profile --format="value(posixAccounts[0].username)" 2>/dev/null || echo "")

# Build JSON inventory
cat <<EOF
{
  "all": {
    "vars": {
      "ansible_ssh_common_args": "-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ProxyCommand='gcloud compute start-iap-tunnel %h %p --listen-on-stdin --project=${GCP_PROJECT} --zone=${GCP_ZONE}'",
      "ansible_python_interpreter": "/usr/bin/python3",
      "ansible_user": "${GCP_USER}",
      "gcp_project_id": "${GCP_PROJECT}",
      "cluster_name": "$(terraform output -raw cluster_name 2>/dev/null || echo '')",
      "bmctl_version": "$(terraform output -raw bmctl_version 2>/dev/null || echo '')"
    }
  },
  "workstation": {
    "hosts": ["ws"]
  },
  "cluster_nodes": {
    "hosts": ["gong1", "gong2", "gong3"]
  },
  "gdc_nodes": {
    "children": ["workstation", "cluster_nodes"]
  },
  "_meta": {
    "hostvars": {
      "ws": {
        "ansible_host": "${WS_NAME}",
        "internal_ip": "${WS_INTERNAL_IP}",
        "vxlan_ip": "10.200.0.2"
      },
      "gong1": {
        "ansible_host": "${GONG1_NAME}",
        "internal_ip": "${GONG1_INTERNAL_IP}",
        "vxlan_ip": "10.200.0.3"
      },
      "gong2": {
        "ansible_host": "${GONG2_NAME}",
        "internal_ip": "${GONG2_INTERNAL_IP}",
        "vxlan_ip": "10.200.0.4"
      },
      "gong3": {
        "ansible_host": "${GONG3_NAME}",
        "internal_ip": "${GONG3_INTERNAL_IP}",
        "vxlan_ip": "10.200.0.5"
      }
    }
  }
}
EOF
