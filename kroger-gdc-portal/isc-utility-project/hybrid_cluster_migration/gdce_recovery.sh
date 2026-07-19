#!/usr/bin/env bash

set -euo pipefail

BACKUP_FILE="replica-backup.json"
REPORT_FILE="rehydration-report.txt"

echo "==== STARTING CLUSTER REHYDRATION ====" | tee "$REPORT_FILE"

# --------------------------------
# STEP 0: Gateway Pre-check (NEW)
# --------------------------------
echo "STEP 0: Checking kube-system gateways"

if kubectl get gateway -n kube-system &>/dev/null; then
  gateways=$(kubectl get gateway -n kube-system -o jsonpath='{.items[*].metadata.name}')

  for gw in $gateways; do
    status=$(kubectl get gateway "$gw" -n kube-system -o jsonpath='{.status.conditions[?(@.type=="Programmed")].status}' 2>/dev/null || echo "Unknown")

    if [[ "$status" != "True" ]]; then
      echo "Gateway $gw not programmed → removing finalizers"

      kubectl patch gateway "$gw" -n kube-system \
        --type='merge' \
        -p '{"metadata":{"finalizers":[]}}' || true
    fi
  done
fi

# Utilities
ns_exists() { kubectl get ns "$1" &>/dev/null; }

restart_deployments() {
  local ns=$1
  echo ">> Restarting deployments in $ns"
  kubectl rollout restart deployment -n "$ns" || true
}

restart_sts() {
  local ns=$1
  echo ">> Restarting statefulsets in $ns"
  kubectl rollout restart statefulset -n "$ns" || true
}

scale_deployments() {
  local ns=$1
  local replicas=$2
  echo ">> Scaling deployments in $ns to $replicas"
  kubectl scale deployment --all --replicas="$replicas" -n "$ns" || true
}

check_unhealthy_pods() {
  local ns=$1
  kubectl get pods -n "$ns" --no-headers 2>/dev/null | \
    grep -E "CrashLoopBackOff|Error|Pending" || true
}

# --------------------------------
# STEP 0A: Restart dns-config (NEW)
# --------------------------------
echo "STEP 0A: Restarting dns-config namespace"

ns="dns-config"
if ns_exists "$ns"; then
  restart_deployments "$ns"
else
  echo "$ns not found" | tee -a "$REPORT_FILE"
fi

# -------------------------------
# STEP 1: Cleanup
# -------------------------------
echo "STEP 1: Cleaning unhealthy + completed pods"

CLEANUP_NAMESPACES=(
config-management-system namespace-labeler rabbitmq-system elastic-system
mongodb es kroger-issuer kong-system kong-system-default kong-system-pci kong-system-fuel dns-config
)

for ns in "${CLEANUP_NAMESPACES[@]}"; do
  if ns_exists "$ns"; then
    pods=$(kubectl get pods -n "$ns" --no-headers 2>/dev/null \
      | grep -E "Error|CrashLoopBackOff|Completed|Evicted" \
      | awk '{print $1}' || true)

    for pod in $pods; do
      kubectl delete pod "$pod" -n "$ns" --force --grace-period=0 || true
    done
  fi
done

# -------------------------------
# STEP 2/3/4/5 same as before
# -------------------------------
ns="config-management-system"
if ns_exists "$ns"; then
  scale_deployments "$ns" 1
  restart_deployments "$ns"
fi

ns="namespace-labeler"
if ns_exists "$ns"; then
  scale_deployments "$ns" 2
  restart_deployments "$ns"
fi

for ns in rabbitmq-system elastic-system mongodb es; do
  if ns_exists "$ns"; then
    if [[ "$ns" == "elastic-system" ]]; then
      kubectl get sts -n "$ns" -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.spec.replicas}{"\n"}{end}' | \
      while read -r name replicas; do
        [[ "$replicas" -eq 0 ]] && kubectl scale sts "$name" -n "$ns" --replicas=1 || true
      done
      restart_sts "$ns"
    else
      restart_deployments "$ns"
    fi
  fi
done

# -------------------------------
# STEP 6: Kong + Gateway validation
# -------------------------------
echo "STEP 6: Kong + Gateway validation"

KONG_NAMESPACES=(
kong-system-default kong-system kong-system-pci kong-system-fuel
)

for ns in "${KONG_NAMESPACES[@]}"; do
  if ns_exists "$ns"; then
    restart_deployments "$ns"

    if kubectl get gateway -n "$ns" &>/dev/null; then
      gateways=$(kubectl get gateway -n "$ns" -o jsonpath='{.items[*].metadata.name}')

      for gw in $gateways; do
        programmed=$(kubectl get gateway "$gw" -n "$ns" -o jsonpath='{.status.conditions[?(@.type=="Programmed")].status}' 2>/dev/null)
        address=$(kubectl get gateway "$gw" -n "$ns" -o jsonpath='{.status.addresses}' 2>/dev/null)

        if [[ "$programmed" != "True" || -z "$address" || "$address" == "[]" ]]; then
          echo "Gateway $gw in $ns invalid → deleting"
          kubectl delete gateway "$gw" -n "$ns" || true
        fi
      done
    fi
  fi
done

# -------------------------------
# STEP 7/8 same
# -------------------------------
TARGET_NAMESPACES=(dns-config ngpos-lab ngpos-payments-pci ngpos-shared-pci prom-monitoring-pci
  kong-system-pci ngpos-fuel-pci-l1 ngpos-apex ngpos-dev ngpos-isa
  ngpos-mx ngpos-mxc ngpos-payments ngpos-platform ngpos-shared
  ngpos-tax prom-monitoring local-image-registry edsmongodb kong-system
  ngpos-fuel mx-offers ngpos-fuel-pci-l0 filebeat prom-monitoring-fuel kong-system-fuel)
for ns in "${TARGET_NAMESPACES[@]}"; do
  ns_exists "$ns" && kubectl delete pods --all -n "$ns" || true
done

# -------------------------------
# STEP 8A: Final config-management
# -------------------------------
ns="config-management-system"
ns_exists "$ns" && restart_deployments "$ns"

# -------------------------------
# STEP 9: Final Health + Gateway Report
# -------------------------------
echo "STEP 9: Final checks"

echo "Unhealthy Pods:" | tee -a "$REPORT_FILE"
kubectl get pods -A | grep -E "Error|CrashLoopBackOff|Pending" | tee -a "$REPORT_FILE" || true

echo "Bad Gateways:" | tee -a "$REPORT_FILE"

for ns in kube-system "${KONG_NAMESPACES[@]}" dns-config; do
  if ns_exists "$ns"; then
    for gw in $(kubectl get gateway -n "$ns" -o jsonpath='{.items[*].metadata.name}' 2>/dev/null); do
      prog=$(kubectl get gateway "$gw" -n "$ns" -o jsonpath='{.status.conditions[?(@.type=="Programmed")].status}' 2>/dev/null)
      addr=$(kubectl get gateway "$gw" -n "$ns" -o jsonpath='{.status.addresses}')

      if [[ "$prog" != "True" || -z "$addr" ]]; then
        echo "$ns/$gw -> NOT HEALTHY" | tee -a "$REPORT_FILE"
      fi
    done
  fi
done

echo "==== REHYDRATION COMPLETE ====" | tee -a "$REPORT_FILE"