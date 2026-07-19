#!/bin/bash

set -euo pipefail

WATCH_INTERVAL=5
RETRY_INTERVAL=10
REPLICA_FILE="replica-backup.json"
DELETE_NETWORK=true

declare -A NETWORK_NAMESPACES
declare -A PROCESSED_NS

# -----------------------------
# ARG PARSER
# -----------------------------
parse_args() {
  [[ $# -eq 0 ]] && echo "Use --network net=ns1,ns2" && exit 1

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --network)
        shift
        entry="$1"
        net="${entry%%=*}"
        ns="${entry#*=}"
        NETWORK_NAMESPACES["$net"]="${ns//,/ }"
        ;;
      *) ;;
    esac
    shift
  done
}

# -----------------------------
# ✅ SCALE EVERYTHING
# -----------------------------
scale_everything() {
  local ns=$1

  # ✅ Deploy + STS
  kubectl scale deploy --all --replicas=0 -n "$ns" >/dev/null 2>&1 || true
  kubectl scale sts --all --replicas=0 -n "$ns" >/dev/null 2>&1 || true

  # ✅ DaemonSets (disable scheduling)
  for ds in $(kubectl get ds -n "$ns" \
    -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || true); do

    kubectl patch ds "$ds" -n "$ns" \
      -p '{"spec":{"template":{"spec":{"nodeSelector":{"cleanup":"true"}}}}}' \
      --type=merge >/dev/null 2>&1 || true
  done

  # ✅ Jobs
  for job in $(kubectl get job -n "$ns" \
    -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || true); do

    kubectl patch job "$job" -n "$ns" \
      -p '{"spec":{"parallelism":0}}' \
      --type=merge >/dev/null 2>&1 || true
  done

  # ✅ CronJobs
  for cj in $(kubectl get cronjob -n "$ns" \
    -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || true); do

    kubectl patch cronjob "$cj" -n "$ns" \
      -p '{"spec":{"suspend":true}}' \
      --type=merge >/dev/null 2>&1 || true
  done
}

# -----------------------------
# ✅ WATCHDOG FOR RECONCILERS
# -----------------------------
watch_and_kill_reconcilers() {
  (
    while true; do
      kubectl scale deploy --all \
        -n config-management-system \
        --replicas=0 >/dev/null 2>&1 || true

      kubectl delete pods -n config-management-system \
        --all --force --grace-period=0 --wait=false >/dev/null 2>&1 || true

      sleep $WATCH_INTERVAL
    done
  ) &
}

# -----------------------------
# ✅ NETWORK LOOP (FINAL CORE)
# -----------------------------
reconciler_loop() {
  local net=$1

  (
    echo "[Net:$net] Monitoring..."

    while true; do

      kubectl get network "$net" &>/dev/null || break
      all_clean=true

      for ns in ${NETWORK_NAMESPACES[$net]}; do

        # ✅ Get pods
        pods=$(kubectl get pods -n "$ns" --no-headers 2>/dev/null || true)
        pod_count=$(echo "$pods" | awk 'NF{c++} END{print c+0}')

        # ✅ Progress log
        if (( pod_count == 0 )); then
          echo "[Net:$net] $ns → CLEAN ✅"
        else
          echo "[Net:$net] $ns → $pod_count pod(s) remaining"
        fi

        # ✅ Always enforce scale during loop
        scale_everything "$ns"

        if (( pod_count > 0 )); then
          all_clean=false

          # ✅ Operate ONLY on existing pods
          for p in $(echo "$pods" | awk '{print $1}'); do
[O            [[ -z "$p" ]] && continue

            # ✅ Patch finalizer ONLY if needed
            finalizers=$(kubectl get pod "$p" -n "$ns" \
              -o jsonpath='{.metadata.finalizers}' 2>/dev/null || echo "")

            if [[ -n "$finalizers" ]]; then
              kubectl patch pod "$p" -n "$ns" \
                -p '{"metadata":{"finalizers":[]}}' \
                --type=merge >/dev/null 2>&1 || true
            fi

            # ✅ Delete pod
            kubectl delete pod "$p" -n "$ns" \
              --force --grace-period=0 --wait=false >/dev/null 2>&1 || true
          done
        fi
      done

      # ✅ Network delete condition
      if [[ "$all_clean" == "true" ]]; then
        echo "[Net:$net] ✅ ALL namespaces empty → deleting network"

        kubectl delete network "$net" >/dev/null 2>&1 || true
        break
      fi

      sleep $RETRY_INTERVAL
    done
  ) &
}

# -----------------------------
# MAIN
# -----------------------------
parse_args "$@"

echo "🚀 Starting cleanup..."

watch_and_kill_reconcilers

for net in "${!NETWORK_NAMESPACES[@]}"; do
  reconciler_loop "$net"
done

wait

echo "✅ Cleanup completed"
