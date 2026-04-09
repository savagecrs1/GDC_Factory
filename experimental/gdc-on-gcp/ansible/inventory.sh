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
GEM_WS_NAME=$(terraform output -raw workstation_name 2>/dev/null || echo "")
GEM_WS_INTERNAL_IP=$(terraform output -raw workstation_ip 2>/dev/null || echo "")

NODE1_NAME=$(terraform output -json cluster_nodes_names 2>/dev/null | jq -r '.node1' || echo "")
NODE2_NAME=$(terraform output -json cluster_nodes_names 2>/dev/null | jq -r '.node2' || echo "")
NODE3_NAME=$(terraform output -json cluster_nodes_names 2>/dev/null | jq -r '.node3' || echo "")

NODE1_INTERNAL_IP=$(terraform output -json cluster_nodes_ips 2>/dev/null | jq -r '.node1' || echo "")
NODE2_INTERNAL_IP=$(terraform output -json cluster_nodes_ips 2>/dev/null | jq -r '.node2' || echo "")
NODE3_INTERNAL_IP=$(terraform output -json cluster_nodes_ips 2>/dev/null | jq -r '.node3' || echo "")

# Fetch Edge Router details (if deployed)
EDGE_ROUTER_IP=""
EDGE_ROUTER_NAME=""
if [ -d "edge-router/.terraform" ]; then
  EDGE_ROUTER_IP=$(terraform -chdir=edge-router output -raw edge_router_ip 2>/dev/null || echo "")
  EDGE_ROUTER_NAME=$(terraform -chdir=edge-router output -raw edge_router_name 2>/dev/null || echo "")
fi

# Use standard SSH user since OS Login is disabled
CLUSTER_NAME="$(terraform output -raw cluster_name 2>/dev/null || echo 'abm-cluster-1')"

# Deterministic Hashing Scheme for Network Isolation
# Generate a pseudo-random hash from the cluster name to ensure unique networks
HASH=$(echo -n "$CLUSTER_NAME" | cksum | awk '{print $1}')
VXLAN_ID=$(( HASH % 16000000 + 100 ))  # Safe VNI range (100 - 16M)
OCTET3=$(( HASH % 254 + 1 ))           # Safe subnet range (1 - 254)
VXLAN_BASE="10.200.${OCTET3}"

# Use standard SSH user since OS Login is disabled
GCP_USER="${USER:-$(whoami)}"

# Build JSON inventory
cat <<EOF
{
  "all": {
    "vars": {
      "ansible_ssh_common_args": "-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ProxyCommand='gcloud compute start-iap-tunnel %h %p --listen-on-stdin --project=${GCP_PROJECT} --zone=${GCP_ZONE}'",
      "ansible_python_interpreter": "/usr/bin/python3",
      "ansible_user": "${GCP_USER}",
      "gcp_project_id": "${GCP_PROJECT}",
      "tf_cluster_name": "${CLUSTER_NAME}",
      "bmctl_version": "$(terraform output -raw bmctl_version 2>/dev/null || echo '')",
      "vxlan_id": "${VXLAN_ID}",
      "vxlan_base_ip": "${VXLAN_BASE}"
    }
  },
  "workstation": {
    "hosts": ["gem_admin_ws"]
  },
  "cluster_nodes": {
    "hosts": ["node1", "node2", "node3"]
  },
  "edge_router": {
    "hosts": $(if [ -n "$EDGE_ROUTER_NAME" ]; then echo "[\"edge_router_host\"]"; else echo "[]"; fi)
  },
  "gdc_nodes": {
    "children": ["workstation", "cluster_nodes"$(if [ -n "$EDGE_ROUTER_NAME" ]; then echo ', "edge_router"'; fi)]
  },
  "_meta": {
    "hostvars": {
$(if [ -n "$EDGE_ROUTER_NAME" ]; then cat <<INNER_EOF
      "edge_router_host": {
        "ansible_host": "${EDGE_ROUTER_NAME}",
        "internal_ip": "${EDGE_ROUTER_IP}",
        "vxlan_ip": "${VXLAN_BASE}.254"
      },
INNER_EOF
fi)
      "gem_admin_ws": {
        "ansible_host": "${GEM_WS_NAME}",
        "internal_ip": "${GEM_WS_INTERNAL_IP}",
        "vxlan_ip": "${VXLAN_BASE}.100"
      },
      "node1": {
        "ansible_host": "${NODE1_NAME}",
        "internal_ip": "${NODE1_INTERNAL_IP}",
        "vxlan_ip": "${VXLAN_BASE}.2"
      },
      "node2": {
        "ansible_host": "${NODE2_NAME}",
        "internal_ip": "${NODE2_INTERNAL_IP}",
        "vxlan_ip": "${VXLAN_BASE}.3"
      },
      "node3": {
        "ansible_host": "${NODE3_NAME}",
        "internal_ip": "${NODE3_INTERNAL_IP}",
        "vxlan_ip": "${VXLAN_BASE}.4"
      }
    }
  }
}
EOF