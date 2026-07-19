#!/bin/bash
# GDCE namespace recovery: cluster-wide unhealthy pod cleanup (default), namespace drain,
# recovery verify, and post-migration health checks. Profiles: namespace_groups.sh
#
# USAGE EXAMPLES:
#
#   Default mode: --cleanup-unhealthy-pods (implicit). Default scope: --cluster-wide
#   (all namespaces on cluster; excludes kube-system, kube-public, kube-node-lease).
#   Deletes only ERROR/CrashLoopBackOff/unhealthy pods once per namespace (no re-delete loop).
#   Use --dry-run first. Per-namespace behavior: namespace_groups.sh (NS_PROFILE_*).
#
#   # --- Cluster-wide unhealthy pod cleanup (default) ---
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --dry-run --yes
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --cleanup-unhealthy-pods --cluster-wide
#   ./gdce_k8_recovery_orchestrator.sh --skip-connect --dry-run --cleanup-unhealthy-pods
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --serial --delete-timeout 600
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --include-system-namespaces
#
#   # --- Scoped to namespace_groups.sh (not cluster-wide) ---
#   ./gdce_k8_recovery_orchestrator.sh --list-namespace-groups
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --namespace-group fuel
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --dry-run --namespace-group pci,non-pci,fuel
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --namespace-group fuel --replicas 0
#     # NS_PROFILE_* with replicas=0 still full-drains those namespaces
#
#   # --- Ngpos apps: restart pods + delete svc (no deploy/sts/ds/job) ---
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --restart-pods-delete-svc
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --namespace-group ngpos-apps --restart-pods-delete-svc --dry-run
#
#   # --- Full drain / recovery (not unhealthy-only) ---
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --namespace-group pci --delete-only
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --restart-pods-delete-svc
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --namespace-group ngpos-apps --restart-pods-delete-svc
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --namespace-group fuel --delete-and-verify-recovery
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --dry-run --delete-only ngpos-lab,kong-system-fuel
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --serial --delete-timeout 300 --delete-only ngpos-lab
#
#   # --- CMS (auto: 0->target replicas, target->rollout restart) ---
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --cms-rollout-restart-only
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --cms-rollout-restart-only
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --cleanup-unhealthy-pods --cms-rollout-restart
#
#   # --- Post-recovery platform health (hybrid migration checklist) ---
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --check-health-kong-namespaces
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --check-health-kroger-issuer
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --check-health-namespace-labeler
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --check-health-ngpos-namespaces
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --health-validations-only
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --health-step 4
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --health-step 8
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --health-step 6
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --dry-run --health-step 2,7
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --restore-ngpos-replicas
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --restore-data-plane-crs
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --health-step 9
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --health-step 10
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --final-health-report
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --final-health-report-groups-only
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --health-step 11
#   ./gdce_k8_recovery_orchestrator.sh --list-health-steps
#   ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --delete-and-verify-recovery --skip-health-validations --namespace-group fuel
#
#   # --- Discovery / connect ---
#   ./gdce_k8_recovery_orchestrator.sh --list-clusters
#   ./gdce_k8_recovery_orchestrator.sh --help
#
#   # Credentials (gdce_connect.sh): masked password prompt; fast-connect when already on connectgateway context
#   K8S_USERNAME=myeuid K8S_PASSWORD='***' ./gdce_k8_recovery_orchestrator.sh --cluster ci009h
#   GDCE_KUBECTL_REQUEST_TIMEOUT=60s ./gdce_k8_recovery_orchestrator.sh --cluster ci009h --dry-run
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=gdce_connect.sh
source "$SCRIPT_DIR/gdce_connect.sh"

GDCE_CLUSTER=""
GDCE_SKIP_CONNECT=false

CHECK_INTERVAL=5
DELETE_TIMEOUT=180
RECOVERY_TIMEOUT=180
TARGET_REPLICAS=1
RECOVERY_REPLICAS_CLI_OVERRIDE=0
MODE=""
DRY_RUN=false
SERIAL=false
# CMS (namespace_groups.sh: GDCE_CMS_NAMESPACE, GDCE_CMS_TARGET_REPLICAS)
CMS_NAMESPACE="config-management-system"
CMS_TARGET_REPLICAS=1
RUN_CMS_ENSURE=true
RUN_CMS_ROLLOUT_RESTART=false
RUN_HEALTH_VALIDATIONS=true
HEALTH_WAIT_TIMEOUT=300
HEALTH_INTERACTIVE=true
HEALTH_STEPS=()
NAMESPACE_LABELER_HEALTH_ONLY=false
KROGER_ISSUER_HEALTH_ONLY=false
KONG_NAMESPACES_HEALTH_ONLY=false
RESTORE_NGPOS_REPLICAS_ONLY=false
RESTORE_DATA_PLANE_CRS_ONLY=false
NGPOS_NAMESPACES_HEALTH_ONLY=false
FINAL_HEALTH_REPORT_ONLY=false
FINAL_HEALTH_REPORT_GROUPS_ONLY=false
HEALTH_REPORT_POD_CACHE_READY=0
HEALTH_REPORT_POD_CACHE_FILE=""
declare -A HEALTH_REPORT_NS_OK=()
REPLICA_BACKUP_FILE=""
REPLICA_BACKUP_GROUP_LIST=()
REPLICA_BACKUP_FILE_LIST=()
HEALTH_RESTORE_GROUP_RESTORED=0
HEALTH_RESTORE_MISSING_NS=""
HEALTH_REPORT_FILE=""
HEALTH_NGPOS_NS=()
HEALTH_REPORT_CLUSTER_NS=()
HEALTH_REPORT_GROUP_UNION=()
NAMESPACE_SKIP_MISSING=false

NAMESPACES=()
CLUSTER_WIDE_CLEANUP=false
CLUSTER_WIDE_INCLUDE_SYSTEM=false

# Post-recovery hybrid migration health targets
# Kong gateway namespaces (profiles in namespace_groups.sh: replicas=1, touch=deploy,pods)
HEALTH_KONG_NS=(kong-system kong-system-default kong-system-pci kong-system-fuel)
HEALTH_KONG_TLS_NS=(kong kong-system kong-system-default kong-system-pci kong-system-fuel)
HEALTH_STABILIZE_NS=(kroger-issuer kong-system kong-system-default kong-system-pci kong-system-fuel namespace-labeler)
# rabbitmq-system, elastic-system, mongodb: scale deploy + rollout restart when unhealthy (step 4)
HEALTH_ROLLOUT_RESTART_NS=(rabbitmq-system elastic-system mongodb)
HEALTH_POD_CHECK_NS=(rabbitmq-system elastic-system mongodb kong-system kong-system-default kong-system-pci kong-system-fuel)

# Safe array expansion under set -u with empty arrays (Bash 3.2 / macOS)
# Usage: for x in ${ARR[@]+"${ARR[@]}"}; do ...

# ================================
# Logging / verbose tracing (off by default via gdce_connect.sh; --verbose to enable)
# ================================
log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

log_step() {
  log ">>> $1"
  gdce_trace_step "$1"
}

log_progress() {
  gdce_log_progress "$*"
}

trace_enter() {
  gdce_trace_enter "$*"
}

trace_exit() {
  gdce_trace_exit "$@"
}

# ================================
# Help
# ================================
show_help() {
  cat << EOF
GDCE K8 Recovery Orchestrator

DESCRIPTION:
  Default: cluster-wide cleanup of ERROR/Crashing/unhealthy pods in all namespaces
  (or namespace_groups.sh / explicit list). Full drain modes scale workloads and
  remove pods/services. CMS auto-ensure after run (0->target replicas, target->rollout restart).

MODES (pick one):
  --cleanup-unhealthy-pods
      Delete unhealthy pods once per namespace (no poll/re-delete loop). With --cluster-wide
      (default if no --namespace-group), scans every namespace on the cluster.

  --cluster-wide
      Discover all namespaces on the connected cluster (use with cleanup mode).
      Excludes kube-system, kube-public, kube-node-lease unless --include-system-namespaces.

  --delete-only
      Drain until namespaces have zero pods and zero services (or timeout).

  --restart-pods-delete-svc
      Ngpos/application namespaces from namespace_groups.sh (GDCE_NGPOS_RESTART_PODS_DELETE_SVC_NS
      or --namespace-group ngpos-apps): delete all pods and services once per namespace (no re-delete
      poll loop); does not scale or patch deploy, sts, ds, job, or cronjob. Skips missing namespaces.

  --delete-and-verify-recovery
      Drain, baseline verify, then run hybrid post-recovery health validations.

  --health-validations-only
      Run post-recovery health validations only (no namespace drain).

  --check-health-kong-namespaces
      Kong recovery: delete kong-default-tls secrets in all Kong TLS namespaces, wait for
      Certificate Ready=True, then scale deployments to 1 replica and print status on screen
      (kong-system, kong-system-default, kong-system-pci, kong-system-fuel; TLS scope includes kong)
      rollout restart if unhealthy, suite PASS/FAIL.

  --check-health-kroger-issuer
      Check health kroger-issuer only: scale deployments to 1 replica (profile),
      print Deployment/Pod status on screen, rollout restart if unhealthy, PASS/FAIL.

  --check-health-namespace-labeler
      Check health namespace-labeler only (health step 8): scale deployments to profile
      replicas (default 2), print Deployment/Pod status on screen, PASS/FAIL summary.

  --check-health-ngpos-namespaces
      Verify all pods and services are up in each ngpos namespace (health step 10):
      GDCE_NGPOS_RESTART_PODS_DELETE_SVC_NS from namespace_groups.sh. Prints per-namespace
      Pod/Service/Endpoints status on screen; skips missing namespaces (reported); suite PASS/FAIL.

  --final-health-report
      Run final health check (health step 11): scan unhealthy pods cluster-wide and by each
      namespace group in namespace_groups.sh (pci, non-pci, fuel, ngpos-apps). Prints on screen
      and writes HealthReport.txt (GDCE_HEALTH_REPORT_FILE). Uses one kubectl get pods -A (fast path).

  --final-health-report-groups-only
      Same as --final-health-report but only namespace_groups.sh groups (no cluster-wide tenant scan).
      Faster on large clusters. PASS/FAIL based on unhealthy pods in pci/non-pci/fuel/ngpos-apps only.
      Env: GDCE_HEALTH_REPORT_GROUPS_ONLY=1, GDCE_HEALTH_REPORT_KUBECTL_TIMEOUT (default 90s).

  --restore-ngpos-replicas
      Restore workload state for ngpos namespaces from per-group backup files (health step 9):
      replica-backup-pci.json, replica-backup-non-pci.json, replica-backup-fuel.json
      (GDCE_REPLICA_BACKUP_FILE_PATTERN in namespace_groups.sh). Legacy replica-backup.json
      is used only if no per-group files exist. --namespace-group limits which files are read.

  --restore-data-plane-crs
      Restore RabbitMQ/Elastic/Mongo operator CR specs from per-group backup files (written during
      cleanup CR suspend). Scope: GDCE_DATA_PLANE_OPERATOR_NS (rabbitmq-system, elastic-system,
      mongodb). Run before data-plane health steps so operators reconcile to saved replica counts.

  --health-step N        Run only step N (1-11); repeat or use commas (e.g. 2,6,11). Implies
                         --health-validations-only. Confirmation before each selected step.
  --list-health-steps    Print the 11 automation steps and exit.

  --skip-health-validations
      Skip post-recovery health checks (with --delete-and-verify-recovery).

NAMESPACE GROUPS (namespace_groups.sh or GDCE_NAMESPACE_GROUPS):
  --namespace-group NAME   Load namespaces from group (pci, non-pci, fuel; comma-separated)
  --list-namespace-groups  Print groups, defaults, and per-namespace profiles and exit
  Profiles: default replicas=1, touch=pods; override via NS_PROFILE_* in namespace_groups.sh

CLUSTER (gdce_connect.sh):
  --cluster NAME       Connect kubectl/gcloud to GDCE fleet cluster (required unless --skip-connect)
  --skip-connect       Use current kubeconfig; verify with kubectl get nodes (skip if already on connectgateway_*_global_<cluster>)
  GDCE_FORCE_CONNECT=1 Force full gcloud/credential refresh even when already connected
  --list-clusters      Print clusters from source_of_truth.csv and exit

CMS (Anthos Config Management — config-management-system):
  Adjusted automatically after recovery/cleanup (GDCE_CMS_TARGET_REPLICAS in namespace_groups.sh):
    replicas=0 -> scale to target; replicas=target -> rollout restart each Deployment.
  --cms-rollout-restart-only   Only run CMS ensure.
  --cms-rollout-restart        Also run CMS ensure at end of a drain/cleanup run.
  --no-cms-touch               Skip CMS ensure after run.

OTHER:
  --replicas N         Override all namespace profiles (default: use profile or $TARGET_REPLICAS)
  --interval SEC       Poll interval (default: $CHECK_INTERVAL)
  --delete-timeout SEC Max seconds to drain per namespace (default: $DELETE_TIMEOUT)
  --recovery-timeout SEC Max seconds for recovery verify (default: $RECOVERY_TIMEOUT)
  --health-wait SEC    Max seconds to wait per health step (default: $HEALTH_WAIT_TIMEOUT)
  --no-health-prompts  Run health steps without per-step confirmation
  --dry-run            Log every kubectl/gcloud/sleep/file/jq command; no changes applied
  --verbose, -v        Enable verbose tracing (kubectl + phase boundaries)
  --quiet, -q          Disable verbose tracing (default)
  --yes                Skip pre-run and per-step health confirmations (or set GDCE_YES=1)
  Env GDCE_KUBECTL_REQUEST_TIMEOUT   Per-kubectl timeout (default: 220s; override if needed)
  --serial             Process namespaces one at a time (default: parallel)
  --help               Show this message

USAGE:
  $0 --cluster CLUSTER --cleanup-unhealthy-pods
  $0 --cluster CLUSTER --cleanup-unhealthy-pods --namespace-group fuel
  $0 --cluster CLUSTER --namespace-group pci --delete-only
  $0 --cluster CLUSTER --namespace-group non-pci --delete-and-verify-recovery
  $0 --skip-connect --dry-run --namespace-group fuel --delete-only
  $0 --cluster CLUSTER --dry-run --delete-only <namespaces>   # explicit list still supported

EXAMPLES (use --dry-run first):
  # Cluster-wide unhealthy pod cleanup (default)
  $0 --cluster CLUSTER
  $0 --cluster CLUSTER --dry-run --yes
  $0 --cluster CLUSTER --cleanup-unhealthy-pods --cluster-wide --serial

  # namespace_groups.sh scope + profiles (NS_PROFILE_*: replicas, touch)
  $0 --list-namespace-groups
  $0 --cluster CLUSTER --namespace-group fuel
  $0 --cluster CLUSTER --dry-run --namespace-group pci,non-pci,fuel

  # Ngpos apps: pods + svc only (skips missing namespaces)
  $0 --cluster CLUSTER --restart-pods-delete-svc
  $0 --cluster CLUSTER --namespace-group ngpos-apps --restart-pods-delete-svc

  # Full drain / verify / health
  $0 --cluster CLUSTER --namespace-group pci --delete-only
  $0 --cluster CLUSTER --namespace-group fuel --delete-and-verify-recovery
  $0 --cluster CLUSTER --check-health-kong-namespaces
  $0 --cluster CLUSTER --check-health-kroger-issuer
  $0 --cluster CLUSTER --check-health-namespace-labeler
  $0 --cluster CLUSTER --check-health-ngpos-namespaces
  $0 --cluster CLUSTER --final-health-report
  $0 --cluster CLUSTER --final-health-report-groups-only
  $0 --cluster CLUSTER --dry-run --health-validations-only
  $0 --cluster CLUSTER --health-step 8
  $0 --cluster CLUSTER --restore-ngpos-replicas
  $0 --cluster CLUSTER --restore-data-plane-crs
  $0 --cluster CLUSTER --health-step 9
  $0 --list-health-steps

WARNING:
  Destructive. Default removes only unhealthy pods cluster-wide. Drain modes remove all
  pods/services in scope. Profiles in namespace_groups.sh (default replicas=1, touch=pods).
  CMS: ./gdce_k8_recovery_orchestrator.sh --cluster CLUSTER --cms-rollout-restart-only
  Excludes: GDCE_NS_CLUSTER_WIDE_EXCLUDE in namespace_groups.sh.
EOF
}

# ================================
# Parse arguments
# ================================
trim() {
  echo "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

add_namespace() {
  local ns
  ns=$(trim "$1")
  [[ -z "$ns" ]] && return
  local existing
  for existing in ${NAMESPACES[@]+"${NAMESPACES[@]}"}; do
    [[ "$existing" == "$ns" ]] && return
  done
  NAMESPACES+=("$ns")
}

parse_namespace_token() {
  local token="$1"
  local part
  IFS=',' read -ra PARTS <<< "$token"
  for part in ${PARTS[@]+"${PARTS[@]}"}; do
    add_namespace "$part"
  done
}

load_ngpos_restart_pods_delete_svc_namespaces() {
  local list part
  gdce_namespace_groups_load_cache || return 1
  eval "list=\"\${GDCE_NGPOS_RESTART_PODS_DELETE_SVC_NS:-}\""
  if [[ -z "$list" ]]; then
    echo "Error: GDCE_NGPOS_RESTART_PODS_DELETE_SVC_NS not set in namespace_groups.sh" >&2
    return 1
  fi
  log "Loading ngpos restart-pods/delete-svc namespace list from namespace_groups.sh"
  IFS=',' read -ra PARTS <<< "$list"
  for part in ${PARTS[@]+"${PARTS[@]}"}; do
    part=$(trim "$part")
    [[ -z "$part" ]] && continue
    add_namespace "$part"
    gdce_ns_register_group "$part" "ngpos-apps"
  done
  return 0
}

apply_namespace_groups_from_ini() {
  local g ns part
  gdce_validate_namespace_groups_registered || exit 1
  for g in ${NAMESPACE_GROUP_REQUESTS[@]+"${NAMESPACE_GROUP_REQUESTS[@]}"}; do
    ns=$(gdce_ini_get "$g" namespaces)
    if [[ -z "$ns" ]]; then
      echo "Error: group [$g] must define namespaces in namespace_groups.sh" >&2
      exit 1
    fi
    log "[group] namespace-group=$g"
    IFS=',' read -ra PARTS <<< "$ns"
    for part in ${PARTS[@]+"${PARTS[@]}"}; do
      part=$(trim "$part")
      [[ -z "$part" ]] && continue
      add_namespace "$part"
      gdce_ns_register_group "$part" "$g"
    done
  done
}

parse_args() {
  trace_enter "parse_args"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --cleanup-unhealthy-pods) MODE="cleanup-unhealthy" ;;
      --cluster-wide) CLUSTER_WIDE_CLEANUP=true ;;
      --include-system-namespaces) CLUSTER_WIDE_INCLUDE_SYSTEM=true ;;
      --delete-only) MODE="delete-only" ;;
      --restart-pods-delete-svc) MODE="restart-pods-delete-svc" ;;
      --delete-and-verify-recovery) MODE="verify-recovery" ;;
      --health-validations-only) MODE="health-only" ;;
      --check-health-kong-namespaces)
        MODE="health-only"
        KONG_NAMESPACES_HEALTH_ONLY=true
        ;;
      --check-health-kroger-issuer)
        MODE="health-only"
        KROGER_ISSUER_HEALTH_ONLY=true
        ;;
      --check-health-namespace-labeler)
        MODE="health-only"
        NAMESPACE_LABELER_HEALTH_ONLY=true
        HEALTH_STEPS=(8)
        ;;
      --check-health-ngpos-namespaces)
        MODE="health-only"
        NGPOS_NAMESPACES_HEALTH_ONLY=true
        HEALTH_STEPS=(10)
        ;;
      --final-health-report|--final-health-report-groups-only)
        MODE="health-only"
        FINAL_HEALTH_REPORT_ONLY=true
        HEALTH_STEPS=(11)
        [[ "$1" == "--final-health-report-groups-only" ]] && FINAL_HEALTH_REPORT_GROUPS_ONLY=true
        ;;
      --restore-ngpos-replicas)
        MODE="health-only"
        RESTORE_NGPOS_REPLICAS_ONLY=true
        HEALTH_STEPS=(9)
        ;;
      --restore-data-plane-crs)
        MODE="health-only"
        RESTORE_DATA_PLANE_CRS_ONLY=true
        ;;
      --health-step)
        shift
        health_parse_step_arg "${1:?--health-step requires 1-11 or comma-separated list}"
        ;;
      --list-health-steps)
        health_print_steps_catalog
        exit 0
        ;;
      --skip-health-validations) RUN_HEALTH_VALIDATIONS=false ;;
      --namespace-group)
        shift
        gdce_register_namespace_group "${1:?--namespace-group requires a name (e.g. pci)}"
        ;;
      --list-namespace-groups)
        gdce_list_namespace_groups
        exit $?
        ;;
      --no-health-prompts) HEALTH_INTERACTIVE=false ;;
      --no-cms-touch) RUN_CMS_ENSURE=false ;;
      --cms-rollout-restart) RUN_CMS_ROLLOUT_RESTART=true ;;
      --cms-rollout-restart-only) MODE="cms-rollout" ;;
      --replicas)
        shift
        TARGET_REPLICAS="${1:?--replicas requires a non-negative integer}"
        RECOVERY_REPLICAS_CLI_OVERRIDE=1
        ;;
      --interval)
        shift
        CHECK_INTERVAL="${1:?--interval requires a value}"
        ;;
      --delete-timeout)
        shift
        DELETE_TIMEOUT="${1:?--delete-timeout requires a value}"
        ;;
      --recovery-timeout)
        shift
        RECOVERY_TIMEOUT="${1:?--recovery-timeout requires a value}"
        ;;
      --health-wait)
        shift
        HEALTH_WAIT_TIMEOUT="${1:?--health-wait requires a value}"
        ;;
      --dry-run) DRY_RUN=true ;;
      --verbose|-v) GDCE_VERBOSE=true ;;
      --quiet|-q) GDCE_VERBOSE=false ;;
      --yes) GDCE_YES=1 ;;
      --serial) SERIAL=true ;;
      --cluster)
        shift
        GDCE_CLUSTER="${1:?--cluster requires a value}"
        ;;
      --skip-connect) GDCE_SKIP_CONNECT=true ;;
      --list-clusters)
        gdce_list_clusters
        exit $?
        ;;
      --help|-h)
        show_help
        exit 0
        ;;
      --*)
        echo "Unknown option: $1" >&2
        exit 1
        ;;
      *)
        parse_namespace_token "$1"
        ;;
    esac
    shift
  done
  [[ "${GDCE_HEALTH_REPORT_GROUPS_ONLY:-}" == "1" ]] && FINAL_HEALTH_REPORT_GROUPS_ONLY=true

  gdce_trace "parse_args done: MODE=${MODE:-<default>} CLUSTER=${GDCE_CLUSTER:-<unset>} DRY_RUN=$DRY_RUN VERBOSE=$GDCE_VERBOSE"
  trace_exit "parse_args" 0
}

resolve_defaults() {
  trace_enter "resolve_defaults"
  if [[ ${#HEALTH_STEPS[@]} -gt 0 && -z "$MODE" ]]; then
    MODE="health-only"
  fi

  if [[ -z "$MODE" ]]; then
    MODE="cleanup-unhealthy"
  fi

  if [[ ${#HEALTH_STEPS[@]} -gt 0 && "$MODE" != "health-only" ]]; then
    echo "Error: --health-step requires --health-validations-only (or use --health-step alone)" >&2
    exit 1
  fi

  if [[ "$MODE" == "health-only" ]]; then
    RUN_HEALTH_VALIDATIONS=true
    RUN_CMS_ENSURE=false
    return 0
  fi

  if [[ "$MODE" == "cms-rollout" ]]; then
    RUN_HEALTH_VALIDATIONS=false
    RUN_CMS_ENSURE=true
    CLUSTER_WIDE_CLEANUP=false
    return 0
  fi

  if [[ "$MODE" == "restart-pods-delete-svc" ]]; then
    RUN_HEALTH_VALIDATIONS=false
    CLUSTER_WIDE_CLEANUP=false
    NAMESPACE_SKIP_MISSING=true
    if [[ ${#NAMESPACES[@]} -eq 0 && ${#NAMESPACE_GROUP_REQUESTS[@]} -eq 0 ]]; then
      load_ngpos_restart_pods_delete_svc_namespaces || exit 1
    fi
    return 0
  fi

  local g
  for g in ${NAMESPACE_GROUP_REQUESTS[@]+"${NAMESPACE_GROUP_REQUESTS[@]}"}; do
    if [[ "$(gdce_normalize_group_name "$g")" == "ngpos-apps" ]]; then
      NAMESPACE_SKIP_MISSING=true
      break
    fi
  done

  if [[ "$MODE" == "cleanup-unhealthy" ]]; then
    RUN_HEALTH_VALIDATIONS=false
    if [[ ${#NAMESPACES[@]} -eq 0 && ${#NAMESPACE_GROUP_REQUESTS[@]} -eq 0 ]]; then
      CLUSTER_WIDE_CLEANUP=true
    fi
    if [[ "${CLUSTER_WIDE_CLEANUP}" == "true" ]]; then
      SERIAL=true
      log_progress "Cluster-wide cleanup: serial namespace processing enabled (progress: N/total per namespace)"
    fi
  fi

  if [[ "$MODE" != "cleanup-unhealthy" && ${#NAMESPACES[@]} -eq 0 ]]; then
    echo "Error: specify --namespace-group NAME, --cluster-wide, or at least one namespace" >&2
    exit 1
  fi

  if [[ "$MODE" == "cleanup-unhealthy" && ${#NAMESPACES[@]} -eq 0 && ${#NAMESPACE_GROUP_REQUESTS[@]} -gt 0 ]]; then
    CLUSTER_WIDE_CLEANUP=false
  fi

  if ! [[ "$TARGET_REPLICAS" =~ ^[0-9]+$ ]]; then
    echo "Error: --replicas must be a non-negative integer (got: $TARGET_REPLICAS)" >&2
    exit 1
  fi

  if [[ "$MODE" == "verify-recovery" ]] && [[ "$RUN_HEALTH_VALIDATIONS" != "false" ]]; then
    RUN_HEALTH_VALIDATIONS=true
  fi
  if [[ "$MODE" == "delete-only" || "$MODE" == "restart-pods-delete-svc" ]]; then
    RUN_HEALTH_VALIDATIONS=false
  fi
  gdce_trace "resolve_defaults: MODE=$MODE CLUSTER_WIDE=$CLUSTER_WIDE_CLEANUP RUN_CMS_ENSURE=$RUN_CMS_ENSURE"
  trace_exit "resolve_defaults" 0
}

# Skip namespaces that do not exist; log each missing namespace and continue.
filter_namespaces_report_missing() {
  local ns kept=() missing=()

  if gdce_is_dry_run; then
    log "Would verify namespaces (skip if not found): ${NAMESPACES[*]}"
    return 0
  fi

  log "Verifying namespaces (missing namespaces are skipped and reported):"
  for ns in ${NAMESPACES[@]+"${NAMESPACES[@]}"}; do
    log "  Checking namespace: $ns ..."
    if run_kubectl get namespace "$ns" &>/dev/null; then
      log "  OK: $ns"
      kept+=("$ns")
    else
      log "  SKIP: namespace not found (or kubectl timed out): $ns"
      missing+=("$ns")
    fi
  done
  NAMESPACES=("${kept[@]+"${kept[@]}"}")
  if [[ ${#missing[@]} -gt 0 ]]; then
    log "Skipped ${#missing[@]} missing namespace(s): ${missing[*]}"
  fi
  if [[ ${#NAMESPACES[@]} -eq 0 ]]; then
    log "ERROR: no namespaces available to process after skipping missing"
    exit 1
  fi
  log "Processing ${#NAMESPACES[@]} namespace(s)"
}

validate_or_filter_namespaces() {
  if [[ "${NAMESPACE_SKIP_MISSING:-}" == "true" ]]; then
    filter_namespaces_report_missing
  else
    validate_namespaces
  fi
}

validate_namespaces() {
  local ns missing=0

  if gdce_is_dry_run; then
    log "Would validate namespaces: ${NAMESPACES[*]}"
    return 0
  fi

  log "Verifying namespaces exist (timeout ${GDCE_KUBECTL_REQUEST_TIMEOUT} per check): ${NAMESPACES[*]}"

  for ns in ${NAMESPACES[@]+"${NAMESPACES[@]}"}; do
    log "  Checking namespace: $ns ..."
    if run_kubectl get namespace "$ns" &>/dev/null; then
      log "  OK: $ns"
    else
      log "ERROR: namespace not found or kubectl timed out: $ns"
      missing=1
    fi
  done
  [[ $missing -eq 1 ]] && exit 1
  log "All target namespaces verified"
}

# ================================
# CMS reconciler control (config-management-system)
# ================================
load_cms_config_from_namespace_groups() {
  local legacy_target
  gdce_namespace_groups_load_cache 2>/dev/null || true
  eval "CMS_NAMESPACE=\"\${GDCE_CMS_NAMESPACE:-config-management-system}\""
  eval "CMS_TARGET_REPLICAS=\"\${GDCE_CMS_TARGET_REPLICAS:-}\""
  if [[ -z "$CMS_TARGET_REPLICAS" ]]; then
    eval "legacy_target=\"\${GDCE_CMS_RESUME_REPLICAS:-}\""
    CMS_TARGET_REPLICAS="${legacy_target:-1}"
  fi
}

cms_list_deployments() {
  run_kubectl get deploy -n "$CMS_NAMESPACE" \
    -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null || true
}

cms_get_deploy_spec_replicas() {
  local d="$1"
  local r
  r=$(run_kubectl get deploy "$d" -n "$CMS_NAMESPACE" \
    -o jsonpath='{.spec.replicas}' 2>/dev/null) || echo "0"
  echo "${r:-0}"
}

# Per deployment: replicas=0 -> scale to CMS_TARGET_REPLICAS; replicas=target -> rollout restart.
cms_ensure_deployments_active() {
  local d current target
  trace_enter "cms_ensure_deployments_active"
  load_cms_config_from_namespace_groups
  target="$CMS_TARGET_REPLICAS"
  log_step "[CMS] Ensure deployments in $CMS_NAMESPACE (0 -> scale to $target; $target -> rollout restart)"

  if gdce_is_dry_run; then
    for d in $(cms_list_deployments); do
      [[ -z "$d" ]] && continue
      current=$(cms_get_deploy_spec_replicas "$d")
      if [[ "$current" -eq 0 ]]; then
        log "[CMS] [dry-run] deploy/$d replicas=0 -> scale to $target, rollout restart"
      elif [[ "$current" -eq "$target" ]]; then
        log "[CMS] [dry-run] deploy/$d replicas=$target -> rollout restart"
      else
        log "[CMS] [dry-run] deploy/$d replicas=$current -> scale to $target, rollout restart"
      fi
    done
    return 0
  fi

  if ! run_kubectl get namespace "$CMS_NAMESPACE" &>/dev/null; then
    log "[CMS] WARN: namespace $CMS_NAMESPACE not found — skip"
    return 0
  fi

  for d in $(cms_list_deployments); do
    [[ -z "$d" ]] && continue
    current=$(cms_get_deploy_spec_replicas "$d")
    if [[ "$current" -eq 0 ]]; then
      log "[CMS] deploy/$d replicas=0 → scale to $target"
      run_kubectl scale deploy "$d" -n "$CMS_NAMESPACE" --replicas="$target" 2>/dev/null || true
      run_kubectl rollout restart deploy "$d" -n "$CMS_NAMESPACE" 2>/dev/null || true
      log "[CMS] deploy/$d scaled to $target and rollout restarted"
    elif [[ "$current" -eq "$target" ]]; then
      log "[CMS] deploy/$d replicas=$target → rollout restart"
      run_kubectl rollout restart deploy "$d" -n "$CMS_NAMESPACE" 2>/dev/null || true
    else
      log "[CMS] deploy/$d replicas=$current → scale to $target, rollout restart"
      run_kubectl scale deploy "$d" -n "$CMS_NAMESPACE" --replicas="$target" 2>/dev/null || true
      run_kubectl rollout restart deploy "$d" -n "$CMS_NAMESPACE" 2>/dev/null || true
    fi
  done
  trace_exit "cms_ensure_deployments_active" 0
  return 0
}

# CMS-only mode; delegates to cms_ensure_deployments_active.
cms_rollout_restart_all_deployments() {
  cms_ensure_deployments_active
}

cms_finalize_after_run() {
  trace_enter "cms_finalize_after_run RUN_CMS_ENSURE=${RUN_CMS_ENSURE:-}"
  if [[ "${RUN_CMS_ENSURE:-}" != "true" ]]; then
    log "[CMS] Skipped (--no-cms-touch or health-only mode)"
    trace_exit "cms_finalize_after_run" 0
    return 0
  fi
  cms_ensure_deployments_active
  trace_exit "cms_finalize_after_run" 0
}

cms_rollout_restart_if_requested() {
  if [[ "${RUN_CMS_ROLLOUT_RESTART:-}" == "true" ]]; then
    cms_ensure_deployments_active
  fi
}

# ================================
# Per-namespace profiles (namespace_groups.sh Option A)
# ================================
ns_resolve_replicas() {
  local ns="$1"
  if [[ "${RECOVERY_REPLICAS_CLI_OVERRIDE:-}" == "1" ]]; then
    echo "$TARGET_REPLICAS"
    return 0
  fi
  gdce_ns_profile_replicas "$ns" "$(gdce_ns_get_group "$ns")" "$TARGET_REPLICAS"
}

ns_resolve_touch() {
  local ns="$1"
  gdce_ns_profile_touch "$ns" "$(gdce_ns_get_group "$ns")" "$TARGET_REPLICAS"
}

ns_touch() {
  local ns="$1" token="$2"
  gdce_ns_touch_enabled "$ns" "$token" "$(gdce_ns_get_group "$ns")" "$TARGET_REPLICAS"
}

ns_log_profile() {
  local ns="$1" replicas touch group
  replicas=$(ns_resolve_replicas "$ns")
  touch=$(ns_resolve_touch "$ns")
  group=$(gdce_ns_get_group "$ns")
  log "[$ns] profile: replicas=$replicas touch=$touch${group:+ (group=$group)}"
}

# pods+svc only — do not scale/patch deploy, sts, ds, job, or cronjob.
recovery_ns_is_pods_svc_only() {
  local ns="$1"
  if ns_touch "$ns" deploy || ns_touch "$ns" sts || ns_touch "$ns" ds \
     || ns_touch "$ns" job || ns_touch "$ns" cronjob; then
    return 1
  fi
  ns_touch "$ns" pods && ns_touch "$ns" svc
}

# Cluster-wide mode always allows pod cleanup (uses namespace_groups.sh defaults per NS).
recovery_touch_pods_enabled() {
  local ns="$1"
  [[ "${CLUSTER_WIDE_CLEANUP:-}" == "true" ]] && return 0
  ns_touch "$ns" pods
}

# ================================
# Unhealthy pod detection and cleanup (cluster-wide or per namespace)
# ================================
list_unhealthy_pods() {
  local ns="$1"
  run_kubectl get pods -n "$ns" --no-headers 2>/dev/null | awk '
    {
      ready=$2; phase=$3;
      split(ready, r, "/");
      bad=0;
      if (phase ~ /^(Error|CrashLoopBackOff|ImagePullBackOff|ErrImagePull|Failed|OOMKilled|ContainerStatusUnknown|Unknown|CreateContainerConfigError|RunContainerError|InvalidImageName)$/) bad=1;
      else if (phase == "Pending" || phase == "Terminating") bad=1;
      else if (phase == "Running" && r[1] != r[2]) bad=1;
      if (bad) print $0;
    }'
}

count_unhealthy_pods() {
  local ns="$1"
  list_unhealthy_pods "$ns" | awk 'NF {c++} END {print c+0}'
}

# rabbitmq-system / elastic-system / mongodb (recovery sequence step 5, health steps 4/6/7)
health_ns_is_data_plane() {
  local want="$1" n
  for n in ${HEALTH_ROLLOUT_RESTART_NS[@]+"${HEALTH_ROLLOUT_RESTART_NS[@]}"}; do
    [[ "$n" == "$want" ]] && return 0
  done
  return 1
}

# Unhealthy pods plus Completed (finished Job/CronJob pods) for data-plane health cleanup.
list_health_data_plane_cleanup_pods() {
  local ns="$1"
  run_kubectl get pods -n "$ns" --no-headers 2>/dev/null | awk '
    {
      ready=$2; phase=$3;
      split(ready, r, "/");
      bad=0;
      if (phase ~ /^(Error|CrashLoopBackOff|ImagePullBackOff|ErrImagePull|Failed|OOMKilled|ContainerStatusUnknown|Unknown|CreateContainerConfigError|RunContainerError|InvalidImageName)$/) bad=1;
      else if (phase == "Pending" || phase == "Terminating") bad=1;
      else if (phase == "Running" && r[1] != r[2]) bad=1;
      else if (phase == "Completed") bad=1;
      if (bad) print $0;
    }'
}

count_unhealthy_pods_cluster_wide() {
  local ns total=0 n idx=0 total_ns=${#NAMESPACES[@]}

  if [[ $total_ns -eq 0 ]]; then
    echo 0
    return 0
  fi

  log_progress "Scanning $total_ns namespace(s) for unhealthy pods (kubectl get pods per namespace)..."
  for ns in ${NAMESPACES[@]+"${NAMESPACES[@]}"}; do
    idx=$((idx + 1))
    if [[ $idx -eq 1 || $idx -eq $total_ns || $((idx % 10)) -eq 0 ]]; then
      log_progress "Unhealthy pod scan: $idx / $total_ns — $ns"
    fi
    n=$(count_unhealthy_pods "$ns")
    total=$((total + n))
  done
  log_progress "Unhealthy pod scan complete: $total unhealthy pod(s) across $total_ns namespace(s)"
  echo "$total"
}

cleanup_pod_if_needed() {
  local pod="$1" ns="$2" finalizers
  [[ -z "$pod" ]] && return 0

  finalizers=$(run_kubectl get pod "$pod" -n "$ns" \
    -o jsonpath='{.metadata.finalizers}' 2>/dev/null || echo "")
  if [[ -n "$finalizers" && "$finalizers" != "[]" ]]; then
    run_kubectl patch pod "$pod" -n "$ns" \
      -p '{"metadata":{"finalizers":[]}}' \
      --type=merge 2>/dev/null || true
  fi

  run_kubectl delete pod "$pod" -n "$ns" \
    --force --grace-period=0 --wait=false 2>/dev/null || true
}

delete_unhealthy_pods_in_ns() {
  local ns="$1" line pod deleted=0
  if ! recovery_touch_pods_enabled "$ns"; then
    log "[$ns] SKIP unhealthy cleanup: profile touch does not include pods"
    return 0
  fi
  if gdce_is_dry_run; then
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      log "[$ns] [dry-run] would delete unhealthy pod: $line"
      deleted=1
    done < <(list_unhealthy_pods "$ns")
    [[ $deleted -eq 0 ]] && log "[$ns] [dry-run] no unhealthy pods"
    return 0
  fi
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    pod=$(echo "$line" | awk '{print $1}')
    log "[$ns] Deleting unhealthy pod: $pod ($line)"
    cleanup_pod_if_needed "$pod" "$ns"
    deleted=1
  done < <(list_unhealthy_pods "$ns")
  return 0
}

namespace_unhealthy_cleanup_complete() {
  local ns="$1"
  [[ "$(count_unhealthy_pods "$ns")" -eq 0 ]]
}

cluster_namespace_excluded() {
  local ns="$1"
  if [[ "${CLUSTER_WIDE_INCLUDE_SYSTEM}" == "true" ]]; then
    return 1
  fi
  case "$ns" in
    kube-system|kube-public|kube-node-lease) return 0 ;;
  esac
  return 1
}

cluster_namespace_in_exclude_list() {
  local ns="$1" raw_exclude part
  gdce_namespace_groups_load_cache 2>/dev/null || true
  eval "raw_exclude=\"\${GDCE_NS_CLUSTER_WIDE_EXCLUDE:-kube-system,kube-public,kube-node-lease}\""
  IFS=',' read -ra PARTS <<< "$raw_exclude"
  for part in ${PARTS[@]+"${PARTS[@]}"}; do
    part=$(trim "$part")
    [[ "$ns" == "$part" ]] && return 0
  done
  return 1
}

load_cluster_namespaces_for_cleanup() {
  local ns ns_err api_total=0 excluded=0
  trace_enter "load_cluster_namespaces_for_cleanup"
  NAMESPACES=()

  log_step "Cluster-wide: discovering namespaces on connected cluster"
  log_progress "API call starting: kubectl get namespaces (timeout ${GDCE_KUBECTL_REQUEST_TIMEOUT:-220s})"
  log_progress "Waiting for namespace list from cluster API (large clusters may take 30-60s)..."

  if ! gdce_is_dry_run; then
    ns_err=$(run_kubectl get namespaces -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>&1)
    local list_rc=$?
    if [[ $list_rc -ne 0 ]]; then
      log "ERROR: kubectl get namespaces failed (rc=$list_rc): $ns_err"
      trace_exit "load_cluster_namespaces_for_cleanup" 1
      return 1
    fi
    log_progress "API call returned — filtering namespaces for cleanup scope"
    while IFS= read -r ns; do
      [[ -z "$ns" ]] && continue
      api_total=$((api_total + 1))
      if cluster_namespace_excluded "$ns"; then
        excluded=$((excluded + 1))
        continue
      fi
      if cluster_namespace_in_exclude_list "$ns"; then
        excluded=$((excluded + 1))
        continue
      fi
      add_namespace "$ns"
      if (( api_total % 50 == 0 )); then
        log_progress "Filtered $api_total namespace(s) from API (${#NAMESPACES[@]} selected so far)..."
      fi
    done <<< "$ns_err"
  else
    while IFS= read -r ns; do
      [[ -z "$ns" ]] && continue
      cluster_namespace_excluded "$ns" && continue
      cluster_namespace_in_exclude_list "$ns" && continue
      add_namespace "$ns"
    done < <(run_kubectl get namespaces -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null)
  fi

  log "Cluster-wide: ${#NAMESPACES[@]} namespace(s) selected for unhealthy pod cleanup (from $api_total on API, $excluded excluded)"
  if [[ ${#NAMESPACES[@]} -eq 0 ]]; then
    log "ERROR: no namespaces discovered (check RBAC and cluster connection)"
    trace_exit "load_cluster_namespaces_for_cleanup" 1
    return 1
  fi
  trace_exit "load_cluster_namespaces_for_cleanup" 0
  return 0
}

cleanup_unhealthy_namespace() {
  local ns=$1 bad

  trace_enter "cleanup_unhealthy_namespace ns=$ns"
  log "-----------------------------"
  if [[ "${CLUSTER_WIDE_CLEANUP}" != "true" ]]; then
    ns_log_profile "$ns"
  fi
  log "[$ns] Cleaning ERROR/Crashing/unhealthy pods (one-pass; no re-delete loop)"

  if ! gdce_is_dry_run; then
    local probe_err
    log_progress "[$ns] kubectl get pods (probe)"
    probe_err=$(run_kubectl get pods -n "$ns" 2>&1) || {
      log "[$ns] ERROR: kubectl get pods failed (RBAC/connect?): $probe_err"
      trace_exit "cleanup_unhealthy_namespace ns=$ns" 1
      return 1
    }
  fi

  if ! recovery_touch_pods_enabled "$ns"; then
    log "[$ns] SKIP: profile does not include pods in touch list"
    return 0
  fi

  bad=$(count_unhealthy_pods "$ns")
  if (( bad == 0 )); then
    log "[$ns] CLEAN — no unhealthy pods"
    trace_exit "cleanup_unhealthy_namespace ns=$ns" 0
    return 0
  fi

  log "[$ns] Found $bad unhealthy pod(s) — deleting once (controllers may recreate replacements)"
  delete_unhealthy_pods_in_ns "$ns" || true

  bad=$(count_unhealthy_pods "$ns")
  if (( bad > 0 )); then
    log "[$ns] After one-pass: $bad unhealthy pod(s) remain or were recreated (not re-deleted):"
    list_unhealthy_pods "$ns" | sed 's/^/  /' || true
  else
    log "[$ns] CLEAN after one-pass delete"
  fi
  trace_exit "cleanup_unhealthy_namespace ns=$ns" 0
  return 0
}

cleanup_unhealthy_namespace_only() {
  local ns=$1
  if ! run_kubectl get namespace "$ns" &>/dev/null; then
    log "[$ns] SKIP: namespace does not exist"
    return 1
  fi
  cleanup_unhealthy_namespace "$ns"
}

# ================================
# Workload drain helpers (profile-driven touch list)
# ================================
scale_namespace_workloads() {
  local ns=$1 replicas ds job cj
  replicas=$(ns_resolve_replicas "$ns")

  if ns_touch "$ns" deploy; then
    run_kubectl scale deploy --all --replicas="$replicas" -n "$ns" 2>/dev/null || true
  fi
  if ns_touch "$ns" sts; then
    run_kubectl scale sts --all --replicas="$replicas" -n "$ns" 2>/dev/null || true
  fi

  if ns_touch "$ns" ds; then
    for ds in $(run_kubectl get ds -n "$ns" \
      -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || true); do
      [[ -z "$ds" ]] && continue
      run_kubectl patch ds "$ds" -n "$ns" \
        -p '{"spec":{"template":{"spec":{"nodeSelector":{"gdce-recovery-drain":"true"}}}}}' \
        --type=merge 2>/dev/null || true
    done
  fi

  if ns_touch "$ns" job; then
    for job in $(run_kubectl get job -n "$ns" \
      -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || true); do
      [[ -z "$job" ]] && continue
      run_kubectl patch job "$job" -n "$ns" \
        -p '{"spec":{"parallelism":0}}' \
        --type=merge 2>/dev/null || true
    done
  fi

  if ns_touch "$ns" cronjob; then
    for cj in $(run_kubectl get cronjob -n "$ns" \
      -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || true); do
      [[ -z "$cj" ]] && continue
      run_kubectl patch cronjob "$cj" -n "$ns" \
        -p '{"spec":{"suspend":true}}' \
        --type=merge 2>/dev/null || true
    done
  fi
}

strip_finalizers_and_delete() {
  local ns=$1
  local kind=$2
  local name=$3

  run_kubectl patch "$kind" "$name" -n "$ns" \
    -p '{"metadata":{"finalizers":[]}}' --type=merge 2>/dev/null || true

  if [[ "$kind" == "pod" ]]; then
    run_kubectl delete pod "$name" -n "$ns" --force --grace-period=0 --wait=false 2>/dev/null || true
  else
    run_kubectl delete "$kind" "$name" -n "$ns" --wait=false 2>/dev/null || true
  fi
}

delete_namespace_pod_resources() {
  local ns=$1
  local pods p

  if ! ns_touch "$ns" pods; then
    return 0
  fi

  run_kubectl delete pods --all -n "$ns" --force --grace-period=0 --wait=false 2>/dev/null || true

  pods=$(run_kubectl get pods -n "$ns" --no-headers 2>/dev/null || true)
  if [[ -n "$pods" ]]; then
    for p in $(echo "$pods" | awk '{print $1}'); do
      cleanup_pod_if_needed "$p" "$ns"
    done
  fi

  if ns_touch "$ns" pods; then
    while read -r line; do
      [[ -z "$line" ]] && continue
      p=$(echo "$line" | awk '{print $1}')
      [[ "$(echo "$line" | awk '{print $3}')" == "Terminating" ]] || continue
      strip_finalizers_and_delete "$ns" "pod" "$p"
    done < <(run_kubectl get pods -n "$ns" --no-headers 2>/dev/null || true)
  fi
}

delete_namespace_svc_resources() {
  local ns=$1

  if ! ns_touch "$ns" svc; then
    return 0
  fi

  run_kubectl delete svc --all -n "$ns" --wait=false 2>/dev/null || true

  if ns_touch "$ns" svc; then
    while read -r line; do
      [[ -z "$line" ]] && continue
      [[ "$(echo "$line" | awk '{print $3}')" == "Terminating" ]] || continue
      strip_finalizers_and_delete "$ns" "svc" "$(echo "$line" | awk '{print $1}')"
    done < <(run_kubectl get svc -n "$ns" --no-headers 2>/dev/null || true)
  fi
}

delete_namespace_resources() {
  local ns=$1
  delete_namespace_pod_resources "$ns"
  delete_namespace_svc_resources "$ns"
}

count_pods() {
  local ns=$1
  run_kubectl get pods -n "$ns" --no-headers 2>/dev/null | awk 'NF {c++} END {print c+0}'
}

count_svcs() {
  local ns=$1
  run_kubectl get svc -n "$ns" --no-headers 2>/dev/null | awk 'NF {c++} END {print c+0}'
}

# True when every Deployment/StatefulSet in ns has spec.replicas == want (skip if not in touch).
workloads_at_target_replicas() {
  local ns=$1 want line replicas
  want=$(ns_resolve_replicas "$ns")

  if ! ns_touch "$ns" deploy && ! ns_touch "$ns" sts; then
    return 0
  fi

  while read -r line; do
    [[ -z "$line" ]] && continue
    replicas=$(echo "$line" | awk '{print $NF}')
    [[ -z "$replicas" ]] && replicas=0
    if [[ "$replicas" != "$want" ]]; then
      return 1
    fi
  done < <(run_kubectl get deploy,sts -n "$ns" \
    -o jsonpath='{range .items[*]}{.kind}{"\t"}{.metadata.name}{"\t"}{.spec.replicas}{"\n"}{end}' 2>/dev/null || true)

  return 0
}

# Success for profiles that only touch pods (no deploy/sts scale).
pods_at_or_below_target() {
  local ns=$1 want pods
  want=$(ns_resolve_replicas "$ns")
  pods=$(count_pods "$ns")
  (( pods <= want ))
}

namespace_drain_complete() {
  local ns=$1 pods svcs replicas
  replicas=$(ns_resolve_replicas "$ns")

  if (( replicas == 0 )); then
    if ns_touch "$ns" pods || ns_touch "$ns" svc; then
      pods=$(count_pods "$ns")
      svcs=$(count_svcs "$ns")
      if ns_touch "$ns" pods && ns_touch "$ns" svc; then
        (( pods == 0 && svcs == 0 )) && return 0
      elif ns_touch "$ns" pods; then
        (( pods == 0 )) && return 0
      else
        (( svcs == 0 )) && return 0
      fi
      return 1
    fi
    return 0
  fi

  if ns_touch "$ns" deploy || ns_touch "$ns" sts; then
    workloads_at_target_replicas "$ns" && return 0
  fi
  if recovery_ns_is_pods_svc_only "$ns"; then
    pods=$(count_pods "$ns")
    svcs=$(count_svcs "$ns")
    (( svcs == 0 && pods <= replicas )) && return 0
    return 1
  fi
  if ns_touch "$ns" pods; then
    pods_at_or_below_target "$ns" && return 0
  fi
  return 0
}

report_remaining() {
  local ns=$1
  local pods svcs
  pods=$(count_pods "$ns")
  svcs=$(count_svcs "$ns")
  if (( pods > 0 || svcs > 0 )); then
    log "[$ns] Remaining pods ($pods):"
    run_kubectl get pods -n "$ns" --no-headers 2>/dev/null | sed 's/^/  /' || true
    log "[$ns] Remaining services ($svcs):"
    run_kubectl get svc -n "$ns" --no-headers 2>/dev/null | sed 's/^/  /' || true
  fi
}

drain_namespace() {
  local ns=$1
  local elapsed=0
  local pods svcs replicas

  trace_enter "drain_namespace ns=$ns"
  replicas=$(ns_resolve_replicas "$ns")

  log "-----------------------------"
  ns_log_profile "$ns"
  if recovery_ns_is_pods_svc_only "$ns"; then
    log "[$ns] Restart pods + delete services once (no deploy/sts/ds/job/cronjob; no re-delete loop)"
  else
    log "[$ns] Starting recovery pass (timeout ${DELETE_TIMEOUT}s)"
  fi

  if ! gdce_is_dry_run; then
    local probe_err
    probe_err=$(run_kubectl get pods -n "$ns" 2>&1) || {
      log "[$ns] ERROR: kubectl get pods failed (RBAC/connect?): $probe_err"
      trace_exit "drain_namespace ns=$ns" 1
      return 1
    }
  fi

  scale_namespace_workloads "$ns"

  if gdce_is_dry_run; then
    log "[$ns] [dry-run] touch=$(ns_resolve_touch "$ns")"
    scale_namespace_workloads "$ns"
    delete_namespace_resources "$ns"
    if recovery_ns_is_pods_svc_only "$ns"; then
      log "[$ns] [dry-run] one-pass pod restart + service delete (no poll loop)"
    else
      gdce_connect_log "[dry-run] would loop: sleep ${CHECK_INTERVAL}s (max ${DELETE_TIMEOUT}s)"
    fi
    log "[$ns] [dry-run] complete (simulated)"
    trace_exit "drain_namespace ns=$ns" 0
    return 0
  fi

  if recovery_ns_is_pods_svc_only "$ns"; then
    delete_namespace_resources "$ns"
    pods=$(count_pods "$ns")
    svcs=$(count_svcs "$ns")
    log "[$ns] One-pass complete — deleted pods/services once (current: $pods pod(s), $svcs service(s); controllers may still be recreating)"
    trace_exit "drain_namespace ns=$ns" 0
    return 0
  fi

  while (( elapsed < DELETE_TIMEOUT )); do
    scale_namespace_workloads "$ns"
    delete_namespace_resources "$ns"

    if namespace_drain_complete "$ns"; then
      if (( replicas == 0 )); then
        log "[$ns] DRAINED (profile replicas=0)"
      else
        log "[$ns] Complete (profile replicas=$replicas)"
      fi
      trace_exit "drain_namespace ns=$ns" 0
      return 0
    fi

    pods=$(count_pods "$ns")
    svcs=$(count_svcs "$ns")
    log "[$ns] Progress: $pods pod(s), $svcs service(s) — touch=$(ns_resolve_touch "$ns")"
    gdce_dry_run_sleep "$CHECK_INTERVAL"
    elapsed=$((elapsed + CHECK_INTERVAL))
  done

  report_remaining "$ns"
  log "[$ns] DRAIN TIMEOUT after ${DELETE_TIMEOUT}s"
  trace_exit "drain_namespace ns=$ns" 1
  return 1
}

# ================================
# Recovery verification
# ================================
all_pods_ready() {
  local ns=$1
  local readiness

  readiness=$(run_kubectl get pods -n "$ns" \
    -o jsonpath='{.items[*].status.containerStatuses[*].ready}' 2>/dev/null || true)

  [[ -z "$readiness" ]] && return 1
  echo "$readiness" | grep -q "false" && return 1
  return 0
}

check_namespace_recovery() {
  local ns=$1
  local expected_pods=$2
  local expected_svcs=$3
  local elapsed=0
  local current_pods current_svcs

  log "[$ns] Verifying recovery (timeout ${RECOVERY_TIMEOUT}s, expect pods>=$expected_pods svcs>=$expected_svcs)"

  if gdce_is_dry_run; then
    run_kubectl get pods -n "$ns" --no-headers 2>/dev/null || true
    run_kubectl get svc -n "$ns" --no-headers 2>/dev/null || true
    gdce_connect_log "[dry-run] would loop: sleep ${CHECK_INTERVAL}s until pods>=$expected_pods svcs>=$expected_svcs and all Ready (max ${RECOVERY_TIMEOUT}s)"
    log "[$ns] [dry-run] HEALTHY (recovery check simulated)"
    return 0
  fi

  while (( elapsed < RECOVERY_TIMEOUT )); do
    current_pods=$(count_pods "$ns")
    current_svcs=$(count_svcs "$ns")

    if (( current_pods >= expected_pods && current_svcs >= expected_svcs )); then
      if all_pods_ready "$ns"; then
        log "[$ns] HEALTHY (Pods: $current_pods/$expected_pods | Svc: $current_svcs/$expected_svcs)"
        return 0
      fi
    fi

    gdce_dry_run_sleep "$CHECK_INTERVAL"
    elapsed=$((elapsed + CHECK_INTERVAL))
  done

  current_pods=$(count_pods "$ns")
  current_svcs=$(count_svcs "$ns")
  log "[$ns] RECOVERY FAILED (Pods: $current_pods/$expected_pods | Svc: $current_svcs/$expected_svcs)"
  report_remaining "$ns"
  return 1
}

# ================================
# Per-namespace workflow
# ================================
# File-based baselines (parallel drain runs in subshells; in-memory arrays do not persist)
BASELINE_DIR=""

init_baseline_dir() {
  [[ -n "$BASELINE_DIR" ]] && return 0
  BASELINE_DIR="${SCRIPT_DIR}/.gdce_recovery_baselines.$$"
  mkdir -p "$BASELINE_DIR"
  export BASELINE_DIR
}

cleanup_baseline_dir() {
  if [[ -n "$BASELINE_DIR" && -d "$BASELINE_DIR" ]]; then
    rm -rf "$BASELINE_DIR"
    BASELINE_DIR=""
  fi
}

capture_baseline() {
  local ns=$1 pods svcs
  init_baseline_dir
  pods=$(count_pods "$ns")
  svcs=$(count_svcs "$ns")
  echo "$pods" > "$BASELINE_DIR/${ns}.pods"
  echo "$svcs" > "$BASELINE_DIR/${ns}.svcs"
  log "[$ns] Baseline -> Pods: $pods | Services: $svcs"
}

baseline_get_pods() {
  local ns=$1 f="$BASELINE_DIR/${ns}.pods"
  if [[ ! -f "$f" ]]; then
    log "[$ns] ERROR: no baseline file (drain may not have captured counts)"
    return 1
  fi
  cat "$f"
}

baseline_get_svcs() {
  local ns=$1 f="$BASELINE_DIR/${ns}.svcs"
  if [[ ! -f "$f" ]]; then
    log "[$ns] ERROR: no baseline file (drain may not have captured counts)"
    return 1
  fi
  cat "$f"
}

drain_namespace_only() {
  local ns=$1

  if ! run_kubectl get namespace "$ns" &>/dev/null; then
    log "[$ns] SKIP: namespace does not exist"
    return 1
  fi

  capture_baseline "$ns"
  drain_namespace "$ns"
}

verify_namespace_recovery() {
  local ns=$1 expected_pods expected_svcs
  expected_pods=$(baseline_get_pods "$ns") || return 1
  expected_svcs=$(baseline_get_svcs "$ns") || return 1
  check_namespace_recovery "$ns" "$expected_pods" "$expected_svcs"
}

run_phase() {
  local fn=$1
  local ns failed=0 pids=()

  log_step "run_phase $fn (${#NAMESPACES[@]} namespace(s), serial=$SERIAL)"
  trace_enter "run_phase fn=$fn"

  if [[ "$SERIAL" == "true" ]]; then
    local idx=0 total_ns=${#NAMESPACES[@]}
    for ns in ${NAMESPACES[@]+"${NAMESPACES[@]}"}; do
      idx=$((idx + 1))
      log_progress "run_phase $fn: $idx / $total_ns — namespace $ns"
      gdce_trace "run_phase serial: $fn $ns"
      "$fn" "$ns" || failed=1
    done
    trace_exit "run_phase $fn" "$failed"
    return "$failed"
  fi

  for ns in ${NAMESPACES[@]+"${NAMESPACES[@]}"}; do
    gdce_trace "run_phase parallel start: $fn $ns"
    "$fn" "$ns" &
    pids+=($!)
  done

  for pid in ${pids[@]+"${pids[@]}"}; do
    wait "$pid" || failed=1
  done

  trace_exit "run_phase $fn" "$failed"
  return "$failed"
}

# ================================
# Post-recovery health validations (hybrid migration)
# ================================
health_ns_exists() {
  if gdce_is_dry_run; then
    return 0
  fi
  run_kubectl get namespace "$1" &>/dev/null
}

health_list_bad_pods() {
  local ns="$1"
  if health_ns_is_data_plane "$ns"; then
    list_health_data_plane_cleanup_pods "$ns"
  else
    list_unhealthy_pods "$ns"
  fi
}

# Delete pods matched by health_list_bad_pods (data-plane NS includes Completed).
delete_health_cleanup_pods_in_ns() {
  local ns="$1" line pod deleted=0
  if ! recovery_touch_pods_enabled "$ns"; then
    log "[$ns] SKIP pod cleanup: profile touch does not include pods"
    return 0
  fi
  if gdce_is_dry_run; then
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      log "[$ns] [dry-run] would delete pod: $line"
      deleted=1
    done < <(health_list_bad_pods "$ns")
    [[ $deleted -eq 0 ]] && log "[$ns] [dry-run] no pods to clean (unhealthy/Completed)"
    return 0
  fi
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    pod=$(echo "$line" | awk '{print $1}')
    log "[$ns] Deleting pod: $pod ($line)"
    cleanup_pod_if_needed "$pod" "$ns"
    deleted=1
  done < <(health_list_bad_pods "$ns")
  return 0
}

health_delete_bad_pods_in_ns() {
  local ns="$1"
  if ! health_ns_exists "$ns"; then
    log "[health] [$ns] SKIP: namespace does not exist"
    return 0
  fi
  delete_health_cleanup_pods_in_ns "$ns" || true
}

health_rollout_restart_namespace() {
  local ns=$1 kind name
  if ! health_ns_exists "$ns"; then
    log "[health] [$ns] SKIP: namespace does not exist"
    return 0
  fi
  for kind in deploy sts; do
    while IFS= read -r name; do
      [[ -z "$name" ]] && continue
      log "[health] [$ns] Rollout restart $kind/$name"
      run_kubectl rollout restart "$kind" "$name" -n "$ns" 2>/dev/null || true
    done < <(run_kubectl get "$kind" -n "$ns" -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null)
  done
}

# Scale all Deployments in ns up to target replica count (from arg or namespace_groups.sh profile).
health_ensure_deploy_replicas() {
  local ns=$1 target="${2:-}" name replicas current
  if ! health_ns_exists "$ns"; then
    log "[health] [$ns] SKIP: namespace does not exist"
    return 0
  fi
  if [[ -z "$target" ]]; then
    target=$(gdce_ns_profile_replicas "$ns" "$(gdce_ns_get_group "$ns")" "$TARGET_REPLICAS")
  fi
  while IFS=$'\t' read -r name replicas; do
    [[ -z "$name" ]] && continue
    current=${replicas:-0}
    if [[ "$current" -lt "$target" ]]; then
      log "[health] [$ns] Scaling deployment/$name to $target replicas (was $current)"
      run_kubectl scale deploy "$name" -n "$ns" --replicas="$target" 2>/dev/null || true
    fi
  done < <(run_kubectl get deploy -n "$ns" \
    -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.replicas}{"\n"}{end}' 2>/dev/null)
}

health_scale_deployments_min() {
  health_ensure_deploy_replicas "$1" "${2:-1}"
}

health_namespace_labeler_replicas() {
  gdce_ns_profile_replicas "namespace-labeler" "$(gdce_ns_get_group namespace-labeler)" "2"
}

health_kroger_issuer_replicas() {
  gdce_ns_profile_replicas "kroger-issuer" "$(gdce_ns_get_group kroger-issuer)" "1"
}

health_kong_namespace_replicas() {
  local ns="${1:?kong namespace required}"
  gdce_ns_profile_replicas "$ns" "$(gdce_ns_get_group "$ns")" "1"
}

# Target replica count for step 3 platform stabilization (profiles from namespace_groups.sh).
health_ns_stabilize_target_replicas() {
  local ns="$1"
  case "$ns" in
    namespace-labeler) health_namespace_labeler_replicas ;;
    kroger-issuer) health_kroger_issuer_replicas ;;
    kong-system|kong-system-default|kong-system-pci|kong-system-fuel)
      health_kong_namespace_replicas "$ns" ;;
    *)
      gdce_ns_profile_replicas "$ns" "$(gdce_ns_get_group "$ns")" "1"
      ;;
  esac
}

health_kong_ns_join() {
  local ns out=""
  for ns in ${HEALTH_KONG_NS[@]+"${HEALTH_KONG_NS[@]}"}; do
    if [[ -z "$out" ]]; then
      out="$ns"
    else
      out+=", $ns"
    fi
  done
  echo "$out"
}

health_kong_tls_ns_join() {
  local ns out=""
  for ns in ${HEALTH_KONG_TLS_NS[@]+"${HEALTH_KONG_TLS_NS[@]}"}; do
    if [[ -z "$out" ]]; then
      out="$ns"
    else
      out+=", $ns"
    fi
  done
  echo "$out"
}

# Generic on-screen health check (used for Kong namespaces; ns + target from profile).
health_screen_namespace_header() {
  local ns="$1" target="$2" cluster
  cluster=$(gdce_cluster_display_name 2>/dev/null || echo "${GDCE_CLUSTER:-<connected>}")
  echo ""
  echo "------------------------------------------------------------------------"
  echo "  Check health: $ns"
  echo "  Cluster: $cluster  |  Target deployment replicas: $target"
  echo "------------------------------------------------------------------------"
}

health_screen_namespace_kubectl_tables() {
  local ns="$1" out
  if gdce_is_dry_run; then
    echo "  [dry-run] Skipping live Deployment/Pod table for $ns"
    return 0
  fi
  if ! health_ns_exists "$ns"; then
    echo "  Namespace '$ns' does not exist on this cluster."
    return 0
  fi
  echo ""
  echo "  --- Deployments ($ns) ---"
  if out=$(run_kubectl get deploy -n "$ns" -o wide 2>&1); then
    if [[ -z "$out" ]]; then
      echo "  (no deployments)"
    else
      echo "$out" | sed 's/^/  /'
    fi
  else
    echo "  (failed to list deployments)"
    echo "$out" | sed 's/^/  /'
  fi
  echo ""
  echo "  --- Pods ($ns) ---"
  if out=$(run_kubectl get pods -n "$ns" -o wide 2>&1); then
    if [[ -z "$out" ]]; then
      echo "  (no pods)"
    else
      echo "$out" | sed 's/^/  /'
    fi
  else
    echo "  (failed to list pods)"
    echo "$out" | sed 's/^/  /'
  fi
}

health_screen_namespace_deploy_summary() {
  local ns="$1" target="$2" name spec ready status
  echo ""
  printf "  %-36s %6s %6s %6s  %s\n" "DEPLOYMENT" "SPEC" "READY" "TARGET" "STATUS"
  printf "  %-36s %6s %6s %6s  %s\n" "------------------------------------" "------" "------" "------" "------"
  while IFS=$'\t' read -r name spec ready; do
    [[ -z "$name" ]] && continue
    spec=${spec:-0}
    ready=${ready:-0}
    status="OK"
    if [[ "$spec" -lt "$target" ]]; then
      status="FAIL (spec < $target)"
    elif [[ "$ready" != "$spec" ]]; then
      status="FAIL (ready != spec)"
    fi
    printf "  %-36s %6s %6s %6s  %s\n" "$name" "$spec" "$ready" "$target" "$status"
  done < <(run_kubectl get deploy -n "$ns" \
    -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.replicas}{"\t"}{.status.readyReplicas}{"\n"}{end}' 2>/dev/null)
}

health_screen_namespace_pod_issues() {
  local ns="$1" line
  if gdce_is_dry_run || ! health_ns_exists "$ns"; then
    return 0
  fi
  if [[ -z "$(health_list_bad_pods "$ns")" ]]; then
    echo ""
    echo "  Pods: no ERROR/CrashLoopBackOff/unhealthy pods detected"
    return 0
  fi
  echo ""
  echo "  --- Unhealthy pods ($ns) ---"
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    echo "  $line"
  done < <(health_list_bad_pods "$ns")
}

health_screen_namespace_result() {
  local ns="$1" rc=$2
  echo ""
  if [[ $rc -eq 0 ]]; then
    echo "  >>> Result: PASS — $ns is healthy <<<"
  else
    echo "  >>> Result: FAIL — $ns needs attention <<<"
  fi
  echo "------------------------------------------------------------------------"
  echo ""
}

health_eval_namespace_deploys() {
  local ns="$1" target="$2" name spec ready deploy_count=0
  HEALTH_EVAL_BAD=0
  while IFS=$'\t' read -r name spec ready; do
    [[ -z "$name" ]] && continue
    deploy_count=$((deploy_count + 1))
    spec=${spec:-0}
    ready=${ready:-0}
    if [[ "$spec" -lt "$target" ]]; then
      log "[health] [$ns] WARN deployment/$name has $spec replicas (expected >= $target)"
      HEALTH_EVAL_BAD=1
      continue
    fi
    if [[ "$ready" != "$spec" ]]; then
      log "[health] [$ns] FAIL deployment/$name ready=$ready desired=$spec"
      HEALTH_EVAL_BAD=1
    else
      log "[health] [$ns] OK deployment/$name ready=$ready spec=$spec"
    fi
  done < <(run_kubectl get deploy -n "$ns" \
    -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.replicas}{"\t"}{.status.readyReplicas}{"\n"}{end}' 2>/dev/null)
  if [[ $deploy_count -eq 0 ]]; then
    log "[health] [$ns] WARN no deployments found in namespace"
    HEALTH_EVAL_BAD=1
  fi
  if [[ -n "$(health_list_bad_pods "$ns")" ]]; then
    HEALTH_EVAL_BAD=1
  fi
  return "$HEALTH_EVAL_BAD"
}

# Check one namespace: scale, verify, optional rollout restart; print status on screen.
health_check_namespace_display() {
  local ns="$1" target="$2" bad=0 line do_restart="${3:-1}"
  log "[health] Check health $ns (expect deployments at $target replicas)"
  health_screen_namespace_header "$ns" "$target"
  if gdce_is_dry_run; then
    log "[health] [$ns] [dry-run] would scale to $target, verify readiness, rollout restart if unhealthy"
    health_screen_namespace_kubectl_tables "$ns"
    health_screen_namespace_result "$ns" 0
    return 0
  fi
  if ! health_ns_exists "$ns"; then
    log "[health] [$ns] SKIP: namespace does not exist"
    health_screen_namespace_kubectl_tables "$ns"
    health_screen_namespace_result "$ns" 0
    return 0
  fi
  health_screen_namespace_kubectl_tables "$ns"
  health_ensure_deploy_replicas "$ns" "$target"
  health_eval_namespace_deploys "$ns" "$target"
  bad=$HEALTH_EVAL_BAD
  health_screen_namespace_deploy_summary "$ns" "$target"
  health_screen_namespace_pod_issues "$ns"
  if [[ $bad -ne 0 && "$do_restart" == "1" ]]; then
    log "[health] [$ns] Unhealthy — rollout restart deploy/sts"
    health_rollout_restart_namespace "$ns"
    health_ensure_deploy_replicas "$ns" "$target"
    health_eval_namespace_deploys "$ns" "$target"
    bad=$HEALTH_EVAL_BAD
    if [[ -n "$(health_list_bad_pods "$ns")" ]]; then
      log "[health] [$ns] FAIL unhealthy pods still present after rollout restart"
      while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        log "[health] [$ns] pod: $line"
      done < <(health_list_bad_pods "$ns")
      bad=1
    fi
  elif [[ $bad -ne 0 ]]; then
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      log "[health] [$ns] pod: $line"
    done < <(health_list_bad_pods "$ns")
  fi
  echo ""
  echo "  --- After check ($ns) ---"
  health_screen_namespace_kubectl_tables "$ns"
  health_screen_namespace_result "$ns" "$bad"
  if [[ $bad -ne 0 ]]; then
    return 1
  fi
  log "[health] [$ns] healthy"
  return 0
}

health_screen_kong_suite_header() {
  local cluster
  cluster=$(gdce_cluster_display_name 2>/dev/null || echo "${GDCE_CLUSTER:-<connected>}")
  echo ""
  echo "========================================================================"
  echo "  Check health: Kong namespaces"
  echo "  Cluster: $cluster"
  echo "  Namespaces: $(health_kong_ns_join)"
  echo "  Target deployment replicas: 1 each (namespace_groups.sh)"
  echo "========================================================================"
}

health_screen_kong_suite_result() {
  local rc=$1
  echo ""
  if [[ $rc -eq 0 ]]; then
    echo "  >>> Suite result: PASS — all Kong namespaces healthy <<<"
  else
    echo "  >>> Suite result: FAIL — one or more Kong namespaces need attention <<<"
  fi
  echo "========================================================================"
  echo ""
}

health_check_all_kong_namespaces() {
  local ns target failed=0

  log "[health] Kong recovery: ensure kong-default-tls secrets refreshed and certificates Ready=True before deploy/pod checks"
  if ! health_fix_kong_tls_and_wait; then
    log "[health] Kong TLS precondition failed — aborting Kong namespace health check"
    return 1
  fi

  health_screen_kong_suite_header
  if gdce_is_dry_run; then
    for ns in ${HEALTH_KONG_NS[@]+"${HEALTH_KONG_NS[@]}"}; do
      target=$(health_kong_namespace_replicas "$ns")
      health_check_namespace_display "$ns" "$target" 0
    done
    health_screen_kong_suite_result 0
    return 0
  fi
  for ns in ${HEALTH_KONG_NS[@]+"${HEALTH_KONG_NS[@]}"}; do
    target=$(health_kong_namespace_replicas "$ns")
    if ! health_check_namespace_display "$ns" "$target" 1; then
      failed=1
    fi
  done
  health_screen_kong_suite_result "$failed"
  return "$failed"
}

# On-screen status for check health kroger-issuer (step 1 and --check-health-kroger-issuer).
health_screen_kroger_issuer_header() {
  local target cluster
  target=$(health_kroger_issuer_replicas)
  cluster=$(gdce_cluster_display_name 2>/dev/null || echo "${GDCE_CLUSTER:-<connected>}")
  echo ""
  echo "========================================================================"
  echo "  Check health: kroger-issuer"
  echo "  Cluster: $cluster  |  Target deployment replicas: $target"
  echo "========================================================================"
}

health_screen_kroger_issuer_kubectl_tables() {
  local ns="kroger-issuer" out
  if gdce_is_dry_run; then
    echo ""
    echo "  [dry-run] Skipping live Deployment/Pod table (kubectl actions logged with [health] prefix)."
    return 0
  fi
  if ! health_ns_exists "$ns"; then
    echo ""
    echo "  Namespace '$ns' does not exist on this cluster."
    return 0
  fi
  echo ""
  echo "  --- Deployments (kubectl get deploy -o wide) ---"
  if out=$(run_kubectl get deploy -n "$ns" -o wide 2>&1); then
    if [[ -z "$out" ]]; then
      echo "  (no deployments)"
    else
      echo "$out" | sed 's/^/  /'
    fi
  else
    echo "  (failed to list deployments)"
    echo "$out" | sed 's/^/  /'
  fi
  echo ""
  echo "  --- Pods (kubectl get pods -o wide) ---"
  if out=$(run_kubectl get pods -n "$ns" -o wide 2>&1); then
    if [[ -z "$out" ]]; then
      echo "  (no pods)"
    else
      echo "$out" | sed 's/^/  /'
    fi
  else
    echo "  (failed to list pods)"
    echo "$out" | sed 's/^/  /'
  fi
}

health_screen_kroger_issuer_deploy_summary() {
  local ns="kroger-issuer" target="$1" name spec ready status
  echo ""
  printf "  %-36s %6s %6s %6s  %s\n" "DEPLOYMENT" "SPEC" "READY" "TARGET" "STATUS"
  printf "  %-36s %6s %6s %6s  %s\n" "------------------------------------" "------" "------" "------" "------"
  while IFS=$'\t' read -r name spec ready; do
    [[ -z "$name" ]] && continue
    spec=${spec:-0}
    ready=${ready:-0}
    status="OK"
    if [[ "$spec" -lt "$target" ]]; then
      status="FAIL (spec < $target)"
    elif [[ "$ready" != "$spec" ]]; then
      status="FAIL (ready != spec)"
    fi
    printf "  %-36s %6s %6s %6s  %s\n" "$name" "$spec" "$ready" "$target" "$status"
  done < <(run_kubectl get deploy -n "$ns" \
    -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.replicas}{"\t"}{.status.readyReplicas}{"\n"}{end}' 2>/dev/null)
}

health_screen_kroger_issuer_pod_issues() {
  local ns="kroger-issuer" line
  if gdce_is_dry_run || ! health_ns_exists "$ns"; then
    return 0
  fi
  if [[ -z "$(health_list_bad_pods "$ns")" ]]; then
    echo ""
    echo "  Pods: no ERROR/CrashLoopBackOff/unhealthy pods detected"
    return 0
  fi
  echo ""
  echo "  --- Unhealthy pods ---"
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    echo "  $line"
  done < <(health_list_bad_pods "$ns")
}

health_screen_kroger_issuer_result() {
  local rc=$1
  echo ""
  if [[ $rc -eq 0 ]]; then
    echo "  >>> Result: PASS — kroger-issuer is healthy <<<"
  else
    echo "  >>> Result: FAIL — kroger-issuer needs attention <<<"
  fi
  echo "========================================================================"
  echo ""
}

# Returns 0 if healthy, 1 if not. Sets bad via health_eval_kroger_issuer_deploys.
health_eval_kroger_issuer_deploys() {
  local ns="kroger-issuer" target="$1" name spec ready deploy_count=0
  HEALTH_EVAL_BAD=0
  while IFS=$'\t' read -r name spec ready; do
    [[ -z "$name" ]] && continue
    deploy_count=$((deploy_count + 1))
    spec=${spec:-0}
    ready=${ready:-0}
    if [[ "$spec" -lt "$target" ]]; then
      log "[health] [$ns] WARN deployment/$name has $spec replicas (expected >= $target)"
      HEALTH_EVAL_BAD=1
      continue
    fi
    if [[ "$ready" != "$spec" ]]; then
      log "[health] [$ns] FAIL deployment/$name ready=$ready desired=$spec"
      HEALTH_EVAL_BAD=1
    else
      log "[health] [$ns] OK deployment/$name ready=$ready spec=$spec"
    fi
  done < <(run_kubectl get deploy -n "$ns" \
    -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.replicas}{"\t"}{.status.readyReplicas}{"\n"}{end}' 2>/dev/null)
  if [[ $deploy_count -eq 0 ]]; then
    log "[health] [$ns] WARN no deployments found in namespace"
    HEALTH_EVAL_BAD=1
  fi
  if [[ -n "$(health_list_bad_pods "$ns")" ]]; then
    HEALTH_EVAL_BAD=1
  fi
  return "$HEALTH_EVAL_BAD"
}

health_check_kroger_issuer() {
  local ns="kroger-issuer" target bad=0 line do_restart="${1:-1}"
  target=$(health_kroger_issuer_replicas)
  log "[health] Check health kroger-issuer (expect deployments at $target replicas)"
  if ! health_ensure_kong_tls_before_platform; then
    log "[health] FAIL: kong-default-tls not Ready — kroger-issuer check aborted"
    health_screen_kroger_issuer_header
    health_screen_kroger_issuer_result 1
    return 1
  fi
  health_screen_kroger_issuer_header
  if gdce_is_dry_run; then
    log "[health] [$ns] [dry-run] would scale to $target, verify readiness, rollout restart if unhealthy"
    health_screen_kroger_issuer_kubectl_tables
    health_screen_kroger_issuer_result 0
    return 0
  fi
  if ! health_ns_exists "$ns"; then
    log "[health] [$ns] SKIP: namespace does not exist"
    echo ""
    echo "  Namespace '$ns' does not exist on this cluster."
    health_screen_kroger_issuer_result 0
    return 0
  fi
  health_screen_kroger_issuer_kubectl_tables
  health_ensure_deploy_replicas "$ns" "$target"
  health_eval_kroger_issuer_deploys "$target"
  bad=$HEALTH_EVAL_BAD
  health_screen_kroger_issuer_deploy_summary "$target"
  health_screen_kroger_issuer_pod_issues
  if [[ $bad -ne 0 && "$do_restart" == "1" ]]; then
    log "[health] [$ns] Unhealthy — rollout restart deploy/sts"
    health_rollout_restart_namespace "$ns"
    health_ensure_deploy_replicas "$ns" "$target"
    health_eval_kroger_issuer_deploys "$target"
    bad=$HEALTH_EVAL_BAD
    if [[ -n "$(health_list_bad_pods "$ns")" ]]; then
      log "[health] [$ns] FAIL unhealthy pods still present after rollout restart"
      while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        log "[health] [$ns] pod: $line"
      done < <(health_list_bad_pods "$ns")
      bad=1
    fi
  elif [[ $bad -ne 0 ]]; then
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      log "[health] [$ns] pod: $line"
    done < <(health_list_bad_pods "$ns")
  fi
  health_screen_kroger_issuer_kubectl_tables
  health_screen_kroger_issuer_result "$bad"
  if [[ $bad -ne 0 ]]; then
    return 1
  fi
  log "[health] [$ns] kroger-issuer healthy"
  return 0
}

# On-screen status for "check health namespace-labeler" (step 8 and --check-health-namespace-labeler).
health_screen_namespace_labeler_header() {
  local target cluster
  target=$(health_namespace_labeler_replicas)
  cluster=$(gdce_cluster_display_name 2>/dev/null || echo "${GDCE_CLUSTER:-<connected>}")
  echo ""
  echo "========================================================================"
  echo "  Check health: namespace-labeler"
  echo "  Cluster: $cluster  |  Target deployment replicas: $target"
  echo "========================================================================"
}

health_screen_namespace_labeler_kubectl_tables() {
  local ns="namespace-labeler" out
  if gdce_is_dry_run; then
    echo ""
    echo "  [dry-run] Skipping live Deployment/Pod table (kubectl actions logged with [health] prefix)."
    return 0
  fi
  if ! health_ns_exists "$ns"; then
    echo ""
    echo "  Namespace '$ns' does not exist on this cluster."
    return 0
  fi
  echo ""
  echo "  --- Deployments (kubectl get deploy -o wide) ---"
  if out=$(run_kubectl get deploy -n "$ns" -o wide 2>&1); then
    if [[ -z "$out" ]]; then
      echo "  (no deployments)"
    else
      echo "$out" | sed 's/^/  /'
    fi
  else
    echo "  (failed to list deployments)"
    echo "$out" | sed 's/^/  /'
  fi
  echo ""
  echo "  --- Pods (kubectl get pods -o wide) ---"
  if out=$(run_kubectl get pods -n "$ns" -o wide 2>&1); then
    if [[ -z "$out" ]]; then
      echo "  (no pods)"
    else
      echo "$out" | sed 's/^/  /'
    fi
  else
    echo "  (failed to list pods)"
    echo "$out" | sed 's/^/  /'
  fi
}

health_screen_namespace_labeler_deploy_summary() {
  local ns="namespace-labeler" target="$1" name spec ready status
  echo ""
  printf "  %-36s %6s %6s %6s  %s\n" "DEPLOYMENT" "SPEC" "READY" "TARGET" "STATUS"
  printf "  %-36s %6s %6s %6s  %s\n" "------------------------------------" "------" "------" "------" "------"
  while IFS=$'\t' read -r name spec ready; do
    [[ -z "$name" ]] && continue
    spec=${spec:-0}
    ready=${ready:-0}
    status="OK"
    if [[ "$spec" -lt "$target" ]]; then
      status="FAIL (spec < $target)"
    elif [[ "$ready" != "$spec" ]]; then
      status="FAIL (ready != spec)"
    fi
    printf "  %-36s %6s %6s %6s  %s\n" "$name" "$spec" "$ready" "$target" "$status"
  done < <(run_kubectl get deploy -n "$ns" \
    -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.replicas}{"\t"}{.status.readyReplicas}{"\n"}{end}' 2>/dev/null)
}

health_screen_namespace_labeler_pod_issues() {
  local ns="namespace-labeler" line
  if gdce_is_dry_run || ! health_ns_exists "$ns"; then
    return 0
  fi
  if [[ -z "$(health_list_bad_pods "$ns")" ]]; then
    echo ""
    echo "  Pods: no ERROR/CrashLoopBackOff/unhealthy pods detected"
    return 0
  fi
  echo ""
  echo "  --- Unhealthy pods ---"
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    echo "  $line"
  done < <(health_list_bad_pods "$ns")
}

health_screen_namespace_labeler_result() {
  local rc=$1
  echo ""
  if [[ $rc -eq 0 ]]; then
    echo "  >>> Result: PASS — namespace-labeler is healthy <<<"
  else
    echo "  >>> Result: FAIL — namespace-labeler needs attention <<<"
  fi
  echo "========================================================================"
  echo ""
}

health_scale_named_deploy() {
  local ns=$1 deploy=$2 replicas=$3
  if ! health_ns_exists "$ns"; then
    log "[health] [$ns] SKIP: namespace does not exist"
    return 0
  fi
  if ! run_kubectl get deploy "$deploy" -n "$ns" &>/dev/null; then
    log "[health] [$ns] SKIP: deployment/$deploy not found"
    return 0
  fi
  log "[health] [$ns] Scaling deployment/$deploy to $replicas replicas"
  run_kubectl scale deploy "$deploy" -n "$ns" --replicas="$replicas"
}

health_ensure_kong_tls_before_platform() {
  log "[health] Kong TLS precondition (required before kroger-issuer / Kong platform recovery)"
  health_fix_kong_tls_and_wait
}

health_restart_kroger_issuer() {
  log "[health] Step 1: kroger-issuer (Kong TLS first, then check health; 1 replica; rollout restart if unhealthy)"
  if ! health_ensure_kong_tls_before_platform; then
    log "[health] FAIL: kong-default-tls not Ready in Kong namespaces — fix TLS before kroger-issuer"
    return 1
  fi
  health_check_kroger_issuer 1
}

health_fix_kong_default_tls() {
  local ns line status deleted=0
  log "[health] Step 2: Delete kong-default-tls secrets in Kong namespaces ($(health_kong_tls_ns_join)); wait for Certificate Ready=True before Kong recovery"
  for ns in ${HEALTH_KONG_TLS_NS[@]+"${HEALTH_KONG_TLS_NS[@]}"}; do
    if ! health_ns_exists "$ns"; then
      log "[health] [$ns] SKIP: namespace does not exist"
      continue
    fi
    if gdce_is_dry_run; then
      line=$(run_kubectl get certificate kong-default-tls -n "$ns" --no-headers 2>/dev/null || true)
      if run_kubectl get secret kong-default-tls -n "$ns" &>/dev/null; then
        log "[health] [$ns] [dry-run] would delete secret kong-default-tls"
        deleted=1
      elif [[ -n "$line" ]]; then
        status=$(echo "$line" | awk '{print $2}')
        log "[health] [$ns] [dry-run] would delete secret kong-default-tls (certificate Ready=$status)"
        deleted=1
      fi
      continue
    fi
    if run_kubectl get secret kong-default-tls -n "$ns" &>/dev/null; then
      log "[health] [$ns] deleting secret kong-default-tls"
      run_kubectl delete secret kong-default-tls -n "$ns" --ignore-not-found
      deleted=1
      continue
    fi
    line=$(run_kubectl get certificate kong-default-tls -n "$ns" --no-headers 2>/dev/null || true)
    if [[ -z "$line" ]]; then
      continue
    fi
    status=$(echo "$line" | awk '{print $2}')
    if [[ "$status" != "True" ]]; then
      log "[health] [$ns] certificate/kong-default-tls Ready=$status — deleting secret kong-default-tls (if present)"
      run_kubectl delete secret kong-default-tls -n "$ns" --ignore-not-found
      deleted=1
    else
      log "[health] [$ns] certificate/kong-default-tls Ready=True (no secret to delete)"
    fi
  done
  if [[ $deleted -eq 0 ]]; then
    log "[health] No kong-default-tls secrets removed (none present or namespaces missing)"
  fi
}

health_fix_kong_tls_and_wait() {
  health_fix_kong_default_tls || return 1
  health_wait_kong_certs_ready || return 1
  return 0
}

health_wait_kong_certs_ready() {
  local ns line status elapsed=0 pending
  if gdce_is_dry_run; then
    log "[health] [dry-run] skip certificate Ready poll (no status wait)"
    return 0
  fi
  log "[health] Waiting for kong-default-tls certificates (timeout ${HEALTH_WAIT_TIMEOUT}s)"
  while (( elapsed < HEALTH_WAIT_TIMEOUT )); do
    pending=0
    for ns in ${HEALTH_KONG_TLS_NS[@]+"${HEALTH_KONG_TLS_NS[@]}"}; do
      if ! health_ns_exists "$ns"; then
        continue
      fi
      line=$(run_kubectl get certificate kong-default-tls -n "$ns" --no-headers 2>/dev/null || true)
      if [[ -z "$line" ]]; then
        continue
      fi
      status=$(echo "$line" | awk '{print $2}')
      if [[ "$status" != "True" ]]; then
        pending=1
        log "[health] [$ns] certificate/kong-default-tls Ready=$status (waiting)"
      fi
    done
    if [[ $pending -eq 0 ]]; then
      log "[health] All kong-default-tls certificates are True (or absent)"
      return 0
    fi
    gdce_dry_run_sleep 10
    elapsed=$((elapsed + 10))
  done
  log "[health] WARN: kong-default-tls not all True within ${HEALTH_WAIT_TIMEOUT}s"
  return 1
}

health_stabilize_platform_deploys() {
  local ns target
  log "[health] Step 3: Scale platform deployments (Kong namespaces=1, kroger-issuer=1, namespace-labeler=2)"
  for ns in ${HEALTH_KONG_NS[@]+"${HEALTH_KONG_NS[@]}"}; do
    if health_ns_exists "$ns"; then
      target=$(health_kong_namespace_replicas "$ns")
      log "[health] [$ns] Ensuring Kong deployments >= $target replicas"
      health_ensure_deploy_replicas "$ns" "$target"
    fi
  done
  for ns in ${HEALTH_STABILIZE_NS[@]+"${HEALTH_STABILIZE_NS[@]}"}; do
    case "$ns" in
      kong-system|kong-system-default|kong-system-pci|kong-system-fuel) continue ;;
    esac
    target=$(health_ns_stabilize_target_replicas "$ns")
    log "[health] [$ns] Ensuring deployments >= $target replicas"
    health_ensure_deploy_replicas "$ns" "$target"
  done
}

health_screen_data_namespace_header() {
  local ns="$1" target="$2"
  echo ""
  echo "------------------------------------------------------------------------"
  echo "  Check health: $ns  (target deployment replicas: $target)"
  echo "------------------------------------------------------------------------"
}

health_screen_data_namespace_tables() {
  local ns="$1" out
  if gdce_is_dry_run; then
    echo "  [dry-run] Skipping live Deployment/Pod table for $ns"
    return 0
  fi
  echo ""
  echo "  --- Deployments ($ns) ---"
  if out=$(run_kubectl get deploy -n "$ns" -o wide 2>&1); then
    if [[ -z "$out" ]]; then
      echo "  (no deployments)"
    else
      echo "$out" | sed 's/^/  /'
    fi
  else
    echo "  (failed to list deployments)"
    echo "$out" | sed 's/^/  /'
  fi
  echo ""
  echo "  --- Pods ($ns) ---"
  if out=$(run_kubectl get pods -n "$ns" -o wide 2>&1); then
    if [[ -z "$out" ]]; then
      echo "  (no pods)"
    else
      echo "$out" | sed 's/^/  /'
    fi
  else
    echo "  (failed to list pods)"
    echo "$out" | sed 's/^/  /'
  fi
}

# Scale deployments to profile replicas; rollout restart deploy/sts if unhealthy pods exist.
health_check_and_fix_rollout_namespace() {
  local ns="$1" bad=0 target group
  if ! health_ns_exists "$ns"; then
    log "[health] [$ns] SKIP: namespace does not exist"
    return 0
  fi
  group=$(gdce_ns_get_group "$ns")
  target=$(gdce_ns_profile_replicas "$ns" "$group" "$TARGET_REPLICAS")
  log "[health] [$ns] Check health (target deploy replicas: $target, touch=$(gdce_ns_profile_touch "$ns" "$group" "$TARGET_REPLICAS"))"
  health_screen_data_namespace_header "$ns" "$target"
  if gdce_is_dry_run; then
    log "[health] [$ns] [dry-run] would scale deployments to $target and rollout restart if unhealthy"
    health_screen_data_namespace_tables "$ns"
    return 0
  fi
  health_screen_data_namespace_tables "$ns"
  health_ensure_deploy_replicas "$ns" "$target"
  bad=$(count_unhealthy_pods "$ns")
  if [[ "$bad" -gt 0 ]]; then
    log "[health] [$ns] $bad unhealthy pod(s) — rollout restart deploy/sts"
    health_rollout_restart_namespace "$ns"
    echo ""
    echo "  --- After rollout restart ($ns) ---"
    health_screen_data_namespace_tables "$ns"
  else
    log "[health] [$ns] No unhealthy pods detected"
  fi
  return 0
}

health_fix_data_plane_namespaces() {
  local ns
  log "[health] Step 4: Check health rabbitmq-system, elastic-system, mongodb (scale deploy; rollout restart if unhealthy)"
  for ns in ${HEALTH_ROLLOUT_RESTART_NS[@]+"${HEALTH_ROLLOUT_RESTART_NS[@]}"}; do
    health_check_and_fix_rollout_namespace "$ns" || true
  done
}

health_fix_elastic_system() {
  health_fix_data_plane_namespaces
}

health_scale_ngpos_elk() {
  log "[health] Step 5: Scale ngpos-elk in ngpos-shared to 3 replicas"
  if health_ns_exists "ngpos-shared"; then
    if run_kubectl get deploy ngpos-elk -n ngpos-shared &>/dev/null; then
      health_scale_named_deploy "ngpos-shared" "ngpos-elk" 3
    elif run_kubectl get deploy ngps-elk -n ngpos-shared &>/dev/null; then
      health_scale_named_deploy "ngpos-shared" "ngps-elk" 3
    else
      log "[health] [ngpos-shared] SKIP: neither ngpos-elk nor ngps-elk deployment found"
    fi
  else
    log "[health] [ngpos-shared] SKIP: namespace does not exist"
  fi
}

health_fix_rabbitmq_system() {
  local ns
  log "[health] Step 6: Remove ERROR/unhealthy/Completed pods in rabbitmq-system, elastic-system, mongodb"
  for ns in ${HEALTH_ROLLOUT_RESTART_NS[@]+"${HEALTH_ROLLOUT_RESTART_NS[@]}"}; do
    health_delete_bad_pods_in_ns "$ns"
  done
}

health_assert_no_bad_pods() {
  local ns bad=0 line
  log "[health] Step 7: Verify no ERROR/unhealthy/Completed pods (data plane) and no unhealthy pods (Kong) in monitored namespaces"
  if gdce_is_dry_run; then
    log "[health] [dry-run] skip live pod health poll (commands already logged above)"
    return 0
  fi
  for ns in ${HEALTH_POD_CHECK_NS[@]+"${HEALTH_POD_CHECK_NS[@]}"}; do
    if ! health_ns_exists "$ns"; then
      log "[health] [$ns] SKIP: namespace does not exist"
      continue
    fi
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      log "[health] [$ns] FAIL unhealthy pod: $line"
      bad=1
    done < <(health_list_bad_pods "$ns")
  done
  if [[ $bad -ne 0 ]]; then
    return 1
  fi
  log "[health] Pod health check passed for monitored namespaces"
  return 0
}

health_check_namespace_labeler() {
  local ns="namespace-labeler" line name ready desired spec bad=0 target deploy_count=0
  target=$(health_namespace_labeler_replicas)
  log "[health] Step 8: Check health namespace-labeler (expect deployments at $target replicas)"
  health_screen_namespace_labeler_header
  if gdce_is_dry_run; then
    log "[health] [dry-run] would scale namespace-labeler deployments to $target and verify readiness"
    health_screen_namespace_labeler_kubectl_tables
    health_screen_namespace_labeler_result 0
    return 0
  fi
  if ! health_ns_exists "$ns"; then
    log "[health] [$ns] SKIP: namespace does not exist"
    echo ""
    echo "  Namespace '$ns' does not exist on this cluster."
    health_screen_namespace_labeler_result 0
    return 0
  fi
  health_screen_namespace_labeler_kubectl_tables
  health_ensure_deploy_replicas "$ns" "$target"
  while IFS=$'\t' read -r name spec ready; do
    [[ -z "$name" ]] && continue
    deploy_count=$((deploy_count + 1))
    spec=${spec:-0}
    ready=${ready:-0}
    if [[ "$spec" -lt "$target" ]]; then
      log "[health] [$ns] WARN deployment/$name has $spec replicas (expected >= $target)"
      bad=1
      continue
    fi
    if [[ "$ready" != "$spec" ]]; then
      log "[health] [$ns] FAIL deployment/$name ready=$ready desired=$spec"
      bad=1
    else
      log "[health] [$ns] OK deployment/$name ready=$ready spec=$spec"
    fi
  done < <(run_kubectl get deploy -n "$ns" \
    -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.replicas}{"\t"}{.status.readyReplicas}{"\n"}{end}' 2>/dev/null)
  if [[ $deploy_count -eq 0 ]]; then
    log "[health] [$ns] WARN no deployments found in namespace"
    bad=1
  fi
  health_screen_namespace_labeler_deploy_summary "$target"
  health_screen_namespace_labeler_pod_issues
  if [[ -n "$(health_list_bad_pods "$ns")" ]]; then
    log "[health] [$ns] FAIL unhealthy pods present"
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      log "[health] [$ns] pod: $line"
    done < <(health_list_bad_pods "$ns")
    bad=1
  fi
  health_screen_namespace_labeler_kubectl_tables
  health_screen_namespace_labeler_result "$bad"
  if [[ $bad -ne 0 ]]; then
    return 1
  fi
  log "[health] [$ns] namespace-labeler healthy"
  return 0
}

# -----------------------------
# Restore ngpos workloads from replica-backup.json (health step 9)
# -----------------------------
health_resolve_replica_backup_legacy_file() {
  local path
  gdce_namespace_groups_load_cache || true
  eval "path=\"\${GDCE_REPLICA_BACKUP_FILE:-replica-backup.json}\""
  case "$path" in
    /*|[A-Za-z]:/*|[A-Za-z]:\\*)
      REPLICA_BACKUP_FILE="$path"
      ;;
    *)
      REPLICA_BACKUP_FILE="$SCRIPT_DIR/$path"
      ;;
  esac
}

# Populate REPLICA_BACKUP_GROUP_LIST / REPLICA_BACKUP_FILE_LIST (per-group files, legacy fallback).
health_resolve_replica_backup_sources() {
  local g file groups=()
  REPLICA_BACKUP_GROUP_LIST=()
  REPLICA_BACKUP_FILE_LIST=()
  while IFS= read -r g; do
    [[ -z "$g" ]] && continue
    groups+=("$g")
  done < <(gdce_replica_backup_groups_for_restore)
  for g in ${groups[@]+"${groups[@]}"}; do
    file=$(gdce_replica_backup_file_for_group "$g")
    if [[ -f "$file" ]]; then
      REPLICA_BACKUP_GROUP_LIST+=("$g")
      REPLICA_BACKUP_FILE_LIST+=("$file")
    fi
  done
  if [[ ${#REPLICA_BACKUP_FILE_LIST[@]} -eq 0 ]]; then
    health_resolve_replica_backup_legacy_file
    if [[ -f "$REPLICA_BACKUP_FILE" ]]; then
      REPLICA_BACKUP_GROUP_LIST=("legacy")
      REPLICA_BACKUP_FILE_LIST=("$REPLICA_BACKUP_FILE")
    fi
  fi
}

health_replica_backup_sources_summary() {
  local i=0 parts=()
  for i in "${!REPLICA_BACKUP_FILE_LIST[@]}"; do
    parts+=("${REPLICA_BACKUP_GROUP_LIST[$i]}=$(basename "${REPLICA_BACKUP_FILE_LIST[$i]}")")
  done
  if [[ ${#parts[@]} -eq 0 ]]; then
    echo "(no backup files found)"
  else
    local IFS=', '
    echo "${parts[*]}"
  fi
}

# Entry count for summary/diagnostics (jq or python; 0 if file missing or not a JSON array).
health_replica_backup_entry_count() {
  local file="$1" n
  [[ -f "$file" ]] || {
    echo 0
    return 0
  }
  n=$(gdce_replica_backup_array_length "$file") || {
    echo 0
    return 1
  }
  echo "${n:-0}"
}

health_restore_log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] [health] $*" >&2
}

health_restore_one_workload_entry() {
  local i="$1"
  gdce_restore_apply_workload \
    "$(gdce_jq_entry_field "$i" '.namespace')" \
    "$(gdce_jq_entry_field "$i" '.kind')" \
    "$(gdce_jq_entry_field "$i" '.name')" \
    "$(gdce_jq_entry_field "$i" '.action // "scale"')" \
    "$(gdce_jq_entry_field "$i" '.replicas // 1')" \
    "$(gdce_jq_entry_field "$i" '.parallelism // 1')" \
    "$(gdce_jq_entry_field "$i" '.suspend // false')" \
    "$(printf '%s' "$i" | gdce_jq -c '.nodeSelector // {}' | tr -d '\r\n')"
}

health_restore_log_skip_missing_ns() {
  local ns="$1"
  ns=$(printf '%s' "$ns" | tr -d '\r\n')
  [[ -z "$ns" || "$ns" == "null" ]] && return 0
  case ",${HEALTH_RESTORE_MISSING_NS}," in
    *,"$ns",*) ;;
    *)
      HEALTH_RESTORE_MISSING_NS="${HEALTH_RESTORE_MISSING_NS},${ns}"
      echo "[$(date +'%Y-%m-%d %H:%M:%S')] [health] SKIP restore: namespace '${ns}' not found on cluster" >&2
      ;;
  esac
}

health_restore_entries_from_backup_file() {
  local backup_file="$1" group_label="$2"
  local ns kind name action replicas parallelism suspend node_selector
  local file_total=0 restored=0 skipped_ns=0 skipped_scope=0 bad=0
  local saved_timeout="${GDCE_KUBECTL_REQUEST_TIMEOUT:-}" saved_quiet="${GDCE_RESTORE_QUIET_KUBECTL:-}"
  local ns_warm=0

  HEALTH_RESTORE_GROUP_RESTORED=0
  HEALTH_RESTORE_MISSING_NS=""
  if [[ ! -f "$backup_file" ]]; then
    return 0
  fi
  if ! gdce_replica_backup_is_json_array "$backup_file"; then
    log "[health] ERROR: $backup_file (group $group_label) is not a valid JSON array"
    return 1
  fi
  file_total=$(health_replica_backup_entry_count "$backup_file") || file_total=0
  log "[health] [$group_label] backup file $backup_file contains $file_total entries"

  if gdce_is_dry_run; then
    while gdce_restore_read_row; do
      if gdce_ns_is_ngpos_pods_svc_refresh_ns "$RESTORE_ROW_NS"; then
        gdce_restore_apply_workload "$RESTORE_ROW_NS" "$RESTORE_ROW_KIND" "$RESTORE_ROW_NAME" \
          "$RESTORE_ROW_ACTION" "$RESTORE_ROW_REPLICAS" "$RESTORE_ROW_PARALLELISM" \
          "$RESTORE_ROW_SUSPEND" "$RESTORE_ROW_NODE_SELECTOR"
      fi
    done < <(gdce_replica_backup_stream_restore_rows "$backup_file")
    return 0
  fi

  GDCE_RESTORE_QUIET_KUBECTL=1
  GDCE_KUBECTL_REQUEST_TIMEOUT="${GDCE_RESTORE_KUBECTL_TIMEOUT:-60s}"
  gdce_restore_ns_cache_warm
  ns_warm=0
  if [[ -n "${GDCE_RESTORE_NS_OK}" ]]; then
    ns_warm=$(printf '%s' "${GDCE_RESTORE_NS_OK#,}" | tr ',' '\n' | grep -c '^.' 2>/dev/null || echo 0)
  fi
  log "[health] [$group_label] restore fast path: ${ns_warm} namespace(s) cached, kubectl timeout ${GDCE_KUBECTL_REQUEST_TIMEOUT}, per-scale logs only with --verbose"

  while gdce_restore_read_row; do
    if ! gdce_ns_is_ngpos_pods_svc_refresh_ns "$RESTORE_ROW_NS"; then
      skipped_scope=$((skipped_scope + 1))
      continue
    fi
    if ! gdce_restore_ns_exists "$RESTORE_ROW_NS"; then
      health_restore_log_skip_missing_ns "$RESTORE_ROW_NS"
      skipped_ns=$((skipped_ns + 1))
      continue
    fi
    if gdce_restore_apply_workload "$RESTORE_ROW_NS" "$RESTORE_ROW_KIND" "$RESTORE_ROW_NAME" \
      "$RESTORE_ROW_ACTION" "$RESTORE_ROW_REPLICAS" "$RESTORE_ROW_PARALLELISM" \
      "$RESTORE_ROW_SUSPEND" "$RESTORE_ROW_NODE_SELECTOR"; then
      restored=$((restored + 1))
    else
      bad=1
    fi
  done < <(gdce_replica_backup_stream_restore_rows "$backup_file")

  GDCE_RESTORE_QUIET_KUBECTL="$saved_quiet"
  GDCE_KUBECTL_REQUEST_TIMEOUT="$saved_timeout"

  log "[health]   [$group_label] restored (ngpos): $restored | skipped scope: $skipped_scope | skipped NS: $skipped_ns"
  if [[ $skipped_ns -gt 0 && -n "$HEALTH_RESTORE_MISSING_NS" ]]; then
    log "[health]   [$group_label] missing namespaces on cluster:${HEALTH_RESTORE_MISSING_NS}"
  fi
  HEALTH_RESTORE_GROUP_RESTORED=$restored
  [[ $bad -ne 0 ]] && return 1
  return 0
}

health_restore_data_plane_cr_entries_from_backup_file() {
  local backup_file="$1" group_label="$2"
  local file_total=0 restored=0 skipped_ns=0 skipped_scope=0 bad=0 cr_entries=0
  local saved_timeout="${GDCE_KUBECTL_REQUEST_TIMEOUT:-}" saved_quiet="${GDCE_RESTORE_QUIET_KUBECTL:-}"
  local ns_warm=0

  HEALTH_RESTORE_GROUP_RESTORED=0
  HEALTH_RESTORE_MISSING_NS=""
  if [[ ! -f "$backup_file" ]]; then
    return 0
  fi
  if ! gdce_replica_backup_is_json_array "$backup_file"; then
    log "[health] ERROR: $backup_file (group $group_label) is not a valid JSON array"
    return 1
  fi
  file_total=$(health_replica_backup_entry_count "$backup_file") || file_total=0
  log "[health] [$group_label] backup file $backup_file contains $file_total entries (filter: operator CR actions)"

  if gdce_is_dry_run; then
    while gdce_restore_read_row; do
      if ! gdce_restore_is_data_plane_cr_action "$RESTORE_ROW_ACTION"; then
        continue
      fi
      cr_entries=$((cr_entries + 1))
      if gdce_ns_is_data_plane_operator_ns "$RESTORE_ROW_NS"; then
        gdce_restore_apply_workload "$RESTORE_ROW_NS" "$RESTORE_ROW_KIND" "$RESTORE_ROW_NAME" \
          "$RESTORE_ROW_ACTION" "$RESTORE_ROW_REPLICAS" "$RESTORE_ROW_PARALLELISM" \
          "$RESTORE_ROW_SUSPEND" "$RESTORE_ROW_NODE_SELECTOR"
      fi
    done < <(gdce_replica_backup_stream_restore_rows "$backup_file")
    HEALTH_RESTORE_GROUP_RESTORED=$cr_entries
    return 0
  fi

  GDCE_RESTORE_QUIET_KUBECTL=1
  GDCE_KUBECTL_REQUEST_TIMEOUT="${GDCE_RESTORE_KUBECTL_TIMEOUT:-60s}"
  gdce_restore_ns_cache_warm
  if [[ -n "${GDCE_RESTORE_NS_OK}" ]]; then
    ns_warm=$(printf '%s' "${GDCE_RESTORE_NS_OK#,}" | tr ',' '\n' | grep -c '^.' 2>/dev/null || echo 0)
  fi
  log "[health] [$group_label] CR restore: ${ns_warm} namespace(s) cached, kubectl timeout ${GDCE_KUBECTL_REQUEST_TIMEOUT}"

  while gdce_restore_read_row; do
    if ! gdce_restore_is_data_plane_cr_action "$RESTORE_ROW_ACTION"; then
      skipped_scope=$((skipped_scope + 1))
      continue
    fi
    cr_entries=$((cr_entries + 1))
    if ! gdce_ns_is_data_plane_operator_ns "$RESTORE_ROW_NS"; then
      skipped_scope=$((skipped_scope + 1))
      continue
    fi
    if ! gdce_restore_ns_exists "$RESTORE_ROW_NS"; then
      health_restore_log_skip_missing_ns "$RESTORE_ROW_NS"
      skipped_ns=$((skipped_ns + 1))
      continue
    fi
    if gdce_restore_apply_workload "$RESTORE_ROW_NS" "$RESTORE_ROW_KIND" "$RESTORE_ROW_NAME" \
      "$RESTORE_ROW_ACTION" "$RESTORE_ROW_REPLICAS" "$RESTORE_ROW_PARALLELISM" \
      "$RESTORE_ROW_SUSPEND" "$RESTORE_ROW_NODE_SELECTOR"; then
      restored=$((restored + 1))
    else
      bad=1
    fi
  done < <(gdce_replica_backup_stream_restore_rows "$backup_file")

  GDCE_RESTORE_QUIET_KUBECTL="$saved_quiet"
  GDCE_KUBECTL_REQUEST_TIMEOUT="$saved_timeout"

  log "[health]   [$group_label] restored (operator CRs): $restored | CR entries: $cr_entries | skipped scope: $skipped_scope | skipped NS: $skipped_ns"
  if [[ $skipped_ns -gt 0 && -n "$HEALTH_RESTORE_MISSING_NS" ]]; then
    log "[health]   [$group_label] missing namespaces on cluster:${HEALTH_RESTORE_MISSING_NS}"
  fi
  HEALTH_RESTORE_GROUP_RESTORED=$restored
  HEALTH_RESTORE_GROUP_CR_ENTRIES=$cr_entries
  [[ $bad -ne 0 ]] && return 1
  return 0
}

health_restore_data_plane_operator_crs() {
  local idx=0 g f file_total=0 restored=0 cr_total=0 bad=0 entry_n=0 path_line

  if ! gdce_require_jq; then
    return 1
  fi

  HEALTH_RESTORE_MISSING_NS=""
  HEALTH_RESTORE_GROUP_CR_ENTRIES=0
  health_resolve_replica_backup_sources
  log "[health] Restore data-plane operator CRs from per-group files: $(health_replica_backup_sources_summary)"

  echo ""
  echo "========================================================================"
  echo "  Restore data-plane operator CRs (RabbitMQ / Elastic / Mongo)"
  echo "  Sources: $(health_replica_backup_sources_summary)"
  echo "  Pattern: $(gdce_replica_backup_file_pattern | tr -d '\r')"
  echo "  Scope: GDCE_DATA_PLANE_OPERATOR_NS (namespace_groups.sh)"
  for idx in "${!REPLICA_BACKUP_FILE_LIST[@]}"; do
    f="${REPLICA_BACKUP_FILE_LIST[$idx]}"
    path_line="  File: ${REPLICA_BACKUP_GROUP_LIST[$idx]} -> $(realpath "$f" 2>/dev/null || echo "$f")"
    if [[ -f "$f" ]]; then
      entry_n=$(health_replica_backup_entry_count "$f") || entry_n=0
      path_line="$path_line (${entry_n} entries)"
    else
      path_line="$path_line (missing)"
    fi
    echo "$path_line"
  done
  echo "========================================================================"

  if [[ ${#REPLICA_BACKUP_FILE_LIST[@]} -eq 0 ]]; then
    log "[health] ERROR: no per-group backup files found (run gdce_k8_cleanup_orchestrator.sh per --network-group)"
    echo ""
    echo "  >>> Result: FAIL — backup file(s) missing <<<"
    echo "========================================================================"
    echo ""
    return 1
  fi

  for idx in "${!REPLICA_BACKUP_FILE_LIST[@]}"; do
    g="${REPLICA_BACKUP_GROUP_LIST[$idx]}"
    f="${REPLICA_BACKUP_FILE_LIST[$idx]}"
    entry_n=$(health_replica_backup_entry_count "$f") || {
      log "[health] ERROR: cannot read entry count from $f (group $g)"
      bad=1
      continue
    }
    file_total=$((file_total + entry_n))
    health_restore_data_plane_cr_entries_from_backup_file "$f" "$g" || bad=1
    restored=$((restored + HEALTH_RESTORE_GROUP_RESTORED))
    cr_total=$((cr_total + HEALTH_RESTORE_GROUP_CR_ENTRIES))
  done

  echo ""
  echo "  --- CR restore summary ---"
  echo "  Backup files used:   ${#REPLICA_BACKUP_FILE_LIST[@]}"
  echo "  Entries in files:    $file_total"
  echo "  CR entries matched:  $cr_total"
  echo "  Restored (operator): $restored"
  if [[ -n "${HEALTH_RESTORE_MISSING_NS}" ]]; then
    echo "  Skipped (NS missing):${HEALTH_RESTORE_MISSING_NS#,}"
  fi
  echo ""
  if [[ $bad -ne 0 ]]; then
    echo "  >>> Result: FAIL — one or more CR restore actions reported errors <<<"
    echo "========================================================================"
    echo ""
    return 1
  fi
  if [[ $cr_total -eq 0 && ! gdce_is_dry_run ]]; then
    log "[health] WARN: no operator CR entries in backup files (re-run cleanup with --suspend-operator-crs)"
    echo "  >>> Result: WARN — no CR backup entries found (cleanup may predate CR backup) <<<"
    echo "========================================================================"
    echo ""
    return 0
  fi
  if [[ $restored -eq 0 && ! gdce_is_dry_run && $cr_total -gt 0 ]]; then
    echo "  >>> Result: FAIL — $cr_total CR entries but none restored <<<"
    echo "========================================================================"
    echo ""
    return 1
  fi
  log "[health] Restored $restored operator CR entries from $(health_replica_backup_sources_summary)"
  echo "  >>> Result: PASS — data-plane operator CRs restored <<<"
  echo "========================================================================"
  echo ""
  return 0
}

health_restore_ngpos_replica_backup() {
  local idx=0 g f file_total=0 restored=0 bad=0 entry_n=0 path_line

  if ! gdce_require_jq; then
    return 1
  fi

  HEALTH_RESTORE_MISSING_NS=""
  health_resolve_replica_backup_sources
  log "[health] Step 9: Restore ngpos replica backup from per-group files: $(health_replica_backup_sources_summary)"

  echo ""
  echo "========================================================================"
  echo "  Restore ngpos replica backup"
  echo "  Sources: $(health_replica_backup_sources_summary)"
  echo "  Pattern: $(gdce_replica_backup_file_pattern | tr -d '\r')"
  echo "  Scope: GDCE_NGPOS_RESTART_PODS_DELETE_SVC_NS (namespace_groups.sh)"
  for idx in "${!REPLICA_BACKUP_FILE_LIST[@]}"; do
    f="${REPLICA_BACKUP_FILE_LIST[$idx]}"
    path_line="  File: ${REPLICA_BACKUP_GROUP_LIST[$idx]} -> $(realpath "$f" 2>/dev/null || echo "$f")"
    if [[ -f "$f" ]]; then
      entry_n=$(health_replica_backup_entry_count "$f") || entry_n=0
      path_line="$path_line (${entry_n} entries)"
    else
      path_line="$path_line (missing)"
    fi
    echo "$path_line"
  done
  echo "========================================================================"

  if [[ ${#REPLICA_BACKUP_FILE_LIST[@]} -eq 0 ]]; then
    log "[health] ERROR: no per-group backup files found (run gdce_k8_cleanup_orchestrator.sh per --network-group)"
    health_resolve_replica_backup_legacy_file
    log "[health] Expected files like: $(gdce_replica_backup_file_for_group pci), $(gdce_replica_backup_file_for_group non-pci), $(gdce_replica_backup_file_for_group fuel)"
    log "[health] Legacy fallback path: $REPLICA_BACKUP_FILE"
    echo ""
    echo "  >>> Result: FAIL — backup file(s) missing <<<"
    echo "========================================================================"
    echo ""
    return 1
  fi

  for idx in "${!REPLICA_BACKUP_FILE_LIST[@]}"; do
    g="${REPLICA_BACKUP_GROUP_LIST[$idx]}"
    f="${REPLICA_BACKUP_FILE_LIST[$idx]}"
    entry_n=$(health_replica_backup_entry_count "$f") || {
      log "[health] ERROR: cannot read entry count from $f (group $g); is the file valid JSON? (needs jq or python3)"
      bad=1
      continue
    }
    file_total=$((file_total + entry_n))
    if gdce_is_dry_run; then
      health_restore_entries_from_backup_file "$f" "$g" || bad=1
      continue
    fi
    health_restore_entries_from_backup_file "$f" "$g" || {
      bad=1
      continue
    }
    restored=$((restored + HEALTH_RESTORE_GROUP_RESTORED))
  done

  echo ""
  echo "  --- Restore summary ---"
  echo "  Backup files used:   ${#REPLICA_BACKUP_FILE_LIST[@]}"
  echo "  Entries in files:    $file_total"
  echo "  Restored (ngpos):    $restored"
  if [[ -n "${HEALTH_RESTORE_MISSING_NS}" ]]; then
    echo "  Skipped (NS missing):${HEALTH_RESTORE_MISSING_NS#,}"
  fi
  echo ""
  if [[ $bad -ne 0 ]]; then
    echo "  >>> Result: FAIL — one or more restore actions reported errors <<<"
    echo "========================================================================"
    echo ""
    return 1
  fi
  if [[ $restored -eq 0 && ! gdce_is_dry_run ]]; then
    log "[health] WARN: no ngpos workload entries were restored"
    if [[ $file_total -gt 0 ]]; then
      echo "  >>> Result: FAIL — backup has $file_total entries but none matched ngpos scope or cluster namespaces <<<"
    else
      echo "  >>> Result: FAIL — backup empty or unreadable (install jq or use python3; legacy: $SCRIPT_DIR/replica-backup.json) <<<"
    fi
    echo "========================================================================"
    echo ""
    return 1
  fi
  log "[health] Restored $restored ngpos workload entries from $(health_replica_backup_sources_summary)"
  echo "  >>> Result: PASS — ngpos replica backup restored <<<"
  echo "========================================================================"
  echo ""
  return 0
}

# -----------------------------
# Verify ngpos pods and services (health step 10)
# -----------------------------
health_load_ngpos_namespaces() {
  local list part
  HEALTH_NGPOS_NS=()
  gdce_namespace_groups_load_cache || return 1
  eval "list=\"\${GDCE_NGPOS_RESTART_PODS_DELETE_SVC_NS:-}\""
  if [[ -z "$list" ]]; then
    echo "Error: GDCE_NGPOS_RESTART_PODS_DELETE_SVC_NS not set in namespace_groups.sh" >&2
    return 1
  fi
  IFS=',' read -ra PARTS <<< "$list"
  for part in ${PARTS[@]+"${PARTS[@]}"}; do
    part=$(trim "$part")
    [[ -z "$part" ]] && continue
    HEALTH_NGPOS_NS+=("$part")
  done
  return 0
}

health_ngpos_ns_join() {
  local ns out=""
  for ns in ${HEALTH_NGPOS_NS[@]+"${HEALTH_NGPOS_NS[@]}"}; do
    if [[ -z "$out" ]]; then
      out="$ns"
    else
      out+=", $ns"
    fi
  done
  echo "$out"
}

health_list_svcs_missing_ready_endpoints() {
  local ns="$1" svc typ sel addrs
  while IFS=$'\t' read -r svc typ sel; do
    [[ -z "$svc" ]] && continue
    [[ "$typ" == "ExternalName" ]] && continue
    if [[ -z "$sel" || "$sel" == "{}" ]]; then
      continue
    fi
    addrs=$(run_kubectl get endpoints "$svc" -n "$ns" \
      -o jsonpath='{.subsets[*].addresses[*].ip}' 2>/dev/null)
    if [[ -z "$addrs" ]]; then
      echo "service/$svc (selector present, no ready endpoints)"
    fi
  done < <(run_kubectl get svc -n "$ns" \
    -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.type}{"\t"}{.spec.selector}{"\n"}{end}' 2>/dev/null)
}

health_screen_ngpos_suite_header() {
  local cluster count
  health_load_ngpos_namespaces || return 1
  count=${#HEALTH_NGPOS_NS[@]}
  cluster=$(gdce_cluster_display_name 2>/dev/null || echo "${GDCE_CLUSTER:-<connected>}")
  echo ""
  echo "========================================================================"
  echo "  Check health: ngpos application namespaces"
  echo "  Cluster: $cluster"
  echo "  Namespaces ($count): from GDCE_NGPOS_RESTART_PODS_DELETE_SVC_NS"
  echo "  Verify: all pods running/ready; services with selectors have endpoints"
  echo "========================================================================"
}

health_screen_ngpos_suite_result() {
  local rc=$1 checked=$2 skipped=$3 failed_ns=$4
  echo ""
  echo "  --- Suite summary ---"
  echo "  Checked:  $checked"
  echo "  Skipped:  $skipped (namespace not on cluster)"
  echo "  Failed:   $failed_ns"
  echo ""
  if [[ $rc -eq 0 ]]; then
    echo "  >>> Suite result: PASS — all checked ngpos namespaces have healthy pods and services <<<"
  else
    echo "  >>> Suite result: FAIL — one or more ngpos namespaces need attention <<<"
  fi
  echo "========================================================================"
  echo ""
}

health_screen_ngpos_namespace_header() {
  local ns="$1" cluster
  cluster=$(gdce_cluster_display_name 2>/dev/null || echo "${GDCE_CLUSTER:-<connected>}")
  echo ""
  echo "------------------------------------------------------------------------"
  echo "  Check health: $ns (ngpos)"
  echo "  Cluster: $cluster"
  echo "------------------------------------------------------------------------"
}

health_screen_ngpos_namespace_tables() {
  local ns="$1" out
  if gdce_is_dry_run; then
    echo "  [dry-run] Skipping live Pod/Service table for $ns"
    return 0
  fi
  if ! health_ns_exists "$ns"; then
    echo "  Namespace '$ns' does not exist on this cluster."
    return 0
  fi
  echo ""
  echo "  --- Pods ($ns) ---"
  if out=$(run_kubectl get pods -n "$ns" -o wide 2>&1); then
    if [[ -z "$out" ]]; then
      echo "  (no pods)"
    else
      echo "$out" | sed 's/^/  /'
    fi
  else
    echo "  (failed to list pods)"
    echo "$out" | sed 's/^/  /'
  fi
  echo ""
  echo "  --- Services ($ns) ---"
  if out=$(run_kubectl get svc -n "$ns" -o wide 2>&1); then
    if [[ -z "$out" ]]; then
      echo "  (no services)"
    else
      echo "$out" | sed 's/^/  /'
    fi
  else
    echo "  (failed to list services)"
    echo "$out" | sed 's/^/  /'
  fi
  echo ""
  echo "  --- Endpoints ($ns) ---"
  if out=$(run_kubectl get endpoints -n "$ns" 2>&1); then
    if [[ -z "$out" ]]; then
      echo "  (no endpoints)"
    else
      echo "$out" | sed 's/^/  /'
    fi
  else
    echo "  (failed to list endpoints)"
    echo "$out" | sed 's/^/  /'
  fi
}

health_screen_ngpos_namespace_issues() {
  local ns="$1" line pod_n svc_n bad_svc_n=0
  if gdce_is_dry_run || ! health_ns_exists "$ns"; then
    return 0
  fi
  pod_n=$(run_kubectl get pods -n "$ns" --no-headers 2>/dev/null | wc -l | tr -d ' ')
  pod_n=${pod_n:-0}
  svc_n=$(run_kubectl get svc -n "$ns" --no-headers 2>/dev/null | wc -l | tr -d ' ')
  svc_n=${svc_n:-0}
  echo ""
  echo "  --- Status summary ---"
  printf "  %-24s %s\n" "Pods listed:" "$pod_n"
  printf "  %-24s %s\n" "Services listed:" "$svc_n"
  if [[ -n "$(health_list_bad_pods "$ns")" ]]; then
    echo ""
    echo "  --- Unhealthy pods ---"
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      echo "  $line"
    done < <(health_list_bad_pods "$ns")
  else
    echo "  Pods: no ERROR/CrashLoopBackOff/unhealthy pods detected"
  fi
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    bad_svc_n=$((bad_svc_n + 1))
    if [[ $bad_svc_n -eq 1 ]]; then
      echo ""
      echo "  --- Services without ready endpoints ---"
    fi
    echo "  $line"
  done < <(health_list_svcs_missing_ready_endpoints "$ns")
  if [[ $bad_svc_n -eq 0 && "$svc_n" -gt 0 ]]; then
    echo "  Services: all selector-backed services have ready endpoints"
  elif [[ "$svc_n" -eq 0 ]]; then
    echo "  Services: WARN — no services in namespace (may be expected after --restart-pods-delete-svc)"
  fi
}

health_screen_ngpos_namespace_result() {
  local ns="$1" rc=$2
  echo ""
  if [[ $rc -eq 0 ]]; then
    echo "  >>> Result: PASS — $ns pods and services look healthy <<<"
  else
    echo "  >>> Result: FAIL — $ns has unhealthy pods and/or services <<<"
  fi
  echo "------------------------------------------------------------------------"
  echo ""
}

health_eval_ngpos_namespace_pods_svc() {
  local ns="$1" line
  HEALTH_EVAL_BAD=0
  if ! health_ns_exists "$ns"; then
    return 0
  fi
  if [[ -n "$(health_list_bad_pods "$ns")" ]]; then
    HEALTH_EVAL_BAD=1
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      log "[health] [$ns] FAIL unhealthy pod: $line"
    done < <(health_list_bad_pods "$ns")
  fi
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    log "[health] [$ns] FAIL $line"
    HEALTH_EVAL_BAD=1
  done < <(health_list_svcs_missing_ready_endpoints "$ns")
  return "$HEALTH_EVAL_BAD"
}

health_check_one_ngpos_namespace() {
  local ns="$1" bad=0
  log "[health] Check pods and services in ngpos namespace $ns"
  health_screen_ngpos_namespace_header "$ns"
  if gdce_is_dry_run; then
    log "[health] [$ns] [dry-run] would verify pods Running/Ready and services have endpoints"
    health_screen_ngpos_namespace_tables "$ns"
    health_screen_ngpos_namespace_result "$ns" 0
    return 0
  fi
  if ! health_ns_exists "$ns"; then
    log "[health] [$ns] SKIP: namespace does not exist"
    health_screen_ngpos_namespace_tables "$ns"
    health_screen_ngpos_namespace_result "$ns" 0
    return 2
  fi
  health_screen_ngpos_namespace_tables "$ns"
  health_eval_ngpos_namespace_pods_svc "$ns"
  bad=$HEALTH_EVAL_BAD
  health_screen_ngpos_namespace_issues "$ns"
  health_screen_ngpos_namespace_result "$ns" "$bad"
  if [[ $bad -ne 0 ]]; then
    return 1
  fi
  log "[health] [$ns] pods and services healthy"
  return 0
}

health_check_all_ngpos_pods_and_services() {
  local ns failed=0 checked=0 skipped=0 failed_count=0 rc

  health_load_ngpos_namespaces || return 1
  log "[health] Step 10: Verify pods and services in ${#HEALTH_NGPOS_NS[@]} ngpos namespace(s)"
  health_screen_ngpos_suite_header

  if gdce_is_dry_run; then
    for ns in ${HEALTH_NGPOS_NS[@]+"${HEALTH_NGPOS_NS[@]}"}; do
      health_check_one_ngpos_namespace "$ns" || true
    done
    health_screen_ngpos_suite_result 0 "${#HEALTH_NGPOS_NS[@]}" 0 0
    return 0
  fi

  for ns in ${HEALTH_NGPOS_NS[@]+"${HEALTH_NGPOS_NS[@]}"}; do
    health_check_one_ngpos_namespace "$ns"
    rc=$?
    if [[ $rc -eq 2 ]]; then
      skipped=$((skipped + 1))
      continue
    fi
    checked=$((checked + 1))
    if [[ $rc -ne 0 ]]; then
      failed=1
      failed_count=$((failed_count + 1))
    fi
  done

  if [[ $checked -eq 0 && $skipped -gt 0 ]]; then
    log "[health] WARN: no ngpos namespaces exist on this cluster"
    health_screen_ngpos_suite_result 1 0 "$skipped" 0
    return 1
  fi

  health_screen_ngpos_suite_result "$failed" "$checked" "$skipped" "$failed_count"
  return "$failed"
}

# -----------------------------
# Final health report — cluster-wide + namespace_groups.sh (health step 11)
# -----------------------------
health_report_resolve_file() {
  local path
  gdce_namespace_groups_load_cache || true
  eval "path=\"\${GDCE_HEALTH_REPORT_FILE:-HealthReport.txt}\""
  case "$path" in
    /*|[A-Za-z]:/*|[A-Za-z]:\\*)
      HEALTH_REPORT_FILE="$path"
      ;;
    *)
      HEALTH_REPORT_FILE="$SCRIPT_DIR/$path"
      ;;
  esac
}

health_report_discover_cluster_namespaces() {
  local ns
  HEALTH_REPORT_CLUSTER_NS=()
  if gdce_is_dry_run; then
    return 0
  fi
  while IFS= read -r ns; do
    [[ -z "$ns" ]] && continue
    cluster_namespace_excluded "$ns" && continue
    cluster_namespace_in_exclude_list "$ns" && continue
    HEALTH_REPORT_CLUSTER_NS+=("$ns")
  done < <(run_kubectl get namespaces -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null)
}

health_report_ns_in_list() {
  local want="$1" list="$2" part
  want=$(trim "$want")
  IFS=',' read -ra PARTS <<< "$list"
  for part in ${PARTS[@]+"${PARTS[@]}"}; do
    part=$(trim "$part")
    [[ "$part" == "$want" ]] && return 0
  done
  return 1
}

health_report_ns_in_group_union() {
  local want="$1" x
  for x in ${HEALTH_REPORT_GROUP_UNION[@]+"${HEALTH_REPORT_GROUP_UNION[@]}"}; do
    [[ "$x" == "$want" ]] && return 0
  done
  return 1
}

health_report_register_group_union() {
  local ns="$1" x found=0
  for x in ${HEALTH_REPORT_GROUP_UNION[@]+"${HEALTH_REPORT_GROUP_UNION[@]}"}; do
    [[ "$x" == "$ns" ]] && found=1 && break
  done
  [[ $found -eq 0 ]] && HEALTH_REPORT_GROUP_UNION+=("$ns")
}

health_report_load_group_namespaces() {
  local g="$1" list part
  gdce_namespace_groups_load_cache || return 1
  list=$(gdce_ini_get "$g" namespaces)
  [[ -z "$list" ]] && return 0
  IFS=',' read -ra PARTS <<< "$list"
  for part in ${PARTS[@]+"${PARTS[@]}"}; do
    part=$(trim "$part")
    [[ -z "$part" ]] && continue
    health_report_register_group_union "$part"
    echo "$part"
  done
}

# One kubectl get pods -A; cache unhealthy lines as "namespace|pod line" for fast report (step 11).
health_report_cleanup_pod_cache() {
  if [[ -n "${HEALTH_REPORT_POD_CACHE_FILE:-}" && -f "$HEALTH_REPORT_POD_CACHE_FILE" ]]; then
    rm -f "$HEALTH_REPORT_POD_CACHE_FILE"
  fi
  HEALTH_REPORT_POD_CACHE_READY=0
  HEALTH_REPORT_POD_CACHE_FILE=""
}

health_report_ns_exists() {
  [[ -n "${HEALTH_REPORT_NS_OK[$1]+x}" ]]
}

health_report_warm_ns_exists_cache() {
  local ns
  HEALTH_REPORT_NS_OK=()
  while IFS= read -r ns; do
    [[ -z "$ns" ]] && continue
    HEALTH_REPORT_NS_OK["$ns"]=1
  done < <(run_kubectl get namespaces -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null)
}

health_report_warm_pod_cache() {
  local saved_timeout="${GDCE_KUBECTL_REQUEST_TIMEOUT:-}" n_unhealthy=0
  health_report_cleanup_pod_cache
  if gdce_is_dry_run; then
    return 0
  fi
  HEALTH_REPORT_POD_CACHE_FILE="${TMPDIR:-/tmp}/gdce_health_pods_${$}.cache"
  GDCE_KUBECTL_REQUEST_TIMEOUT="${GDCE_HEALTH_REPORT_KUBECTL_TIMEOUT:-90s}"
  log "[health] Final health report: warming pod cache (kubectl get pods -A, timeout ${GDCE_KUBECTL_REQUEST_TIMEOUT})..."
  run_kubectl get pods -A --no-headers 2>/dev/null | awk '
    {
      ns=$1; ready=$3; phase=$4;
      split(ready, r, "/");
      bad=0;
      if (phase ~ /^(Error|CrashLoopBackOff|ImagePullBackOff|ErrImagePull|Failed|OOMKilled|ContainerStatusUnknown|Unknown|CreateContainerConfigError|RunContainerError|InvalidImageName)$/) bad=1;
      else if (phase == "Pending" || phase == "Terminating") bad=1;
      else if (phase == "Running" && r[1] != r[2]) bad=1;
      if (bad) print ns "|" $0;
    }' >"$HEALTH_REPORT_POD_CACHE_FILE" || true
  GDCE_KUBECTL_REQUEST_TIMEOUT="$saved_timeout"
  n_unhealthy=$(wc -l <"$HEALTH_REPORT_POD_CACHE_FILE" 2>/dev/null | tr -d ' ')
  n_unhealthy=${n_unhealthy:-0}
  HEALTH_REPORT_POD_CACHE_READY=1
  log "[health] Pod cache ready: ${n_unhealthy} unhealthy pod line(s) (one cluster-wide get)"
}

health_report_count_unhealthy_in_ns() {
  local ns="$1"
  if gdce_is_dry_run; then
    echo 0
    return 0
  fi
  if ! health_report_ns_exists "$ns"; then
    echo 0
    return 0
  fi
  if [[ "${HEALTH_REPORT_POD_CACHE_READY:-0}" != "1" || -z "${HEALTH_REPORT_POD_CACHE_FILE:-}" ]]; then
    count_unhealthy_pods "$ns"
    return 0
  fi
  awk -F'|' -v q="$ns" 'BEGIN{c=0} $1==q {c++} END {print c+0}' "$HEALTH_REPORT_POD_CACHE_FILE"
}

health_report_print_unhealthy_pods_for_ns() {
  local ns="$1" indent="${2:-    }" line n=0
  if gdce_is_dry_run; then
    echo "${indent}[dry-run] would list unhealthy pods in $ns"
    return 0
  fi
  if ! health_report_ns_exists "$ns"; then
    echo "${indent}(namespace not found on cluster)"
    return 0
  fi
  if [[ "${HEALTH_REPORT_POD_CACHE_READY:-0}" != "1" || -z "${HEALTH_REPORT_POD_CACHE_FILE:-}" ]]; then
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      n=$((n + 1))
      echo "${indent}${line}"
    done < <(list_unhealthy_pods "$ns")
    if [[ $n -eq 0 ]]; then
      echo "${indent}(no unhealthy pods)"
    fi
    return 0
  fi
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    n=$((n + 1))
    echo "${indent}${line}"
  done < <(awk -F'|' -v q="$ns" '$1==q { sub(/^[^|]*\|/, ""); print }' "$HEALTH_REPORT_POD_CACHE_FILE")
  if [[ $n -eq 0 ]]; then
    echo "${indent}(no unhealthy pods)"
  fi
  return 0
}

health_report_build_group_union() {
  local g ns
  HEALTH_REPORT_GROUP_UNION=()
  gdce_namespace_groups_load_cache || true
  for g in ${GDCE_NS_GROUP_IDS[@]+"${GDCE_NS_GROUP_IDS[@]}"}; do
    while IFS= read -r ns; do
      [[ -z "$ns" ]] && continue
      health_report_register_group_union "$ns"
    done < <(health_report_load_group_namespaces "$g")
  done
}

health_report_sum_unhealthy_for_ns_list() {
  local ns bad_count total=0 ns_with=0
  if [[ $# -eq 0 ]]; then
    echo "0 0"
    return 0
  fi
  for ns in "$@"; do
    bad_count=$(health_report_count_unhealthy_in_ns "$ns")
    if [[ "$bad_count" -gt 0 ]]; then
      ns_with=$((ns_with + 1))
      total=$((total + bad_count))
    fi
  done
  echo "$ns_with $total"
}

health_run_final_health_report() {
  local report_file cluster g net list ns groups_only=0 fail_unhealthy=0 fail_ns_with=0
  local scope_label="cluster-wide + namespace_groups.sh"

  trace_enter "health_run_final_health_report"
  local cluster_ns_count=0 cluster_unhealthy=0 cluster_ns_with_issues=0
  local group_total=0 group_ns_with_issues=0 other_unhealthy=0 other_ns_with_issues=0
  local ns_count bad_count group_fail_unhealthy=0 group_fail_ns_with=0

  [[ "${FINAL_HEALTH_REPORT_GROUPS_ONLY:-}" == "true" ]] && groups_only=1

  health_report_resolve_file
  report_file="$HEALTH_REPORT_FILE"
  HEALTH_REPORT_CLUSTER_NS=()
  HEALTH_REPORT_GROUP_UNION=()

  if [[ $groups_only -eq 1 ]]; then
    scope_label="namespace_groups.sh only (--final-health-report-groups-only)"
    log_step "[health] Step 11: Final health report ($scope_label) -> $report_file"
  else
    log_step "[health] Step 11: Final health report (cluster-wide + namespace_groups.sh) -> $report_file"
  fi

  cluster=$(gdce_cluster_display_name 2>/dev/null || echo "${GDCE_CLUSTER:-<connected>}")

  if ! gdce_is_dry_run; then
    health_report_warm_ns_exists_cache
    health_report_warm_pod_cache
    health_report_build_group_union
    read -r group_fail_ns_with group_fail_unhealthy < <(
      health_report_sum_unhealthy_for_ns_list ${HEALTH_REPORT_GROUP_UNION[@]+"${HEALTH_REPORT_GROUP_UNION[@]}"}
    )
    if [[ $groups_only -eq 1 ]]; then
      cluster_ns_count=${#HEALTH_REPORT_GROUP_UNION[@]}
      cluster_unhealthy=$group_fail_unhealthy
      cluster_ns_with_issues=$group_fail_ns_with
    else
      health_report_discover_cluster_namespaces
      cluster_ns_count=${#HEALTH_REPORT_CLUSTER_NS[@]}
      read -r cluster_ns_with_issues cluster_unhealthy < <(
        health_report_sum_unhealthy_for_ns_list ${HEALTH_REPORT_CLUSTER_NS[@]+"${HEALTH_REPORT_CLUSTER_NS[@]}"}
      )
      for ns in ${HEALTH_REPORT_CLUSTER_NS[@]+"${HEALTH_REPORT_CLUSTER_NS[@]}"}; do
        health_report_ns_in_group_union "$ns" && continue
        bad_count=$(health_report_count_unhealthy_in_ns "$ns")
        if [[ "$bad_count" -gt 0 ]]; then
          other_ns_with_issues=$((other_ns_with_issues + 1))
          other_unhealthy=$((other_unhealthy + bad_count))
        fi
      done
    fi
  else
    health_report_build_group_union
  fi

  fail_unhealthy=$cluster_unhealthy
  fail_ns_with=$cluster_ns_with_issues
  if [[ $groups_only -eq 1 ]]; then
    fail_unhealthy=$group_fail_unhealthy
    fail_ns_with=$group_fail_ns_with
  fi

  {
    echo "========================================================================"
    echo "  GDCE Final Health Report — Unhealthy Pods"
    echo "  Generated: $(date +'%Y-%m-%d %H:%M:%S %Z')"
    echo "  Cluster:   $cluster"
    echo "  Scope:     $scope_label"
    echo "  Source:    namespace_groups.sh (GDCE_NS_GROUP_IDS, GDCE_NS_CLUSTER_WIDE_EXCLUDE)"
    echo "  Report:    $report_file"
    if gdce_is_dry_run; then
      echo "  Mode:      DRY-RUN (no live pod scan)"
    else
      echo "  Scan:      one kubectl get pods -A (cached; timeout ${GDCE_HEALTH_REPORT_KUBECTL_TIMEOUT:-90s})"
    fi
    echo "========================================================================"
    echo ""

    if [[ $groups_only -eq 0 ]]; then
      echo "========================================================================"
      echo "  CLUSTER-WIDE"
      echo "  All namespaces on cluster except GDCE_NS_CLUSTER_WIDE_EXCLUDE"
      echo "========================================================================"
      echo ""

      if gdce_is_dry_run; then
        echo "  [dry-run] Would scan cluster namespaces and list unhealthy pods per namespace."
        echo ""
      else
        echo "  Namespaces scanned: $cluster_ns_count"
        echo ""
        echo "  --- Unhealthy pods by namespace (cluster-wide) ---"
        echo ""
        for ns in ${HEALTH_REPORT_CLUSTER_NS[@]+"${HEALTH_REPORT_CLUSTER_NS[@]}"}; do
          bad_count=$(health_report_count_unhealthy_in_ns "$ns")
          if [[ "$bad_count" -gt 0 ]]; then
            echo "  Namespace: $ns  ($bad_count unhealthy pod(s))"
            health_report_print_unhealthy_pods_for_ns "$ns" "    "
            echo ""
          fi
        done
        if [[ $cluster_unhealthy -eq 0 ]]; then
          echo "  (no unhealthy pods in any scanned namespace)"
          echo ""
        fi
        echo "  Cluster-wide summary:"
        echo "    Namespaces scanned:              $cluster_ns_count"
        echo "    Namespaces with unhealthy pods:  $cluster_ns_with_issues"
        echo "    Total unhealthy pods:            $cluster_unhealthy"
        echo ""
      fi
    else
      echo "========================================================================"
      echo "  CLUSTER-WIDE (skipped — groups-only mode)"
      echo "========================================================================"
      echo ""
      echo "  Use default --final-health-report for full cluster scan."
      echo ""
    fi

    gdce_namespace_groups_load_cache || true
    for g in ${GDCE_NS_GROUP_IDS[@]+"${GDCE_NS_GROUP_IDS[@]}"}; do
      net=$(gdce_ini_get "$g" network)
      list=$(gdce_ini_get "$g" namespaces)
      echo "========================================================================"
      echo "  NAMESPACE GROUP: $g"
      echo "  Network: $net"
      echo "  Namespaces (namespace_groups.sh): $list"
      echo "========================================================================"
      echo ""
      if gdce_is_dry_run; then
        echo "  [dry-run] Would scan each namespace in group '$g' for unhealthy pods."
        echo ""
        continue
      fi
      ns_count=0
      group_total=0
      group_ns_with_issues=0
      while IFS= read -r ns; do
        [[ -z "$ns" ]] && continue
        ns_count=$((ns_count + 1))
        bad_count=$(health_report_count_unhealthy_in_ns "$ns")
        echo "  --- Namespace: $ns ---"
        if [[ "$bad_count" -gt 0 ]]; then
          group_ns_with_issues=$((group_ns_with_issues + 1))
          group_total=$((group_total + bad_count))
          echo "  Unhealthy pods: $bad_count"
          health_report_print_unhealthy_pods_for_ns "$ns" "    "
        elif health_report_ns_exists "$ns"; then
          echo "  Unhealthy pods: 0"
        else
          echo "  Status: namespace not found on cluster (skipped)"
        fi
        echo ""
      done < <(health_report_load_group_namespaces "$g")
      echo "  Group '$g' summary:"
      echo "    Namespaces in group:               $ns_count"
      echo "    Namespaces with unhealthy pods:  $group_ns_with_issues"
      echo "    Total unhealthy pods in group:   $group_total"
      echo ""
    done

    if [[ $groups_only -eq 0 ]] && ! gdce_is_dry_run; then
      echo "========================================================================"
      echo "  CLUSTER-WIDE: Other namespaces"
      echo "  (on cluster but not listed in pci, non-pci, fuel, or ngpos-apps)"
      echo "========================================================================"
      echo ""
      for ns in ${HEALTH_REPORT_CLUSTER_NS[@]+"${HEALTH_REPORT_CLUSTER_NS[@]}"}; do
        health_report_ns_in_group_union "$ns" && continue
        bad_count=$(health_report_count_unhealthy_in_ns "$ns")
        if [[ "$bad_count" -gt 0 ]]; then
          echo "  Namespace: $ns  ($bad_count unhealthy pod(s))"
          health_report_print_unhealthy_pods_for_ns "$ns" "    "
          echo ""
        fi
      done
      if [[ $other_unhealthy -eq 0 ]]; then
        echo "  (no unhealthy pods outside migration namespace groups)"
        echo ""
      fi
      echo "  Other namespaces summary:"
      echo "    Namespaces with unhealthy pods:  $other_ns_with_issues"
      echo "    Total unhealthy pods:            $other_unhealthy"
      echo ""
    fi

    echo "========================================================================"
    echo "  OVERALL RESULT"
    echo "========================================================================"
    if gdce_is_dry_run; then
      echo "  >>> PASS (dry-run) — report structure written; no live scan <<<"
    elif [[ $fail_unhealthy -eq 0 ]]; then
      if [[ $groups_only -eq 1 ]]; then
        echo "  >>> PASS — no unhealthy pods in namespace_groups.sh scope <<<"
      else
        echo "  >>> PASS — no unhealthy pods in cluster-wide scan <<<"
      fi
    else
      echo "  >>> FAIL — $fail_unhealthy unhealthy pod(s) across $fail_ns_with namespace(s) <<<"
    fi
    echo "========================================================================"
    echo ""
  } | tee "$report_file"

  health_report_cleanup_pod_cache

  log "[health] Final health report written: $report_file"
  if gdce_is_dry_run; then
    trace_exit "health_run_final_health_report" 0
    return 0
  fi
  if [[ $fail_unhealthy -gt 0 ]]; then
    log "[health] Final health report: FAIL ($fail_unhealthy unhealthy pod(s))"
    trace_exit "health_run_final_health_report" 1
    return 1
  fi
  log "[health] Final health report: PASS"
  trace_exit "health_run_final_health_report" 0
  return 0
}

health_step_catalog_line() {
  case "$1" in
    1) echo "Kong TLS precondition, then kroger-issuer (1 replica; status on screen; rollout restart if unhealthy)" ;;
    2) echo "Delete kong-default-tls secrets in Kong TLS namespaces; wait for Certificate Ready=True" ;;
    3) echo "Scale platform deployments (Kong namespaces=1 each; kroger-issuer=1; namespace-labeler=2)" ;;
    4) echo "Check health rabbitmq-system, elastic-system, mongodb (scale deploy; rollout restart if unhealthy)" ;;
    5) echo "Scale ngpos-elk (or ngps-elk) in ngpos-shared to 3 replicas" ;;
    6) echo "Delete ERROR/unhealthy/Completed pods in rabbitmq-system, elastic-system, mongodb" ;;
    7) echo "Verify no unhealthy/Completed pods (data plane) and no unhealthy pods (Kong namespaces)" ;;
    8) echo "Check health namespace-labeler (2 replicas; status on screen)" ;;
    9) echo "Restore replica backup for ngpos namespaces from per-group replica-backup-{group}.json files" ;;
    10) echo "Verify all pods and services are up in each ngpos namespace (on-screen per NS)" ;;
    11) echo "Final health report: unhealthy pods cluster-wide and by namespace_groups.sh; HealthReport.txt" ;;
    *) echo "Unknown step" ;;
  esac
}

health_step_run_description() {
  case "$1" in
    1) echo "Kong TLS precondition, then kroger-issuer: scale to 1 replica, print status, rollout restart if unhealthy" ;;
    2) echo "Delete kong-default-tls secrets in Kong TLS namespaces; wait for Certificate Ready=True" ;;
    3) echo "Scale platform deployments (Kong namespaces=1 each; kroger-issuer=1; namespace-labeler=2)" ;;
    4) echo "Check health rabbitmq-system, elastic-system, mongodb: scale deploy, rollout restart if unhealthy" ;;
    5) echo "Scale ngpos-elk in ngpos-shared to 3 replicas" ;;
    6) echo "Delete ERROR/unhealthy/Completed pods in rabbitmq-system, elastic-system, mongodb" ;;
    7) echo "Verify no unhealthy/Completed pods (data plane) and no unhealthy pods (Kong namespaces)" ;;
    8) echo "Check health namespace-labeler: scale to profile replicas, print status, PASS/FAIL" ;;
    9) echo "Restore ngpos workloads from per-group replica-backup-{group}.json (deploy/sts/ds/job/cronjob)" ;;
    10) echo "Verify pods Running/Ready and services have endpoints in all ngpos namespaces" ;;
    11) echo "Final health report: unhealthy pods (cluster-wide + per namespace group); write HealthReport.txt" ;;
    *) echo "Invalid health step" ;;
  esac
}

health_print_steps_catalog() {
  local n
  echo "Post-recovery health automation steps:"
  for n in 1 2 3 4 5 6 7 8 9 10 11; do
    echo "  $n. $(health_step_catalog_line "$n")"
  done
  echo ""
  echo "Run one or more steps:"
  echo "  $0 --cluster CLUSTER --health-step 4"
  echo "  $0 --cluster CLUSTER --health-step 2,6,7"
}

health_add_step() {
  local step="$1" existing
  for existing in ${HEALTH_STEPS[@]+"${HEALTH_STEPS[@]}"}; do
    [[ "$existing" == "$step" ]] && return 0
  done
  HEALTH_STEPS+=("$step")
}

health_parse_step_arg() {
  local arg="$1" part
  IFS=',' read -ra PARTS <<< "$arg"
  for part in ${PARTS[@]+"${PARTS[@]}"}; do
    part=$(trim "$part")
    if [[ ! "$part" =~ ^(11|10|[1-9])$ ]]; then
      echo "Error: invalid health step '$part' (use 1-11, e.g. --health-step 3 or --health-step 11)" >&2
      exit 1
    fi
    health_add_step "$part"
  done
}

health_steps_sorted_unique() {
  if [[ ${#HEALTH_STEPS[@]} -eq 0 ]]; then
    return 0
  fi
  printf '%s\n' ${HEALTH_STEPS[@]+"${HEALTH_STEPS[@]}"} | sort -n | uniq
}

health_steps_join() {
  local n first=1 out=""
  for n in $(health_steps_sorted_unique); do
    if [[ $first -eq 1 ]]; then
      out="$n"
      first=0
    else
      out+=",$n"
    fi
  done
  echo "$out"
}

health_steps_planned_list() {
  local n out=""
  if [[ ${#HEALTH_STEPS[@]} -eq 0 ]]; then
    echo "1 2 3 4 5 6 7 8 9 10 11"
    return 0
  fi
  for n in $(health_steps_sorted_unique); do
    out+="$n "
  done
  echo "$out"
}

health_step_includes() {
  local want=$1 n
  for n in ${HEALTH_STEPS[@]+"${HEALTH_STEPS[@]}"}; do
    [[ "$n" == "$want" ]] && return 0
  done
  return 1
}

health_execute_step_number() {
  trace_enter "health_execute_step_number $1"
  case "$1" in
    1) health_restart_kroger_issuer ;;
    2) health_fix_kong_tls_and_wait ;;
    3) health_stabilize_platform_deploys ;;
    4) health_fix_data_plane_namespaces ;;
    5) health_scale_ngpos_elk ;;
    6) health_fix_rabbitmq_system ;;
    7) health_assert_no_bad_pods ;;
    8) health_check_namespace_labeler ;;
    9) health_restore_ngpos_replica_backup ;;
    10) health_check_all_ngpos_pods_and_services ;;
    11) health_run_final_health_report ;;
    *)
      log "[health] ERROR: unknown step number $1"
      trace_exit "health_execute_step_number $1" 1
      return 1
      ;;
  esac
  local _hrc=$?
  trace_exit "health_execute_step_number $1" "$_hrc"
  return "$_hrc"
}

# 0=proceed, 1=skip step, 2=abort entire health suite
health_confirm_step() {
  local step="$1"
  local desc="$2"
  local answer

  if [[ "${GDCE_YES:-}" == "1" ]] || [[ "$HEALTH_INTERACTIVE" != "true" ]]; then
    return 0
  fi
  if gdce_is_dry_run; then
    log "[health] Step $step (dry-run): $desc — auto-confirmed"
    return 0
  fi

  echo ""
  echo "  Health step $step: $(health_step_catalog_line "$step")"
  echo "  Action: $desc"
  if [[ ${#HEALTH_STEPS[@]} -le 1 ]]; then
    read -r -p "  Proceed with this step? [y/N] " answer
  else
    read -r -p "  Proceed with this step? [y/N/a=abort remaining steps] " answer
  fi
  answer=$(echo "$answer" | tr '[:upper:]' '[:lower:]')
  case "$answer" in
    y|yes) return 0 ;;
    a|abort)
      log "[health] Step $step: user aborted remaining health steps"
      return 2
      ;;
    *)
      log "[health] Step $step SKIPPED by user"
      return 1
      ;;
  esac
}

# Run a health step after confirmation. Returns: 0 ok/skipped, 1 step failed, 2 suite aborted.
health_run_step() {
  local step="$1" desc="$2" confirm_rc=0
  shift 2

  log_step "health step $step: $desc"
  trace_enter "health_run_step $step"

  health_confirm_step "$step" "$desc"
  confirm_rc=$?
  if [[ $confirm_rc -eq 2 ]]; then
    return 2
  fi
  if [[ $confirm_rc -ne 0 ]]; then
    trace_exit "health_run_step $step" 0
    return 0
  fi

  if "$@"; then
    trace_exit "health_run_step $step" 0
    return 0
  fi
  trace_exit "health_run_step $step" 1
  return 1
}

health_confirm_suite_start() {
  local answer

  if [[ "${GDCE_YES:-}" == "1" ]] || [[ "$HEALTH_INTERACTIVE" != "true" ]]; then
    return 0
  fi
  if gdce_is_dry_run; then
    log "[health] Post-recovery suite (dry-run) — auto-confirmed"
    return 0
  fi

  echo ""
  echo "========== Post-recovery health automations =========="
  echo "  1. Check health kroger-issuer (runs Kong TLS precondition first; 1 replica; rollout restart if unhealthy)"
  echo "  2. Delete kong-default-tls secrets in Kong TLS namespaces; wait for Certificate Ready=True"
  echo "  3. Scale platform deployments (Kong namespaces=1 each; kroger-issuer=1; namespace-labeler=2)"
  echo "  4. Check health rabbitmq-system, elastic-system, mongodb (scale deploy; rollout restart if unhealthy)"
  echo "  5. Scale ngpos-elk (or ngps-elk) in ngpos-shared to 3 replicas"
  echo "  6. Delete ERROR/unhealthy/Completed pods in rabbitmq-system, elastic-system, mongodb"
  echo "  7. Verify no unhealthy/Completed pods (data plane) and no unhealthy pods (Kong)"
  echo "  8. Check health namespace-labeler (2 replicas; status on screen)"
  echo "  9. Restore replica backup for ngpos namespaces from per-group replica-backup-{group}.json"
  echo "  10. Verify pods and services up in each ngpos namespace (GDCE_NGPOS_RESTART_PODS_DELETE_SVC_NS)"
  echo "  11. Final health report: unhealthy pods cluster-wide + by namespace group; HealthReport.txt"
  echo "======================================================"
  read -r -p "Proceed with post-recovery health automations? [y/N] " answer
  answer=$(echo "$answer" | tr '[:upper:]' '[:lower:]')
  if [[ "$answer" == "y" || "$answer" == "yes" ]]; then
    return 0
  fi
  log "[health] Post-recovery health suite declined by user"
  return 1
}

health_confirm_selected_steps_start() {
  local answer n

  if [[ "${GDCE_YES:-}" == "1" ]] || [[ "$HEALTH_INTERACTIVE" != "true" ]]; then
    return 0
  fi
  if gdce_is_dry_run; then
    log "[health] Selected step(s) (dry-run) — auto-confirmed: $(health_steps_join)"
    return 0
  fi

  echo ""
  echo "========== Post-recovery health: selected step(s) =========="
  for n in $(health_steps_sorted_unique); do
    echo "  $n. $(health_step_catalog_line "$n")"
  done
  echo "==========================================================="
  read -r -p "Proceed with step(s) $(health_steps_join)? [y/N] " answer
  answer=$(echo "$answer" | tr '[:upper:]' '[:lower:]')
  if [[ "$answer" == "y" || "$answer" == "yes" ]]; then
    return 0
  fi
  log "[health] Selected step(s) declined by user"
  return 1
}

# step_rc from health_run_step: 0=ok/skipped, 1=step failed, 2=suite aborted
health_apply_step_result() {
  local step_rc=$1
  [[ $step_rc -eq 2 ]] && return 2
  [[ $step_rc -eq 1 ]] && return 1
  return 0
}

run_health_validations_suite() {
  local failed=0 step_rc=0 n desc

  log_step "run_health_validations_suite"
  trace_enter "run_health_validations_suite"

  if [[ "${RESTORE_NGPOS_REPLICAS_ONLY:-}" == "true" ]]; then
    log "=== Restore ngpos replica backup (health step 9) ==="
    desc=$(health_step_run_description 9)
    health_run_step 9 "$desc" health_restore_ngpos_replica_backup
    step_rc=$?
    health_apply_step_result "$step_rc"
    step_rc=$?
    if [[ $step_rc -eq 2 ]]; then
      return 0
    fi
    if [[ $step_rc -eq 1 ]]; then
      log "=== Restore ngpos replica backup: FAILED ==="
      return 1
    fi
    log "=== Restore ngpos replica backup: PASSED ==="
    return 0
  fi

  if [[ "${RESTORE_DATA_PLANE_CRS_ONLY:-}" == "true" ]]; then
    log "=== Restore data-plane operator CRs (rabbitmq / elastic / mongo) ==="
    if ! health_restore_data_plane_operator_crs; then
      log "=== Restore data-plane operator CRs: FAILED ==="
      return 1
    fi
    log "=== Restore data-plane operator CRs: PASSED ==="
    return 0
  fi

  if [[ "${NGPOS_NAMESPACES_HEALTH_ONLY:-}" == "true" ]]; then
    log "=== Check health: ngpos namespaces (pods and services; results on screen) ==="
    if [[ "${GDCE_YES:-}" == "1" ]] || [[ "$HEALTH_INTERACTIVE" != "true" ]]; then
      if ! health_check_all_ngpos_pods_and_services; then
        log "=== Check health ngpos namespaces: FAILED ==="
        return 1
      fi
    else
      health_load_ngpos_namespaces || return 1
      echo ""
      read -r -p "Proceed with ngpos pods/services health check (${#HEALTH_NGPOS_NS[@]} namespaces)? [y/N] " answer
      answer=$(echo "$answer" | tr '[:upper:]' '[:lower:]')
      if [[ "$answer" != "y" && "$answer" != "yes" ]]; then
        log "[health] Ngpos namespace health check declined by user"
        return 0
      fi
      if ! health_check_all_ngpos_pods_and_services; then
        log "=== Check health ngpos namespaces: FAILED ==="
        return 1
      fi
    fi
    log "=== Check health ngpos namespaces: PASSED ==="
    return 0
  fi

  if [[ "${FINAL_HEALTH_REPORT_ONLY:-}" == "true" ]]; then
    health_report_resolve_file
    log "=== Final health report (health step 11) -> $HEALTH_REPORT_FILE ==="
    desc=$(health_step_run_description 11)
    health_run_step 11 "$desc" health_run_final_health_report
    step_rc=$?
    health_apply_step_result "$step_rc"
    step_rc=$?
    if [[ $step_rc -eq 2 ]]; then
      return 0
    fi
    if [[ $step_rc -eq 1 ]]; then
      log "=== Final health report: FAILED (see $HEALTH_REPORT_FILE) ==="
      return 1
    fi
    log "=== Final health report: PASSED (see $HEALTH_REPORT_FILE) ==="
    return 0
  fi

  if [[ "${KONG_NAMESPACES_HEALTH_ONLY:-}" == "true" ]]; then
    log "=== Check health: Kong namespaces (results printed on screen) ==="
    if [[ "${GDCE_YES:-}" == "1" ]] || [[ "$HEALTH_INTERACTIVE" != "true" ]]; then
      if ! health_check_all_kong_namespaces; then
        log "=== Check health Kong namespaces: FAILED ==="
        return 1
      fi
    else
      echo ""
      read -r -p "Proceed with Kong namespace health check ($(health_kong_ns_join))? [y/N] " answer
      answer=$(echo "$answer" | tr '[:upper:]' '[:lower:]')
      if [[ "$answer" != "y" && "$answer" != "yes" ]]; then
        log "[health] Kong namespace health check declined by user"
        return 0
      fi
      if ! health_check_all_kong_namespaces; then
        log "=== Check health Kong namespaces: FAILED ==="
        return 1
      fi
    fi
    log "=== Check health Kong namespaces: PASSED ==="
    return 0
  fi

  if [[ "${KROGER_ISSUER_HEALTH_ONLY:-}" == "true" ]]; then
    log "=== Check health: kroger-issuer (results printed on screen) ==="
    desc=$(health_step_run_description 1)
    health_run_step 1 "$desc" health_check_kroger_issuer 1
    step_rc=$?
    health_apply_step_result "$step_rc"
    step_rc=$?
    if [[ $step_rc -eq 2 ]]; then
      return 0
    fi
    if [[ $step_rc -eq 1 ]]; then
      log "=== Check health kroger-issuer: FAILED ==="
      return 1
    fi
    log "=== Check health kroger-issuer: PASSED ==="
    return 0
  fi

  if [[ "${NAMESPACE_LABELER_HEALTH_ONLY:-}" == "true" ]]; then
    log "=== Check health: namespace-labeler (results printed on screen) ==="
    desc=$(health_step_run_description 8)
    health_run_step 8 "$desc" health_execute_step_number 8
    step_rc=$?
    health_apply_step_result "$step_rc"
    step_rc=$?
    if [[ $step_rc -eq 2 ]]; then
      return 0
    fi
    if [[ $step_rc -eq 1 ]]; then
      log "=== Check health namespace-labeler: FAILED ==="
      return 1
    fi
    log "=== Check health namespace-labeler: PASSED ==="
    return 0
  fi

  if [[ ${#HEALTH_STEPS[@]} -gt 0 ]]; then
    log "=== Post-recovery health: step(s) $(health_steps_join) ==="
  else
    log "=== Post-recovery health validations (hybrid migration) ==="
  fi

  if [[ ${#HEALTH_STEPS[@]} -eq 0 ]]; then
    if ! health_confirm_suite_start; then
      log "[health] Suite not started (user declined or skipped)"
      return 0
    fi
  else
    if ! health_confirm_selected_steps_start; then
      log "[health] Step(s) not started (user declined or skipped)"
      return 0
    fi
  fi

  for n in $(health_steps_planned_list); do
    desc=$(health_step_run_description "$n")
    health_run_step "$n" "$desc" health_execute_step_number "$n"
    step_rc=$?
    health_apply_step_result "$step_rc"
    step_rc=$?
    [[ $step_rc -eq 2 ]] && return 0
    [[ $step_rc -eq 1 ]] && failed=1
  done

  if [[ $failed -eq 0 ]]; then
    log "=== Post-recovery health validations: PASSED ==="
  else
    log "=== Post-recovery health validations: FAILED (see logs above) ==="
  fi
  trace_exit "run_health_validations_suite" "$failed"
  return "$failed"
}

# ================================
# Pre-run confirmation
# ================================
recovery_confirm_run() {
  local run_type="LIVE" cluster cmd_type details

  gdce_is_dry_run && run_type="DRY-RUN"
  cluster=$(gdce_cluster_display_name)

  if [[ "$MODE" == "cms-rollout" ]]; then
    cmd_type="CMS: ensure deployments in config-management-system (0->1, 1->rollout restart)"
  elif [[ "$MODE" == "cleanup-unhealthy" ]]; then
    cmd_type="namespace recovery: cleanup-unhealthy-pods (cluster-wide)"
    [[ "${CLUSTER_WIDE_CLEANUP}" != "true" ]] && cmd_type="namespace recovery: cleanup-unhealthy-pods"
  elif [[ "$MODE" == "verify-recovery" ]]; then
    cmd_type="namespace recovery: delete-and-verify-recovery"
  elif [[ "$MODE" == "restart-pods-delete-svc" ]]; then
    cmd_type="namespace recovery: restart pods + delete services (ngpos-apps; no deploy/sts/ds/job)"
  elif [[ "$MODE" == "health-only" ]]; then
    if [[ "${KONG_NAMESPACES_HEALTH_ONLY:-}" == "true" ]]; then
      cmd_type="namespace recovery: check health Kong namespaces"
    elif [[ "${KROGER_ISSUER_HEALTH_ONLY:-}" == "true" ]]; then
      cmd_type="namespace recovery: check health kroger-issuer"
    elif [[ "${NAMESPACE_LABELER_HEALTH_ONLY:-}" == "true" ]]; then
      cmd_type="namespace recovery: check health namespace-labeler"
    elif [[ "${NGPOS_NAMESPACES_HEALTH_ONLY:-}" == "true" ]]; then
      cmd_type="namespace recovery: check health ngpos namespaces (step 10)"
    elif [[ "${FINAL_HEALTH_REPORT_ONLY:-}" == "true" ]]; then
      cmd_type="namespace recovery: final health report (step 11)"
    elif [[ "${RESTORE_NGPOS_REPLICAS_ONLY:-}" == "true" ]]; then
      cmd_type="namespace recovery: restore ngpos replica backup (step 9)"
    elif [[ "${RESTORE_DATA_PLANE_CRS_ONLY:-}" == "true" ]]; then
      cmd_type="namespace recovery: restore data-plane operator CRs"
    elif [[ ${#HEALTH_STEPS[@]} -gt 0 ]]; then
      cmd_type="namespace recovery: health step(s) $(health_steps_join)"
    else
      cmd_type="namespace recovery: health-validations-only"
    fi
  else
    cmd_type="namespace recovery: delete-only"
  fi

  if [[ "$MODE" == "health-only" ]]; then
    if [[ "${KONG_NAMESPACES_HEALTH_ONLY:-}" == "true" ]]; then
      details="  Kong TLS (kong-default-tls secrets + Certificate Ready=True), then check $(health_kong_ns_join): scale 1 replica; rollout restart if unhealthy"
    elif [[ "${KROGER_ISSUER_HEALTH_ONLY:-}" == "true" ]]; then
      details="  Kong TLS precondition, then kroger-issuer: scale to 1 replica; print status; rollout restart if unhealthy"
    elif [[ "${NAMESPACE_LABELER_HEALTH_ONLY:-}" == "true" ]]; then
      details="  Check health namespace-labeler: scale deployments to profile replicas (default 2); print status on screen"
    elif [[ "${NGPOS_NAMESPACES_HEALTH_ONLY:-}" == "true" ]]; then
      health_load_ngpos_namespaces 2>/dev/null || true
      details="  Verify pods Running/Ready and services have endpoints in ${#HEALTH_NGPOS_NS[@]} ngpos namespace(s)"
      details+=$'\n'"  Scope: GDCE_NGPOS_RESTART_PODS_DELETE_SVC_NS; skips missing namespaces"
    elif [[ "${FINAL_HEALTH_REPORT_ONLY:-}" == "true" ]]; then
      health_report_resolve_file
      if [[ "${FINAL_HEALTH_REPORT_GROUPS_ONLY:-}" == "true" ]]; then
        details="  Scan unhealthy pods: namespace groups only (pci, non-pci, fuel, ngpos-apps); one kubectl get pods -A"
      else
        details="  Scan unhealthy pods: cluster-wide + namespace groups (pci, non-pci, fuel, ngpos-apps); one kubectl get pods -A"
      fi
      details+=$'\n'"  Output: on screen and $HEALTH_REPORT_FILE | timeout: ${GDCE_HEALTH_REPORT_KUBECTL_TIMEOUT:-90s}"
    elif [[ "${RESTORE_NGPOS_REPLICAS_ONLY:-}" == "true" ]]; then
      health_resolve_replica_backup_sources
      details="  Restore ngpos workloads from per-group files: $(health_replica_backup_sources_summary)"
      details+=$'\n'"  Scope: GDCE_NGPOS_RESTART_PODS_DELETE_SVC_NS; skips missing namespaces"
    elif [[ "${RESTORE_DATA_PLANE_CRS_ONLY:-}" == "true" ]]; then
      health_resolve_replica_backup_sources
      details="  Restore RabbitMQ/Elastic/Mongo CR specs from per-group files: $(health_replica_backup_sources_summary)"
      details+=$'\n'"  Scope: GDCE_DATA_PLANE_OPERATOR_NS; actions patch_rabbitmq_cr, patch_elastic_cr, patch_mongo_cr"
    elif [[ ${#HEALTH_STEPS[@]} -gt 0 ]]; then
      details="  Health step(s): $(health_steps_join) — confirm before each (use --yes to skip prompts)"
    else
      details="  Post-recovery checks: 11 steps with per-step confirmation (use --yes or --no-health-prompts to batch)"
    fi
  else
    if [[ "${CLUSTER_WIDE_CLEANUP}" == "true" ]]; then
      if [[ ${#NAMESPACES[@]} -gt 0 ]]; then
        details="  Scope: cluster-wide (${#NAMESPACES[@]} namespaces)"
      else
        details="  Scope: cluster-wide (namespace list loaded after connect)"
      fi
      details+=$'\n'"  Action: delete ERROR/CrashLoopBackOff/unhealthy pods once per namespace (no re-delete loop)"
    else
      details="  Namespaces: ${NAMESPACES[*]}"
    fi
    if [[ ${#NAMESPACE_GROUP_REQUESTS[@]} -gt 0 ]]; then
      details+=$'\n'"  Groups: ${NAMESPACE_GROUP_REQUESTS[*]}"
    fi
    if [[ "${RECOVERY_REPLICAS_CLI_OVERRIDE:-}" == "1" ]]; then
      details+=$'\n'"  Replicas: $TARGET_REPLICAS (CLI --replicas overrides all profiles)"
    else
      details+=$'\n'"  Replicas: per-namespace profiles in namespace_groups.sh (fallback $TARGET_REPLICAS)"
    fi
    if [[ "${RUN_CMS_ENSURE:-}" == "true" ]]; then
      details+=$'\n'"  CMS ($CMS_NAMESPACE): ensure after run (0->$CMS_TARGET_REPLICAS, $CMS_TARGET_REPLICAS->rollout restart)"
    else
      details+=$'\n'"  CMS: skipped (--no-cms-touch or health-only)"
    fi
    [[ "${RUN_CMS_ROLLOUT_RESTART:-}" == "true" ]] && details+=$'\n'"  CMS: extra ensure at end (--cms-rollout-restart)"
    details+=$'\n'"  Serial: $SERIAL"
    if [[ "$MODE" == "verify-recovery" && "$RUN_HEALTH_VALIDATIONS" == "true" ]]; then
      details+=$'\n'"  Post-recovery health validations: enabled (suite + per-step confirm unless --yes)"
    fi
    if [[ "$MODE" == "restart-pods-delete-svc" ]]; then
      details+=$'\n'"  Action: restart pods + delete services only (no deploy/sts/ds/job/cronjob)"
      details+=$'\n'"  Missing namespaces: skipped and reported (not fatal)"
    fi
  fi

  gdce_confirm_orchestrator_run \
    "gdce_k8_recovery_orchestrator.sh" \
    "$cluster" \
    "$run_type" \
    "$cmd_type" \
    "$details"
}

# ================================
# Main
# ================================
main() {
  local exit_code=0

  trap cleanup_baseline_dir EXIT

  log_step "gdce_k8_recovery_orchestrator start"
  parse_args "$@"
  gdce_sync_orchestrator_env
  if [[ ${#NAMESPACE_GROUP_REQUESTS[@]} -gt 0 ]]; then
    apply_namespace_groups_from_ini
  fi
  resolve_defaults

  log_step "connect and confirm"
  gdce_connect_init || exit 1
  load_cms_config_from_namespace_groups
  recovery_confirm_run || exit 1

  gdce_connect_if_needed || exit 1

  # CMS-only: rollout restart all deployments in config-management-system (no namespace drain).
  if [[ "$MODE" == "cms-rollout" ]]; then
    log_step "mode: cms-rollout-restart-only"
    log "Mode: cms-rollout-restart | Namespace: $CMS_NAMESPACE | Target replicas: $CMS_TARGET_REPLICAS | Dry-run: $DRY_RUN"
    cms_rollout_restart_all_deployments || exit 1
    exit 0
  fi

  if [[ "${CLUSTER_WIDE_CLEANUP}" == "true" ]]; then
    log_step "load cluster namespaces for cleanup"
    load_cluster_namespaces_for_cleanup || exit 1
    log_progress "Counting unhealthy pods before cleanup (one kubectl get pods per namespace)..."
    log "Cluster-wide unhealthy pod scan: ${#NAMESPACES[@]} namespace(s), $(count_unhealthy_pods_cluster_wide) unhealthy pod(s) found initially"
  fi

  if [[ "$MODE" == "cleanup-unhealthy" ]]; then
    log "Cluster connect complete — cluster-wide unhealthy pod cleanup"
  elif [[ "$MODE" != "health-only" ]]; then
    log "Cluster connect complete — starting namespace recovery"
  fi

  if [[ "$MODE" == "health-only" ]]; then
    if [[ "${KONG_NAMESPACES_HEALTH_ONLY:-}" == "true" ]]; then
      log "Mode: check-health-kong-namespaces | Dry-run: $DRY_RUN | Cluster: ${GDCE_CLUSTER:-<skip-connect>}"
    elif [[ "${KROGER_ISSUER_HEALTH_ONLY:-}" == "true" ]]; then
      log "Mode: check-health-kroger-issuer | Dry-run: $DRY_RUN | Cluster: ${GDCE_CLUSTER:-<skip-connect>}"
    elif [[ "${NAMESPACE_LABELER_HEALTH_ONLY:-}" == "true" ]]; then
      log "Mode: check-health-namespace-labeler | Dry-run: $DRY_RUN | Cluster: ${GDCE_CLUSTER:-<skip-connect>}"
    elif [[ "${NGPOS_NAMESPACES_HEALTH_ONLY:-}" == "true" ]]; then
      log "Mode: check-health-ngpos-namespaces | Dry-run: $DRY_RUN | Cluster: ${GDCE_CLUSTER:-<skip-connect>}"
    elif [[ "${FINAL_HEALTH_REPORT_ONLY:-}" == "true" ]]; then
      health_report_resolve_file
      if [[ "${FINAL_HEALTH_REPORT_GROUPS_ONLY:-}" == "true" ]]; then
        log "Mode: final-health-report-groups-only | Output: $HEALTH_REPORT_FILE | Dry-run: $DRY_RUN | Cluster: ${GDCE_CLUSTER:-<skip-connect>}"
      else
        log "Mode: final-health-report | Output: $HEALTH_REPORT_FILE | Dry-run: $DRY_RUN | Cluster: ${GDCE_CLUSTER:-<skip-connect>}"
      fi
    elif [[ "${RESTORE_NGPOS_REPLICAS_ONLY:-}" == "true" ]]; then
      health_resolve_replica_backup_sources
      log "Mode: restore-ngpos-replicas | Sources: $(health_replica_backup_sources_summary) | Dry-run: $DRY_RUN | Cluster: ${GDCE_CLUSTER:-<skip-connect>}"
    elif [[ "${RESTORE_DATA_PLANE_CRS_ONLY:-}" == "true" ]]; then
      health_resolve_replica_backup_sources
      log "Mode: restore-data-plane-crs | Sources: $(health_replica_backup_sources_summary) | Dry-run: $DRY_RUN | Cluster: ${GDCE_CLUSTER:-<skip-connect>}"
    elif [[ ${#HEALTH_STEPS[@]} -gt 0 ]]; then
      log "Mode: health step(s) $(health_steps_join) | Dry-run: $DRY_RUN | Cluster: ${GDCE_CLUSTER:-<skip-connect>}"
    else
      log "Mode: health-validations-only | Dry-run: $DRY_RUN | Cluster: ${GDCE_CLUSTER:-<skip-connect>}"
    fi
    if gdce_is_dry_run; then
      log "[health] Dry-run: logs kubectl actions only; no status polling or waits"
    fi
    if ! run_health_validations_suite; then
      exit_code=1
    fi
    exit "$exit_code"
  fi

  validate_or_filter_namespaces

  if [[ "${RECOVERY_REPLICAS_CLI_OVERRIDE:-}" == "1" ]]; then
    log "Mode: $MODE | Dry-run: $DRY_RUN | Cluster: ${GDCE_CLUSTER:-<skip-connect>} | Replicas: $TARGET_REPLICAS (CLI override) | CMS ensure: $RUN_CMS_ENSURE | Namespaces: ${NAMESPACES[*]}"
  else
    log "Mode: $MODE | Dry-run: $DRY_RUN | Cluster: ${GDCE_CLUSTER:-<skip-connect>} | Replicas: namespace_groups.sh profiles (fallback $TARGET_REPLICAS) | CMS ensure: $RUN_CMS_ENSURE | Namespaces: ${NAMESPACES[*]}"
  fi
  log "Health validations: $RUN_HEALTH_VALIDATIONS"
  if [[ "${CLUSTER_WIDE_CLEANUP}" == "true" && "$MODE" == "cleanup-unhealthy" ]]; then
    log_progress "Cluster-wide cleanup: skipping per-namespace profile log (${#NAMESPACES[@]} namespaces; serial=$SERIAL)"
  else
    for ns in ${NAMESPACES[@]+"${NAMESPACES[@]}"}; do
      ns_log_profile "$ns"
    done
  fi

  if [[ "$MODE" == "restart-pods-delete-svc" ]]; then
    log "Mode: restart-pods-delete-svc | Dry-run: $DRY_RUN | Serial: $SERIAL | Namespaces: ${#NAMESPACES[@]}"
  elif [[ "$MODE" == "cleanup-unhealthy" ]]; then
    log_step "mode: cleanup-unhealthy-pods"
    log "Mode: cleanup-unhealthy-pods | Cluster-wide: $CLUSTER_WIDE_CLEANUP | Dry-run: $DRY_RUN | Serial: $SERIAL"
    if ! run_phase cleanup_unhealthy_namespace_only; then
      exit_code=1
    fi
    cms_finalize_after_run
    cms_rollout_restart_if_requested
    local remaining
    remaining=$(count_unhealthy_pods_cluster_wide)
    if [[ $exit_code -eq 0 ]]; then
      log "Cluster-wide unhealthy pod cleanup completed (${#NAMESPACES[@]} namespaces checked, $remaining unhealthy remaining)"
    else
      log "Cluster-wide unhealthy pod cleanup failed — $remaining unhealthy pod(s) still present"
    fi
    exit "$exit_code"
  fi

  log_step "mode: drain / verify-recovery (MODE=$MODE)"
  init_baseline_dir

  if ! run_phase drain_namespace_only; then
    exit_code=1
  fi

  if [[ "$MODE" == "verify-recovery" ]]; then
    cms_finalize_after_run
    if ! run_phase verify_namespace_recovery; then
      exit_code=1
    fi
  else
    cms_finalize_after_run
  fi

  cms_rollout_restart_if_requested

  if [[ "$RUN_HEALTH_VALIDATIONS" == "true" && "$MODE" == "verify-recovery" ]]; then
    if ! run_health_validations_suite; then
      exit_code=1
    fi
  fi

  if [[ $exit_code -eq 0 ]]; then
    log "All namespace operations completed successfully"
  else
    log "One or more operations failed — review logs above"
  fi

  log_step "gdce_k8_recovery_orchestrator finished exit_code=$exit_code"
  exit "$exit_code"
}

main "$@"
