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

# inventory.sh
# Dynamic inventory script that aggregates Terraform outputs from the decoupled tiers.

set -euo pipefail

# Helper function to get output from a specific terraform directory
get_tf_output() {
  local dir=$1
  local key=$2
  if [ -d "$dir/.terraform" ]; then
    local val=$(terraform -chdir="$dir" output -raw "$key" 2>/dev/null || echo "")
    if [[ "$val" == *"No outputs"* ]] || [[ "$val" == *"Warning"* ]] || [[ "$val" == *"Error"* ]]; then
      echo ""
    else
      echo "$val"
    fi
  else
    echo ""
  fi
}

get_tf_json() {
  local dir=$1
  local key=$2
  local json_key=$3
  if [ -d "$dir/.terraform" ]; then
    local result=$(terraform -chdir="$dir" output -json "$key" 2>/dev/null | jq -r ".$json_key")
    if [ "$result" == "null" ] || [ -z "$result" ]; then
      echo ""
    else
      echo "$result"
    fi
  else
    echo ""
  fi
}

# Fetch Admin Workstation details (Required)
GEM_WS_NAME=$(get_tf_output "../terraform/admin-workstation" "workstation_name")
GEM_WS_INTERNAL_IP=$(get_tf_output "../terraform/admin-workstation" "workstation_ip")
GCP_PROJECT=$(get_tf_output "../terraform/admin-workstation" "project_id")
GCP_ZONE=$(get_tf_output "../terraform/admin-workstation" "zone")

# Fallback if somehow missing
if [ -z "$GCP_PROJECT" ]; then
  GCP_PROJECT=$(get_tf_output "../terraform/foundation" "project_id")
fi
GCP_PROJECT_NUMBER=$(get_tf_output "../terraform/foundation" "project_number")

# Fetch Cluster details (Optional)
CLUSTER_DIR="../terraform/cluster"
NODE1_NAME=$(get_tf_json "$CLUSTER_DIR" "cluster_nodes_names" "node1")
NODE2_NAME=$(get_tf_json "$CLUSTER_DIR" "cluster_nodes_names" "node2")
NODE3_NAME=$(get_tf_json "$CLUSTER_DIR" "cluster_nodes_names" "node3")

NODE1_INTERNAL_IP=$(get_tf_json "$CLUSTER_DIR" "cluster_nodes_ips" "node1")
NODE2_INTERNAL_IP=$(get_tf_json "$CLUSTER_DIR" "cluster_nodes_ips" "node2")
NODE3_INTERNAL_IP=$(get_tf_json "$CLUSTER_DIR" "cluster_nodes_ips" "node3")

CLUSTER_NAME=$(get_tf_output "$CLUSTER_DIR" "cluster_name")
if [ -z "$CLUSTER_NAME" ]; then
  CLUSTER_NAME="abm-cluster-1"
fi
BMCTL_VERSION=$(get_tf_output "$CLUSTER_DIR" "bmctl_version")

# Fetch Edge Router details (Optional)
EDGE_ROUTER_IP=$(get_tf_output "../terraform/edge-router" "edge_router_ip")
EDGE_ROUTER_NAME=$(get_tf_output "../terraform/edge-router" "edge_router_name")

# If Admin WS isn't deployed yet, return empty inventory
if [ -z "$GEM_WS_NAME" ]; then
  echo "{}"
  exit 0
fi

# Deterministic Hashing Scheme for Network Isolation
HASH=$(echo -n "$CLUSTER_NAME" | cksum | awk '{print $1}')
VXLAN_ID=$(( HASH % 16000000 + 100 ))
OCTET3=$(( HASH % 254 + 1 ))
VXLAN_BASE="10.200.${OCTET3}"

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
      "gcp_project_number": "${GCP_PROJECT_NUMBER}",
      "tf_cluster_name": "${CLUSTER_NAME}",
$(if [ -n "$BMCTL_VERSION" ]; then echo "      \"bmctl_version\": \"${BMCTL_VERSION}\","; fi)
      "vxlan_id": "${VXLAN_ID}",
      "vxlan_base_ip": "${VXLAN_BASE}"
    }
  },
  "workstation": {
    "hosts": ["gem_admin_ws"]
  },
  "cluster_nodes": {
    "hosts": $(if [ -n "$NODE1_NAME" ]; then echo "[\"node1\", \"node2\", \"node3\"]"; else echo "[]"; fi)
  },
  "edge_router": {
    "hosts": $(if [ -n "$EDGE_ROUTER_NAME" ]; then echo "[\"edge_router_host\"]"; else echo "[]"; fi)
  },
  "gdc_nodes": {
    "children": [
      "workstation"
      $(if [ -n "$NODE1_NAME" ]; then echo ', "cluster_nodes"'; fi)
      $(if [ -n "$EDGE_ROUTER_NAME" ]; then echo ', "edge_router"'; fi)
    ]
  },
  "_meta": {
    "hostvars": {
      "gem_admin_ws": {
        "ansible_host": "${GEM_WS_NAME}",
        "internal_ip": "${GEM_WS_INTERNAL_IP}",
        "vxlan_ip": "${VXLAN_BASE}.100"
      }
$(if [ -n "$EDGE_ROUTER_NAME" ]; then cat <<INNER_EOF
      , "edge_router_host": {
        "ansible_host": "${EDGE_ROUTER_NAME}",
        "internal_ip": "${EDGE_ROUTER_IP}",
        "vxlan_ip": "${VXLAN_BASE}.254"
      }
INNER_EOF
fi)
$(if [ -n "$NODE1_NAME" ]; then cat <<INNER_EOF
      , "node1": {
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
INNER_EOF
fi)
    }
  }
}
EOF
