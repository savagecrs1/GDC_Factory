#!/usr/bin/env bash

set -euo pipefail

BACKUP_FILE="replica-backup.json"
REPORT_FILE="rehydration-report.txt"

echo "==== STARTING CLUSTER REHYDRATION ====" | tee "$REPORT_FILE"

# Utilities
ns_exists() {
  kubectl get ns "$1" &>/dev/null
}

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

# STEP 1: Targeted Cleanup
echo "STEP 1: Cleaning unhealthy + completed pods"

CLEANUP_NAMESPACES=(
  config-management-system
  namespace-labeler
  rabbitmq-system
  elastic-system
  mongodb
  es
  kroger-issuer
  kong-system
  kong-system-default
  kong-system-pci
  kong-system-fuel
  dns-config
)

for ns in "${CLEANUP_NAMESPACES[@]}"; do
  if ns_exists "$ns"; then
    echo "Cleaning namespace: $ns"

    pods=$(kubectl get pods -n "$ns" --no-headers 2>/dev/null \
      | grep -E "Error|CrashLoopBackOff|Completed|Evicted" \
      | awk '{print $1}' || true)

    for pod in $pods; do
      echo "Deleting pod $pod in $ns"
      kubectl delete pod "$pod" -n "$ns" --force --grace-period=0 || true
    done
  else
    echo "$ns not found" | tee -a "$REPORT_FILE"
  fi
done

# STEP 2: config-management-system (initial)
ns="config-management-system"
if ns_exists "$ns"; then
  scale_deployments "$ns" 1
  restart_deployments "$ns"
fi

# STEP 3: namespace-labeler
ns="namespace-labeler"
if ns_exists "$ns"; then
  scale_deployments "$ns" 2
  restart_deployments "$ns"
  check_unhealthy_pods "$ns"
fi

# STEP 4: Infra namespaces
for ns in rabbitmq-system elastic-system mongodb es; do
  if ns_exists "$ns"; then
    echo ">> Checking $ns"

    if [[ "$ns" == "elastic-system" ]]; then
      echo ">> Handling elastic-system (STS)"

      kubectl get sts -n "$ns" -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.spec.replicas}{"\n"}{end}' | \
      while read -r name replicas; do
        if [[ "$replicas" -eq 0 ]]; then
          echo "Scaling STS $name to 1"
          kubectl scale statefulset "$name" -n "$ns" --replicas=1 || true
        fi
      done

      restart_sts "$ns"
    else
      if check_unhealthy_pods "$ns"; then
        restart_deployments "$ns"
      fi
    fi
  else
    echo "$ns not found" | tee -a "$REPORT_FILE"
  fi
done

# STEP 4A: Delete kong TLS secret
echo "STEP 4A: Deleting kong-default-tls secrets"

KONG_NAMESPACES=(
  kong-system-default
  kong-system
  kong-system-pci
  kong-system-fuel
)

for ns in "${KONG_NAMESPACES[@]}"; do
  if ns_exists "$ns"; then
    kubectl delete secret kong-default-tls -n "$ns" --ignore-not-found || true
  fi
done

# STEP 5: kroger-issuer
ns="kroger-issuer"
if ns_exists "$ns"; then
  scale_deployments "$ns" 1
  restart_deployments "$ns"
  check_unhealthy_pods "$ns"
fi

# STEP 6: Kong namespaces
for ns in "${KONG_NAMESPACES[@]}"; do
  if ns_exists "$ns"; then
    scale_deployments "$ns" 1
    restart_deployments "$ns"
    check_unhealthy_pods "$ns"
  fi
done

# STEP 7: Delete pods + services
TARGET_NAMESPACES=(
  dns-config ngpos-lab ngpos-payments-pci ngpos-shared-pci prom-monitoring-pci
  kong-system-pci ngpos-fuel-pci-l1 ngpos-apex ngpos-dev ngpos-isa
  ngpos-mx ngpos-mxc ngpos-payments ngpos-platform ngpos-shared
  ngpos-tax prom-monitoring local-image-registry edsmongodb kong-system
  ngpos-fuel mx-offers ngpos-fuel-pci-l0 filebeat prom-monitoring-fuel kong-system-fuel
)

echo "STEP 7: Restart pods + delete services"

for ns in "${TARGET_NAMESPACES[@]}"; do
  if ns_exists "$ns"; then
    kubectl delete pods --all -n "$ns" || true
    kubectl delete svc --all -n "$ns" || true
  else
    echo "$ns not found" | tee -a "$REPORT_FILE"
  fi
done

# STEP 8: Restore replicas
echo "STEP 8: Restoring replicas"

if [[ -f "$BACKUP_FILE" ]]; then
  jq -c '.[]' "$BACKUP_FILE" | while read -r item; do
    ns=$(echo "$item" | jq -r '.namespace')
    kind=$(echo "$item" | jq -r '.kind' | tr '[:upper:]' '[:lower:]')
    name=$(echo "$item" | jq -r '.name')
    action=$(echo "$item" | jq -r '.action')
    replicas=$(echo "$item" | jq -r '.replicas')

    if ns_exists "$ns" && [[ "$action" == "scale" ]]; then
      if kubectl get "$kind" "$name" -n "$ns" &>/dev/null; then
        echo "Scaling $kind/$name in $ns to $replicas"
        kubectl scale "$kind" "$name" -n "$ns" --replicas="$replicas" || true
      fi
    fi
  done
fi

# ✅ NEW STEP: Final config-management refresh BEFORE report
echo "STEP 8A: Final restart of config-management-system"

ns="config-management-system"
if ns_exists "$ns"; then
  restart_deployments "$ns"
fi

# STEP 9: Final Health Check
echo "STEP 9: Final health check"

kubectl get pods -A --no-headers | \
grep -E "Error|CrashLoopBackOff|Pending" | tee -a "$REPORT_FILE" || true

echo "==== REHYDRATION COMPLETE ====" | tee -a "$REPORT_FILE"
