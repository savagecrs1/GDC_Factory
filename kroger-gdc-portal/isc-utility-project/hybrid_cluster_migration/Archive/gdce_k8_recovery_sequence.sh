#!/bin/bash
# GDCE hybrid cluster migration — 15-step recovery runbook.
# Runs gdce_k8_recovery_orchestrator.sh in sequence (see attached runbook).
#
# Usage:
#   ./gdce_k8_recovery_sequence.sh --cluster ci089h
#   ./gdce_k8_recovery_sequence.sh --cluster ci089h --dry-run --yes
#   ./gdce_k8_recovery_sequence.sh --cluster ci089h --from-step 5
#   ./gdce_k8_recovery_sequence.sh --cluster ci089h --continue-on-error
#
# Prerequisites:
#   - gdce_k8_recovery_orchestrator.sh and gdce_connect.sh in this directory
#   - namespace_groups.sh, per-group replica-backup-{pci,non-pci,fuel}.json (for step 11)
#   - K8S_USERNAME / K8S_PASSWORD or interactive credentials

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=gdce_connect.sh
source "$SCRIPT_DIR/gdce_connect.sh"
ORCH="$SCRIPT_DIR/gdce_k8_recovery_orchestrator.sh"

GDCE_CLUSTER=""
FROM_STEP=1
CONTINUE_ON_ERROR=false
ORCH_EXTRA=()

log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

log_step() {
  log ">>> $*"
  gdce_trace_step "$*"
}

trace_enter() {
  gdce_trace_enter "$*"
}

trace_exit() {
  gdce_trace_exit "$@"
}

usage() {
  cat <<'EOF'
GDCE K8 Recovery Sequence (15 steps)

Runs gdce_k8_recovery_orchestrator.sh in hybrid-migration order.

Required:
  --cluster NAME          Target GDCE cluster (e.g. ci089h)

Optional:
  --from-step N           Start at step N (1-15, default: 1)
  --continue-on-error     Run remaining steps after a failure
  --dry-run               Pass --dry-run to each orchestrator invocation
  --verbose, -v           Enable verbose tracing (passed to orchestrator)
  --quiet, -q               Disable verbose tracing (default; passed to orchestrator)
  --yes                   Pass --yes (skip confirmations; GDCE_YES=1)
  --skip-connect          Pass --skip-connect to orchestrator
  --help                  Show this message

Steps:
   1. Cluster-wide cleanup of ERROR/Crashing/unhealthy pods
   2. CMS ensure (0->scale to 1; at 1 replica -> rollout restart)
   3. Scale namespace-labeler to 2 replicas
   4. Check health namespace-labeler
   5. Restore data-plane operator CRs from replica-backup-{group}.json (rabbitmq/elastic/mongo)
   6. rabbitmq-system, elastic-system, mongodb — health + pod cleanup incl. Completed (steps 4,6,7)
   7. Kong TLS — delete kong-default-tls secrets; wait Certificate Ready=True (health step 2; before kroger-issuer)
   8. kroger-issuer — scale to 1 replica (health step 1; requires Kong TLS Ready)
   9. Check health kroger-issuer (health step 1)
  10. Kong namespaces — scale deployments to 1 replica (health step 3)
  11. Check health all Kong namespaces (TLS verify + deploy/pod recovery)
  12. Ngpos apps — restart pods + delete services (no deploy/sts/ds/job); skip missing NS
  13. Restore ngpos replica backup from per-group replica-backup-{group}.json files
  14. Verify ngpos pods and services (orchestrator health step 10; restore is step 13)
  15. Final health report → HealthReport.txt (one kubectl get pods -A; optional groups-only on orchestrator)

Example:
  ./gdce_k8_recovery_sequence.sh --cluster ci089h --yes
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --cluster)
        shift
        GDCE_CLUSTER="${1:?--cluster requires a value}"
        ;;
      --from-step)
        shift
        FROM_STEP="${1:?--from-step requires 1-15}"
        ;;
      --continue-on-error) CONTINUE_ON_ERROR=true ;;
      --dry-run) ORCH_EXTRA+=(--dry-run) ;;
      --verbose|-v) ORCH_EXTRA+=(--verbose) ;;
      --quiet|-q) ORCH_EXTRA+=(--quiet) ;;
      --yes) ORCH_EXTRA+=(--yes) ;;
      --skip-connect) ORCH_EXTRA+=(--skip-connect) ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        echo "Error: unknown argument '$1' (use --help)" >&2
        exit 1
        ;;
    esac
    shift
  done
}

run_step() {
  local step="$1"
  local title="$2"
  shift 2
  local rc=0 start_ts end_ts elapsed

  if [[ "$step" -lt "$FROM_STEP" ]]; then
    log "Step $step SKIPPED (--from-step $FROM_STEP)"
    gdce_trace "sequence step $step skipped (from-step=$FROM_STEP)"
    return 0
  fi

  start_ts=$(date +%s)
  trace_enter "sequence step $step: $title"

  if [[ ! -x "$ORCH" ]]; then
    if [[ ! -f "$ORCH" ]]; then
      echo "Error: orchestrator not found: $ORCH" >&2
      exit 1
    fi
    chmod +x "$ORCH" 2>/dev/null || true
  fi

  echo ""
  echo "========================================================================"
  echo "  STEP $step: $title"
  echo "  Command: $ORCH --cluster $GDCE_CLUSTER ${ORCH_EXTRA[*]:-} $*"
  echo "========================================================================"
  echo ""

  set +e
  gdce_trace "exec: $ORCH --cluster $GDCE_CLUSTER ${ORCH_EXTRA[*]:-} $*"
  "$ORCH" --cluster "$GDCE_CLUSTER" ${ORCH_EXTRA[@]+"${ORCH_EXTRA[@]}"} "$@"
  rc=$?
  set -e

  end_ts=$(date +%s)
  elapsed=$((end_ts - start_ts))

  if [[ $rc -eq 0 ]]; then
    log "Step $step DONE (${elapsed}s)"
    trace_exit "sequence step $step" 0
    return 0
  fi

  log "Step $step FAILED (exit $rc, ${elapsed}s)"
  trace_exit "sequence step $step" "$rc"
  if [[ "$CONTINUE_ON_ERROR" == "true" ]]; then
    log "Continuing (--continue-on-error)"
    return 0
  fi
  exit "$rc"
}

main() {
  log_step "gdce_k8_recovery_sequence start"
  parse_args "$@"
  gdce_sync_orchestrator_env

  if [[ -z "$GDCE_CLUSTER" ]]; then
    echo "Error: --cluster is required (e.g. --cluster ci089h)" >&2
    usage >&2
    exit 1
  fi

  if [[ ! "$FROM_STEP" =~ ^([1-9]|1[0-5])$ ]]; then
    echo "Error: --from-step must be 1-15" >&2
    exit 1
  fi

  log "GDCE recovery sequence | cluster=$GDCE_CLUSTER | from-step=$FROM_STEP | verbose=$GDCE_VERBOSE"
  if gdce_verbose_enabled; then
    log "Verbose tracing on (--verbose)"
  else
    log "Verbose tracing off (default)"
  fi

  # # Step 1: Cleanup unhealthy pods cluster-wide
  # run_step 1 "Cleanup ERROR/Crashing/unhealthy pods (cluster-wide)" \
  #   --cleanup-unhealthy-pods --cluster-wide --yes

  # Step 2: CMS rollout restart
  run_step 2 "CMS ensure deployments (0->1; 1->rollout restart)" \
    --cms-rollout-restart-only --yes

  # Step 3: namespace-labeler → 2 replicas (health step 8 scales + verifies)
  run_step 3 "Scale namespace-labeler to 2 replicas" \
    --health-step 8 --yes

  # Step 4: Check health namespace-labeler
  run_step 4 "Check health namespace-labeler" \
    --health-step 8 --yes

  # Step 5: Restore operator CR specs before data-plane health (written during cleanup CR suspend)
  run_step 5 "Restore data-plane operator CRs (rabbitmq/elastic/mongo) from replica-backup files" \
    --restore-data-plane-crs --yes

  # Step 6: rabbitmq-system, elastic-system, mongodb (health steps 4,6,7; deletes Completed pods)
  run_step 6 "Health rabbitmq-system, elastic-system, mongodb (scale, cleanup incl. Completed, verify)" \
    --health-step 4,6,7 --yes

  # Step 7: Kong TLS before kroger-issuer (stale kong-default-tls secrets break cert-manager / issuer)
  run_step 7 "Kong TLS: delete kong-default-tls secrets; wait Certificate Ready=True (before kroger-issuer)" \
    --health-step 2 --yes

  # Step 8: kroger-issuer 1 replica (orchestrator runs Kong TLS precondition again if needed)
  run_step 8 "kroger-issuer — scale to 1 replica" \
    --health-step 1 --yes

  # Step 9: Check health kroger-issuer
  run_step 9 "Check health kroger-issuer" \
    --health-step 1 --yes

  # Step 10: Kong namespaces → 1 replica each (after certs are True)
  run_step 10 "Scale Kong namespaces to 1 replica (kong-system, kong-system-default, kong-system-pci, kong-system-fuel)" \
    --health-step 3 --yes

  # Step 11: Check health all Kong namespaces (re-runs TLS guard + deploy/pod recovery)
  run_step 11 "Check health all Kong namespaces" \
    --check-health-kong-namespaces --yes

  # Step 12: Ngpos — restart pods + delete svc only (namespaces from namespace_groups.sh)
  run_step 12 "Restart pods and delete services (ngpos-apps; skip missing namespaces)" \
    --restart-pods-delete-svc --yes

  # Step 13: Restore ngpos workload replica backup
  run_step 13 "Restore ngpos replica backup from per-group replica-backup files" \
    --restore-ngpos-replicas --yes

  # # Step 14: Verify only — do not use --health-step 9,10 (step 13 already restores)
  # run_step 14 "Check pods and services up in ngpos namespaces" \
  #   --check-health-ngpos-namespaces --yes

  # # Step 15: Final health report
  # run_step 15 "Final health check — cluster-wide + namespace groups → HealthReport.txt" \
  #   --final-health-report --yes

  echo ""
  log_step "Recovery sequence completed (steps 1-15)"
}

main "$@"
