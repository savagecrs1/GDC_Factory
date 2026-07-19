#!/bin/bash
# GDCE hybrid cluster migration — network/namespace cleanup runbook (ordered steps).
# Runs gdce_k8_cleanup_orchestrator.sh per namespace group (pci, non-pci, fuel).
#
# Usage:
#   ./gdce_k8_cleanup_sequence.sh --cluster ci089h --yes
#   ./gdce_k8_cleanup_sequence.sh --cluster ci089h --dry-run --yes
#   ./gdce_k8_cleanup_sequence.sh --cluster ci089h --from-step 2 --yes
#   ./gdce_k8_cleanup_sequence.sh --cluster ci089h --continue-on-error --yes
#
# Prerequisites:
#   - gdce_k8_cleanup_orchestrator.sh and gdce_connect.sh in this directory
#   - namespace_groups.sh (pci / non-pci / fuel networks and namespaces)
#   - K8S_USERNAME / K8S_PASSWORD or interactive credentials
#
# After this sequence, run gdce_k8_recovery_sequence.sh to restore and validate workloads.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=gdce_connect.sh
source "$SCRIPT_DIR/gdce_connect.sh"
ORCH="$SCRIPT_DIR/gdce_k8_cleanup_orchestrator.sh"

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
GDCE K8 Cleanup Sequence (4 steps)

Runs gdce_k8_cleanup_orchestrator.sh in hybrid-migration cleanup order.
Writes per-group replica backups (replica-backup-pci.json, etc.) before draining networks.

Required:
  --cluster NAME          Target GDCE cluster (e.g. ci089h)

Optional:
  --from-step N           Start at step N (1-4, default: 1)
  --continue-on-error     Run remaining steps after a failure
  --dry-run               Pass --dry-run to each orchestrator invocation
  --verbose, -v           Enable verbose tracing (passed to orchestrator)
  --quiet, -q             Disable verbose tracing (default; passed to orchestrator)
  --yes                   Pass --yes (skip confirmations; GDCE_YES=1)
  --skip-connect          Pass --skip-connect to orchestrator
  --delete-network BOOL   Pass --delete-network true|false (default: true)
  --no-cms-pause          Pass --no-cms-pause to orchestrator (not recommended)
  --no-cms-restore        Pass --no-cms-restore (CMS left at 0 after each cleanup step)
  --help                  Show this message

Steps:
   1. Backup ngpos workload state → per-group replica-backup-{group}.json
   2. PCI network cleanup (CMS holdoff; --no-cms-restore keeps CMS paused for steps 3–4)
   3. Non-PCI network cleanup (--no-cms-restore; skips CMS scale-down if still paused)
   4. Fuel network cleanup (CMS restored to target replicas on exit)

Example:
  ./gdce_k8_cleanup_sequence.sh --cluster ci089h --dry-run --yes
  ./gdce_k8_cleanup_sequence.sh --cluster ci089h --yes

Restore after cleanup (separate script):
  ./gdce_k8_recovery_sequence.sh --cluster ci089h --from-step 11 --yes
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
        FROM_STEP="${1:?--from-step requires 1-4}"
        ;;
      --continue-on-error) CONTINUE_ON_ERROR=true ;;
      --dry-run) ORCH_EXTRA+=(--dry-run) ;;
      --verbose|-v) ORCH_EXTRA+=(--verbose) ;;
      --quiet|-q) ORCH_EXTRA+=(--quiet) ;;
      --yes) ORCH_EXTRA+=(--yes) ;;
      --skip-connect) ORCH_EXTRA+=(--skip-connect) ;;
      --delete-network)
        shift
        ORCH_EXTRA+=(--delete-network "${1:?--delete-network requires true or false}")
        ;;
      --no-cms-pause) ORCH_EXTRA+=(--no-cms-pause) ;;
      --no-cms-restore) ORCH_EXTRA+=(--no-cms-restore) ;;
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
  log_step "gdce_k8_cleanup_sequence start"
  parse_args "$@"
  gdce_sync_orchestrator_env

  if [[ -z "$GDCE_CLUSTER" ]]; then
    echo "Error: --cluster is required (e.g. --cluster ci089h)" >&2
    usage >&2
    exit 1
  fi

  if [[ ! "$FROM_STEP" =~ ^[1-4]$ ]]; then
    echo "Error: --from-step must be 1-4" >&2
    exit 1
  fi

  log "GDCE cleanup sequence | cluster=$GDCE_CLUSTER | from-step=$FROM_STEP | verbose=$GDCE_VERBOSE"
  if gdce_verbose_enabled; then
    log "Verbose tracing on (--verbose)"
  else
    log "Verbose tracing off (default)"
  fi

  # Step 1: Backup all ngpos namespaces (split into per-group replica-backup-*.json)
  run_step 1 "Backup ngpos workload state (per-group replica-backup files)" \
    --backup-ngpos-replicas --yes

  # Step 2: PCI — CMS holdoff once; leave CMS at 0 until step 4 (--no-cms-restore)
  run_step 2 "PCI network and namespace cleanup" \
    --network-group pci --no-cms-restore --yes

  # Step 3: Non-PCI — CMS already paused from step 2 (idempotent skip if still at 0)
  run_step 3 "Non-PCI network and namespace cleanup" \
    --network-group non-pci --no-cms-restore --yes

  # Step 4: Fuel — restore CMS on exit (default)
  run_step 4 "Fuel network and namespace cleanup" \
    --network-group fuel --yes

  echo ""
  log_step "Cleanup sequence completed (steps 1-4)"
  log "Per-group backups: replica-backup-pci.json, replica-backup-non-pci.json, replica-backup-fuel.json"
  log "Next: run gdce_k8_recovery_sequence.sh to restore replicas and validate health"
}

main "$@"
