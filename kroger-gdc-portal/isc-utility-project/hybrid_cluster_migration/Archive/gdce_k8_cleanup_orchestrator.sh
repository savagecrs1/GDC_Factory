#!/bin/bash
# GDCE network/namespace cleanup orchestrator.
# Compatible with Bash 3.2+ (macOS default Terminal). Associative arrays not required.
#
# USAGE EXAMPLES:
#
#   Drains namespaces tied to a Network CR (deploy/sts/ds/job/cronjob), backs up replica
#   counts to per-group replica-backup-{group}.json files, pauses CMS reconcilers, and deletes the Network when
#   all mapped namespaces are empty. Background watchers exit cleanly via global monitor
#   (replica_test_script pattern). Edit namespace_groups.sh to change pci/non-pci/fuel lists.
#
#   Discover groups and clusters:
#   ./gdce_k8_cleanup_orchestrator.sh --list-namespace-groups
#   ./gdce_k8_cleanup_orchestrator.sh --list-clusters
#   ./gdce_k8_cleanup_orchestrator.sh --help
#
#   Preview (recommended first) — logs kubectl/gcloud only; no changes:
#   ./gdce_k8_cleanup_orchestrator.sh --cluster ci001 --dry-run --network-group pci
#   ./gdce_k8_cleanup_orchestrator.sh --skip-connect --dry-run --network-group non-pci
#
#   Live cleanup by group (from namespace_groups.sh):
#   ./gdce_k8_cleanup_orchestrator.sh --cluster ci001 --network-group pci
#   ./gdce_k8_cleanup_orchestrator.sh --cluster ci001 --network-group non-pci
#   ./gdce_k8_cleanup_orchestrator.sh --cluster ci001 --network-group fuel
#   ./gdce_k8_cleanup_orchestrator.sh --cluster ci001 --network-group pci,fuel
#
#   Skip confirmation prompt (CI / trusted runs):
#   ./gdce_k8_cleanup_orchestrator.sh --cluster ci001 --yes --network-group pci
#
#   Keep Network CR after namespaces are empty:
#   ./gdce_k8_cleanup_orchestrator.sh --cluster ci001 --network-group pci --delete-network false
#
#   Explicit network mapping (instead of --network-group):
#   ./gdce_k8_cleanup_orchestrator.sh --cluster ci001 --dry-run \
#     --network pci-network-3430=ngpos-lab,ngpos-payments-pci,ngpos-shared-pci
#
#   Custom groups file:
#   GDCE_NAMESPACE_GROUPS=/path/to/namespace_groups.sh \
#     ./gdce_k8_cleanup_orchestrator.sh --cluster ci001 --network-group pci
#
#   Backup all workload state (deploy/sts/ds/job/cronjob) for ngpos namespaces only:
#   ./gdce_k8_cleanup_orchestrator.sh --cluster ci001 --backup-ngpos-replicas
#   ./gdce_k8_cleanup_orchestrator.sh --cluster ci001 --dry-run --backup-ngpos-replicas --yes
#
#   Restore workload state from replica-backup.json after a prior cleanup/backup:
#   ./gdce_k8_cleanup_orchestrator.sh --cluster ci001 --restore-replicas
#   ./gdce_k8_cleanup_orchestrator.sh --skip-connect --dry-run --restore-replicas
#
#   Credentials (gdce_connect.sh): password prompt is masked; logs never show passwords.
#   Non-interactive: K8S_USERNAME=myeuid K8S_PASSWORD='***' ./gdce_k8_cleanup_orchestrator.sh ...

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=gdce_connect.sh
source "$SCRIPT_DIR/gdce_connect.sh"

GDCE_CLUSTER=""
GDCE_SKIP_CONNECT=false
DRY_RUN=false
RESTORE_REPLICAS=false
BACKUP_NGPOS_ONLY=false

WATCH_INTERVAL=5
RETRY_INTERVAL=10
NETWORK_MONITOR_INTERVAL=3
DELETE_NETWORK=true
REPLICA_BACKUP_GROUPS_WRITTEN=()

# Parallel arrays: NETWORK_NETS[i] -> namespace list in NETWORK_NS_LIST[i]
NETWORK_NETS=()
NETWORK_NS_LIST=()
PROCESSED_NS_LIST=()
NS_POD_DELETE_DONE_LIST=()
BG_PIDS=()
BACKUP_NS_LIST=()
REPLICA_PARTS_DIR=""

# CMS holdoff: keep GDCE_CMS_NAMESPACE deployments at 0 for entire live cleanup run.
CLEANUP_CMS_HOLDOFF_ACTIVE=false
CLEANUP_CMS_PAUSE_WAIT_TIMEOUT="${CLEANUP_CMS_PAUSE_WAIT_TIMEOUT:-300}"
RUN_CMS_PAUSE=true
RUN_CMS_RESTORE_AFTER=true
RUN_SUSPEND_OPERATOR_CRS=true
CLEANUP_DATA_PLANE_OPERATOR_NS=()

trim() {
  echo "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

log() {
  gdce_connect_log "$@"
}

log_step() {
  log ">>> $*"
  gdce_trace_step "$*"
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

add_network_mapping() {
  local net="$1" ns="$2" i=0 len slug part net_group
  ns="${ns//,/ }"
  slug=$(gdce_normalize_group_name "$net")
  net_group="net-${slug}"
  for part in $ns; do
    [[ -z "$part" ]] && continue
    gdce_ns_register_group "$part" "$net_group"
  done
  len=${#NETWORK_NETS[@]}
  while [[ $i -lt $len ]]; do
    if [[ "${NETWORK_NETS[$i]}" == "$net" ]]; then
      NETWORK_NS_LIST[$i]="$ns"
      return 0
    fi
    i=$((i + 1))
  done
  NETWORK_NETS+=("$net")
  NETWORK_NS_LIST+=("$ns")
}

is_namespace_processed() {
  local ns="$1" p
  for p in ${PROCESSED_NS_LIST[@]+"${PROCESSED_NS_LIST[@]}"}; do
    [[ "$p" == "$ns" ]] && return 0
  done
  return 1
}

mark_namespace_processed() {
  PROCESSED_NS_LIST+=("$1")
}

is_ns_pod_delete_done() {
  local ns="$1" p
  for p in ${NS_POD_DELETE_DONE_LIST[@]+"${NS_POD_DELETE_DONE_LIST[@]}"}; do
    [[ "$p" == "$ns" ]] && return 0
  done
  return 1
}

mark_ns_pod_delete_done() {
  local ns="$1"
  is_ns_pod_delete_done "$ns" && return 0
  NS_POD_DELETE_DONE_LIST+=("$ns")
}

cleanup_register_bg_pid() {
  BG_PIDS+=($!)
}

cleanup_stop_background_jobs() {
  local pid
  for pid in ${BG_PIDS[@]+"${BG_PIDS[@]}"}; do
    kill "$pid" 2>/dev/null || true
  done
  BG_PIDS=()
}

# True when every network is gone (or all mapped namespaces are empty if --delete-network false).
all_networks_cleanup_done() {
  local i=0 len=${#NETWORK_NETS[@]} net ns_list ns pods pod_count

  len=${#NETWORK_NETS[@]}
  while [[ $i -lt $len ]]; do
    net="${NETWORK_NETS[$i]}"
    ns_list="${NETWORK_NS_LIST[$i]}"

    if [[ "$DELETE_NETWORK" == "true" ]]; then
      if run_kubectl get network "$net" &>/dev/null; then
        return 1
      fi
    else
      for ns in $ns_list; do
        pods=$(run_kubectl get pods -n "$ns" --no-headers 2>/dev/null || true)
        pod_count=$(echo "$pods" | awk 'NF {c++} END {print c+0}')
        if (( pod_count > 0 )); then
          return 1
        fi
      done
    fi
    i=$((i + 1))
  done
  return 0
}

monitor_networks_and_exit() {
  if gdce_is_dry_run; then
    gdce_connect_log "[dry-run] would monitor until all networks removed / namespaces empty, then stop background jobs"
    cleanup_finish_and_exit 0
    return 0
  fi

  echo "[Monitor] Waiting for all network cleanup targets to complete..."
  while true; do
    if all_networks_cleanup_done; then
      cleanup_finish_and_exit 0
    fi
    gdce_dry_run_sleep "$NETWORK_MONITOR_INTERVAL"
  done
}

cleanup_stop_cms_holdoff_and_restore() {
  CLEANUP_CMS_HOLDOFF_ACTIVE=false
  cleanup_stop_background_jobs
  if [[ "$RUN_CMS_RESTORE_AFTER" == "true" && "$RUN_CMS_PAUSE" == "true" ]]; then
    log_step "restore CMS deployments after cleanup"
    gdce_cms_restore_deployments
  elif [[ "$RUN_CMS_PAUSE" == "true" ]]; then
    log "[CMS] Holdoff ended (--no-cms-restore: deployments left at 0)"
  fi
}

cleanup_on_signal() {
  log "Interrupted — stopping CMS holdoff and background jobs..."
  cleanup_stop_cms_holdoff_and_restore
  exit 130
}

cleanup_finish_and_exit() {
  local code=${1:-0} g f n
  echo "All targets complete. Stopping background watchers..."
  cleanup_stop_cms_holdoff_and_restore
  echo "Cleanup completed"
  echo "Per-group backup files:"
  if [[ ${#REPLICA_BACKUP_GROUPS_WRITTEN[@]} -gt 0 ]]; then
    for g in ${REPLICA_BACKUP_GROUPS_WRITTEN[@]+"${REPLICA_BACKUP_GROUPS_WRITTEN[@]}"}; do
      f=$(gdce_replica_backup_file_for_group "$g")
      n=$(gdce_jq 'length' "$f" 2>/dev/null || echo "?")
      echo "   $g -> $(realpath "$f" 2>/dev/null || echo "$f") ($n entries)"
    done
  else
    while IFS= read -r g; do
      [[ -z "$g" ]] && continue
      f=$(gdce_replica_backup_file_for_group "$g")
      [[ -f "$f" ]] || continue
      n=$(gdce_jq 'length' "$f" 2>/dev/null || echo "?")
      echo "   $g -> $(realpath "$f" 2>/dev/null || echo "$f") ($n entries)"
    done < <(gdce_replica_backup_network_groups_list)
  fi
  exit "$code"
}

apply_namespace_groups_from_ini() {
  local g net ns part
  gdce_validate_namespace_groups_registered || exit 1
  for g in ${NAMESPACE_GROUP_REQUESTS[@]+"${NAMESPACE_GROUP_REQUESTS[@]}"}; do
    net=$(gdce_ini_get "$g" network)
    ns=$(gdce_ini_get "$g" namespaces)
    if [[ -z "$net" || -z "$ns" ]]; then
      echo "Error: group [$g] must define network and namespaces in namespace_groups.sh" >&2
      exit 1
    fi
    echo "[group] $g network=$net"
    IFS=',' read -ra PARTS <<< "$ns"
    for part in ${PARTS[@]+"${PARTS[@]}"}; do
      part=$(trim "$part")
      [[ -z "$part" ]] && continue
      gdce_ns_register_group "$part" "$g"
    done
    add_network_mapping "$net" "$ns"
  done
}

# -----------------------------
# Help
# -----------------------------
show_help() {
  cat << EOF
GDCE K8 Cleanup Orchestrator

DESCRIPTION:
  Scales down CMS reconcilers, drains namespaces mapped to a Network CR,
  deletes the Network when empty, and saves workload state (deploy/sts/ds/job/cronjob)
  to replica-backup-{group}.json (pci, non-pci, fuel, or net-* for --network).
  Per namespace: one-pass scale + pod delete, then monitor until empty (scale-only;
  pods are not re-deleted every poll). Background network loops + global monitor +
  clean CMS watcher shutdown.

CLUSTER (gdce_connect.sh):
  --cluster NAME       Connect kubectl/gcloud to GDCE fleet cluster (required unless --skip-connect)
  --skip-connect       Use current kubeconfig; verify with kubectl get nodes
  --list-clusters      Print clusters from source_of_truth.csv and exit

WORKLOAD (namespace_groups.sh beside this script, or GDCE_NAMESPACE_GROUPS):
  --network-group NAME    Load network+namespaces from group (pci, non-pci, fuel; comma-separated)
  --list-namespace-groups Print groups and exit
  --network net=ns1,ns2   Explicit network mapping (alternative to --network-group)
  --delete-network BOOL   Delete Network CR when clean (default: true)
  --backup-ngpos-replicas Backup deploy/sts/ds/job/cronjob state for all ngpos namespaces
                         (GDCE_NGPOS_RESTART_PODS_DELETE_SVC_NS); skips missing NS; writes
                         per-group replica-backup-{group}.json files; no drain or CMS pause.
  --restore-replicas      Restore workload state from per-group backup files and exit
                          (--network-group limits which files; default: pci, non-pci, fuel)
  --dry-run               Log every kubectl/gcloud/sleep/file/jq command; no changes applied
  --verbose, -v           Enable verbose tracing (GDCE_VERBOSE=1)
  --quiet, -q               Disable verbose tracing (default)
  --yes                   Skip pre-run confirmation (or set GDCE_YES=1)
  --no-cms-pause          Do not pause CMS deployments during cleanup (not recommended)
  --no-cms-restore        Do not restore CMS deployments when cleanup completes
  --no-suspend-operator-crs
      Skip suspending RabbitMQ/Elastic/Mongo operator CRs in rabbitmq-system,
      elastic-system, mongodb before namespace scale-down (not recommended).

CMS (namespace_groups.sh — GDCE_CMS_NAMESPACE, GDCE_CMS_TARGET_REPLICAS):
  Live cleanup pauses CMS once before the first namespace drain (not per namespace). If CMS is
  already at 0 pods / 0 replicas, scale-down is skipped. Blocks until fully paused, then runs a
  background watcher until exit. Env CLEANUP_CMS_PAUSE_WAIT_TIMEOUT (default 300s).
  Restored on exit unless --no-cms-restore. For multi-group cleanup, use --no-cms-restore on
  intermediate runs or one invocation with --network-group pci,non-pci,fuel.
  After CMS pause: backs up then scales RabbitmqCluster / Elasticsearch / MongoDBCommunity CRs
  to 0 in GDCE_DATA_PLANE_OPERATOR_NS (entries merged into replica-backup-{group}.json) before
  namespace drain. Recovery restores CR specs via --restore-data-plane-crs (sequence step 5).
  Backup/restore-only modes skip CMS pause and operator CR suspend.

EXAMPLES (add --cluster NAME or --skip-connect; use --dry-run first):
  $0 --list-namespace-groups
  $0 --cluster CLUSTER --dry-run --network-group pci
  $0 --cluster CLUSTER --network-group non-pci
  $0 --cluster CLUSTER --network-group fuel
  $0 --cluster CLUSTER --network-group pci,fuel
  $0 --cluster CLUSTER --backup-ngpos-replicas
  $0 --cluster CLUSTER --dry-run --backup-ngpos-replicas --yes
  $0 --cluster CLUSTER --restore-replicas
  $0 --list-clusters

WARNING: Destructive. Pauses Config Sync reconcilers by default during cleanup.
EOF
}

# -----------------------------
# ARG PARSER
# -----------------------------
parse_args() {
  trace_enter "parse_args"
  [[ $# -eq 0 ]] && show_help && exit 1

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --network)
        shift
        entry="${1:?--network requires net=ns1,ns2}"
        net="${entry%%=*}"
        ns="${entry#*=}"
        add_network_mapping "$net" "$ns"
        ;;
      --network-group)
        shift
        gdce_register_namespace_group "${1:?--network-group requires a name (e.g. pci)}"
        ;;
      --list-namespace-groups)
        gdce_list_namespace_groups
        exit $?
        ;;
      --delete-network)
        shift
        DELETE_NETWORK="${1:?--delete-network requires true or false}"
        ;;
      --backup-ngpos-replicas)
        BACKUP_NGPOS_ONLY=true
        ;;
      --restore-replicas)
        RESTORE_REPLICAS=true
        ;;
      --cluster)
        shift
        GDCE_CLUSTER="${1:?--cluster requires a value}"
        ;;
      --skip-connect)
        GDCE_SKIP_CONNECT=true
        ;;
      --dry-run)
        DRY_RUN=true
        ;;
      --verbose|-v)
        GDCE_VERBOSE=true
        ;;
      --quiet|-q)
        GDCE_VERBOSE=false
        ;;
      --yes)
        GDCE_YES=1
        ;;
      --no-cms-pause)
        RUN_CMS_PAUSE=false
        RUN_CMS_RESTORE_AFTER=false
        ;;
      --no-cms-restore)
        RUN_CMS_RESTORE_AFTER=false
        ;;
      --no-suspend-operator-crs)
        RUN_SUSPEND_OPERATOR_CRS=false
        ;;
      --list-clusters)
        gdce_list_clusters
        exit $?
        ;;
      --help|-h)
        show_help
        exit 0
        ;;
      *)
        echo "Unknown arg: $1" >&2
        show_help
        exit 1
        ;;
    esac
    shift
  done
  [[ "${GDCE_CLEANUP_SUSPEND_DATA_PLANE_CRS:-1}" == "0" ]] && RUN_SUSPEND_OPERATOR_CRS=false
  gdce_trace "parse_args done: CLUSTER=${GDCE_CLUSTER:-<unset>} DRY_RUN=$DRY_RUN VERBOSE=$GDCE_VERBOSE"
  trace_exit "parse_args" 0
}

validate_args() {
  if [[ "$RESTORE_REPLICAS" == "true" || "$BACKUP_NGPOS_ONLY" == "true" ]]; then
    return 0
  fi

  if [[ ${#NETWORK_NETS[@]} -eq 0 ]]; then
    echo "Error: specify --network-group NAME or --network net=ns1,ns2 (see --list-namespace-groups)" >&2
    exit 1
  fi
}

cleanup_confirm_run() {
  local run_type="LIVE" cluster cmd_type details="" i

  gdce_is_dry_run && run_type="DRY-RUN"
  cluster=$(gdce_cluster_display_name)

  if [[ "$RESTORE_REPLICAS" == "true" ]]; then
    cmd_type="restore-replicas (per-group replica-backup-{group}.json)"
  elif [[ "$BACKUP_NGPOS_ONLY" == "true" ]]; then
    cmd_type="backup-ngpos-replicas (per-group replica-backup-{group}.json)"
    details="  Namespaces: GDCE_NGPOS_RESTART_PODS_DELETE_SVC_NS in namespace_groups.sh"
    details+=$'\n'"  Kinds: Deployment, StatefulSet, DaemonSet (nodeSelector), Job (parallelism), CronJob (suspend)"
    details+=$'\n'"  Missing namespaces: skipped and reported"
  else
    cmd_type="network/namespace cleanup"
    details="  Targets:"
    i=0
    while [[ $i -lt ${#NETWORK_NETS[@]} ]]; do
      details+=$'\n'"    - Network: ${NETWORK_NETS[$i]}"
      details+=$'\n'"      Namespaces: ${NETWORK_NS_LIST[$i]}"
      i=$((i + 1))
    done
    details+=$'\n'"  Delete Network CR when empty: $DELETE_NETWORK"
    if [[ "$RUN_CMS_PAUSE" == "true" ]]; then
      gdce_load_cms_config
      details+=$'\n'"  CMS holdoff: block until $GDCE_CMS_NAMESPACE fully paused (0 pods), then watcher until script exits"
      details+=$'\n'"  CMS pause wait timeout: ${CLEANUP_CMS_PAUSE_WAIT_TIMEOUT:-300}s (CLEANUP_CMS_PAUSE_WAIT_TIMEOUT)"
      if [[ "$RUN_CMS_RESTORE_AFTER" == "true" ]]; then
        details+=$'\n'"  CMS restore on exit: scale to $GDCE_CMS_TARGET_REPLICAS replicas + rollout restart"
      else
        details+=$'\n'"  CMS restore on exit: disabled (--no-cms-restore)"
      fi
    else
      details+=$'\n'"  CMS holdoff: disabled (--no-cms-pause)"
    fi
    if [[ "${RUN_SUSPEND_OPERATOR_CRS:-}" == "true" ]]; then
      cleanup_load_data_plane_operator_ns
      details+=$'\n'"  Operator CRs: suspend RabbitmqCluster/Elasticsearch/MongoDBCommunity in ${CLEANUP_DATA_PLANE_OPERATOR_NS[*]} before drain"
    else
      details+=$'\n'"  Operator CR suspend: disabled (--no-suspend-operator-crs)"
    fi
  fi

  gdce_confirm_orchestrator_run \
    "gdce_k8_cleanup_orchestrator.sh" \
    "$cluster" \
    "$run_type" \
    "$cmd_type" \
    "$details"
}

# -----------------------------
# CMS HOLDOFF (once per orchestrator run, before any namespace drain — not per namespace)
# -----------------------------
cleanup_cms_pause_start() {
  gdce_load_cms_config
  if cleanup_cms_is_fully_paused; then
    log "[CMS] Already fully paused in $GDCE_CMS_NAMESPACE (0 pods, 0 replicas) — skip scale-down"
    return 0
  fi
  log_step "CMS holdoff: pause all deployments in $GDCE_CMS_NAMESPACE"
  gdce_cms_pause_all_deployments
}

# Aggressive one-shot CMS enforce (archive k8s_cleanup.sh pattern).
cleanup_cms_force_pause_once() {
  local cms_ns d
  gdce_load_cms_config
  cms_ns="$GDCE_CMS_NAMESPACE"
  if ! run_kubectl get namespace "$cms_ns" &>/dev/null; then
    return 0
  fi
  run_kubectl scale deploy --all -n "$cms_ns" --replicas=0 2>/dev/null || true
  run_kubectl scale deploy reconciler-manager root-reconciler -n "$cms_ns" --replicas=0 2>/dev/null || true
  for d in $(gdce_cms_list_deployments); do
    [[ -z "$d" ]] && continue
    run_kubectl scale deploy "$d" -n "$cms_ns" --replicas=0 2>/dev/null || true
  done
  run_kubectl delete pods -n "$cms_ns" \
    --all --force --grace-period=0 --wait=false 2>/dev/null || true
}

cleanup_cms_count_pods() {
  local cms_ns="$1"
  run_kubectl get pods -n "$cms_ns" --no-headers 2>/dev/null | awk 'NF {c++} END {print c+0}'
}

# True when CMS namespace missing, or 0 pods and every deployment spec.replicas=0.
cleanup_cms_is_fully_paused() {
  local cms_ns d spec pod_n ready total line
  gdce_load_cms_config
  cms_ns="$GDCE_CMS_NAMESPACE"
  if ! run_kubectl get namespace "$cms_ns" &>/dev/null; then
    return 0
  fi
  pod_n=$(cleanup_cms_count_pods "$cms_ns")
  [[ "${pod_n:-0}" -gt 0 ]] && return 1
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    ready=$(echo "$line" | awk '{print $2}' | cut -d'/' -f1)
    total=$(echo "$line" | awk '{print $2}' | cut -d'/' -f2)
    if (( ready > 0 || total > 0 )); then
      return 1
    fi
  done < <(run_kubectl get deploy -n "$cms_ns" --no-headers 2>/dev/null)
  for d in $(gdce_cms_list_deployments); do
    [[ -z "$d" ]] && continue
    spec=$(gdce_cms_get_deploy_spec_replicas "$d")
    [[ "${spec:-0}" -gt 0 ]] && return 1
  done
  return 0
}

# Block namespace cleanup until CMS is fully paused (0 pods, 0 replicas).
cleanup_cms_wait_fully_paused() {
  local elapsed=0 timeout cms_ns pod_n
  gdce_load_cms_config
  cms_ns="$GDCE_CMS_NAMESPACE"
  timeout="${CLEANUP_CMS_PAUSE_WAIT_TIMEOUT:-300}"

  if gdce_is_dry_run; then
    log "[CMS] [dry-run] would block until $cms_ns fully paused (0 pods, 0 replicas) before namespace cleanup"
    return 0
  fi

  if ! run_kubectl get namespace "$cms_ns" &>/dev/null; then
    log "[CMS] Namespace $cms_ns not found — skip pause wait"
    return 0
  fi

  log_step "[CMS] Waiting for full pause in $cms_ns before namespace cleanup (timeout ${timeout}s)..."
  while true; do
    if cleanup_cms_is_fully_paused; then
      log "[CMS] Fully paused — 0 pod(s), all deployments at 0 replicas — starting namespace cleanup"
      return 0
    fi
    cleanup_cms_force_pause_once
    pod_n=$(cleanup_cms_count_pods "$cms_ns")
    log "[CMS] Pause in progress: ${pod_n:-0} pod(s) in $cms_ns — re-enforce in ${WATCH_INTERVAL}s (elapsed ${elapsed}s / ${timeout}s)"
    elapsed=$((elapsed + WATCH_INTERVAL))
    if [[ "$elapsed" -ge "$timeout" ]]; then
      log "[CMS] ERROR: CMS not fully paused after ${timeout}s (${pod_n:-0} pod(s) remain in $cms_ns)"
      log "[CMS] Increase CLEANUP_CMS_PAUSE_WAIT_TIMEOUT or inspect config-management-system before retrying"
      return 1
    fi
    sleep "$WATCH_INTERVAL"
  done
}

watch_and_kill_reconcilers() {
  local cms_ns
  gdce_load_cms_config
  cms_ns="$GDCE_CMS_NAMESPACE"

  if gdce_is_dry_run; then
    echo "[CMS Watcher] [dry-run] would run in background while cleanup is active (namespace $cms_ns)"
    return 0
  fi

  CLEANUP_CMS_HOLDOFF_ACTIVE=true
  (
    echo "[CMS Watcher] Holdoff active for $cms_ns (until cleanup script exits)..."

    while [[ "${CLEANUP_CMS_HOLDOFF_ACTIVE:-}" == "true" ]]; do
      run_kubectl scale deploy --all -n "$cms_ns" --replicas=0 2>/dev/null || true
      run_kubectl delete pods -n "$cms_ns" \
        --all --force --grace-period=0 --wait=false 2>/dev/null || true
      sleep "$WATCH_INTERVAL"
    done
    echo "[CMS Watcher] Holdoff ended"
  ) &
  cleanup_register_bg_pid
}

# -----------------------------
# Data-plane operator CR suspend (rabbitmq / elastic / mongo)
# -----------------------------
cleanup_load_data_plane_operator_ns() {
  local list part
  CLEANUP_DATA_PLANE_OPERATOR_NS=()
  gdce_namespace_groups_load_cache 2>/dev/null || true
  eval "list=\"\${GDCE_DATA_PLANE_OPERATOR_NS:-rabbitmq-system,elastic-system,mongodb}\""
  IFS=',' read -ra PARTS <<< "$list"
  for part in ${PARTS[@]+"${PARTS[@]}"}; do
    part=$(trim "$part")
    [[ -z "$part" ]] && continue
    CLEANUP_DATA_PLANE_OPERATOR_NS+=("$part")
  done
}

cleanup_ns_is_data_plane_operator() {
  local want="$1" n
  for n in ${CLEANUP_DATA_PLANE_OPERATOR_NS[@]+"${CLEANUP_DATA_PLANE_OPERATOR_NS[@]}"}; do
    [[ "$n" == "$want" ]] && return 0
  done
  return 1
}

cleanup_suspend_rabbitmq_crs_in_ns() {
  local ns="$1" quiet="${2:-0}" res name
  for res in $(run_kubectl get rabbitmqclusters -n "$ns" -o name 2>/dev/null); do
    [[ -z "$res" ]] && continue
    name="${res#*/}"
    if [[ "$quiet" -eq 0 ]]; then
      log "[operator] [$ns] RabbitmqCluster/$name → spec.replicas=0"
    fi
    if gdce_is_dry_run; then
      [[ "$quiet" -eq 0 ]] && log "[operator] [$ns] [dry-run] would patch $res spec.replicas=0"
      continue
    fi
    run_kubectl patch "$res" -n "$ns" --type=merge \
      -p '{"spec":{"replicas":0}}' 2>/dev/null || true
  done
}

cleanup_suspend_elastic_crs_in_ns() {
  local ns="$1" quiet="${2:-0}" res name i nsets
  for res in $(run_kubectl get elasticsearch -n "$ns" -o name 2>/dev/null); do
    [[ -z "$res" ]] && continue
    name="${res#*/}"
    nsets=$(run_kubectl get "$res" -n "$ns" -o jsonpath='{range .spec.nodeSets[*]}{.name}{"\n"}{end}' 2>/dev/null | awk 'NF {c++} END {print c+0}')
    if [[ "${nsets:-0}" -gt 0 ]]; then
      i=0
      while [[ $i -lt $nsets ]]; do
        if [[ "$quiet" -eq 0 ]]; then
          log "[operator] [$ns] Elasticsearch/$name nodeSets[$i].count → 0"
        fi
        if gdce_is_dry_run; then
          [[ "$quiet" -eq 0 ]] && log "[operator] [$ns] [dry-run] would patch $res nodeSets[$i].count=0"
        else
          run_kubectl patch "$res" -n "$ns" --type=json \
            -p="[{\"op\":\"replace\",\"path\":\"/spec/nodeSets/${i}/count\",\"value\":0}]" 2>/dev/null || true
        fi
        i=$((i + 1))
      done
    else
      if [[ "$quiet" -eq 0 ]]; then
        log "[operator] [$ns] Elasticsearch/$name → spec.enabled=false (no nodeSets)"
      fi
      if gdce_is_dry_run; then
        [[ "$quiet" -eq 0 ]] && log "[operator] [$ns] [dry-run] would patch $res spec.enabled=false"
      else
        run_kubectl patch "$res" -n "$ns" --type=merge \
          -p '{"spec":{"enabled":false}}' 2>/dev/null || true
      fi
    fi
  done
}

cleanup_suspend_mongo_crs_in_ns() {
  local ns="$1" quiet="${2:-0}" res name
  for res in $(run_kubectl get mongodbcommunity -n "$ns" -o name 2>/dev/null); do
    [[ -z "$res" ]] && continue
    name="${res#*/}"
    if [[ "$quiet" -eq 0 ]]; then
      log "[operator] [$ns] MongoDBCommunity/$name → spec.members=0"
    fi
    if gdce_is_dry_run; then
      [[ "$quiet" -eq 0 ]] && log "[operator] [$ns] [dry-run] would patch $res spec.members=0"
      continue
    fi
    run_kubectl patch "$res" -n "$ns" --type=merge \
      -p '{"spec":{"members":0}}' 2>/dev/null || true
  done
}

# Suspend operator CRs in one namespace; optional quiet re-enforce during monitor loop.
cleanup_suspend_operator_crs_in_ns() {
  local ns="$1" quiet="${2:-0}"
  if ! run_kubectl get namespace "$ns" &>/dev/null; then
    [[ "$quiet" -eq 0 ]] && log "[operator] [$ns] SKIP: namespace not found"
    return 0
  fi
  cleanup_suspend_rabbitmq_crs_in_ns "$ns" "$quiet"
  cleanup_suspend_elastic_crs_in_ns "$ns" "$quiet"
  cleanup_suspend_mongo_crs_in_ns "$ns" "$quiet"
  if [[ "$quiet" -eq 0 ]] && ! gdce_is_dry_run; then
    run_kubectl scale deploy --all -n "$ns" --replicas=0 2>/dev/null || true
    run_kubectl scale sts --all -n "$ns" --replicas=0 2>/dev/null || true
  fi
}

# Backup operator CR spec (replicas/members/nodeSet counts) into REPLICA_PARTS_DIR before suspend.
collect_data_plane_operator_cr_backup_ns() {
  local ns="$1" safe group gdir part_file raw
  safe=$(replica_safe_ns_filename "${ns}__operator-crs")
  group=$(gdce_ns_resolve_replica_backup_group "$ns")
  if gdce_is_dry_run; then
    gdce_connect_log "[dry-run] would backup operator CRs in $ns -> group=$group ($(gdce_replica_backup_file_for_group "$group"))"
    return 0
  fi
  [[ -z "${REPLICA_PARTS_DIR:-}" ]] && return 0
  if ! run_kubectl get namespace "$ns" &>/dev/null; then
    log "[operator] [$ns] SKIP CR backup: namespace not found"
    return 0
  fi
  gdir="${REPLICA_PARTS_DIR}/${group}"
  mkdir -p "$gdir"
  part_file="${gdir}/${safe}.json"
  raw=$(run_kubectl get rabbitmqclusters,elasticsearch,mongodbcommunity -n "$ns" -o json 2>/dev/null) || raw='{"items":[]}'
  echo "$raw" | gdce_kubectl_crs_to_replica_backup_json "$ns" >"$part_file"
  log "[operator] [$ns] Backed up operator CR spec -> $(basename "$part_file") (group: $group)"
}

cleanup_suspend_data_plane_operator_crs() {
  local ns
  cleanup_load_data_plane_operator_ns
  if [[ ${#CLEANUP_DATA_PLANE_OPERATOR_NS[@]} -eq 0 ]]; then
    log "[operator] No data-plane operator namespaces configured — skip CR suspend"
    return 0
  fi
  log_step "[operator] Backup then suspend RabbitMQ/Elastic/Mongo CRs (${CLEANUP_DATA_PLANE_OPERATOR_NS[*]})"
  for ns in ${CLEANUP_DATA_PLANE_OPERATOR_NS[@]+"${CLEANUP_DATA_PLANE_OPERATOR_NS[@]}"}; do
    collect_data_plane_operator_cr_backup_ns "$ns"
    cleanup_suspend_operator_crs_in_ns "$ns" 0
  done
  if ! gdce_is_dry_run; then
    sleep 3
  fi
}

# -----------------------------
# SCALE EVERYTHING (from k8s_cleanup.sh)
# -----------------------------
scale_everything() {
  local ns=$1 ds job cj

  if [[ "${RUN_SUSPEND_OPERATOR_CRS:-}" == "true" ]]; then
    [[ ${#CLEANUP_DATA_PLANE_OPERATOR_NS[@]} -eq 0 ]] && cleanup_load_data_plane_operator_ns
    if cleanup_ns_is_data_plane_operator "$ns"; then
      cleanup_suspend_operator_crs_in_ns "$ns" 1
    fi
  fi

  run_kubectl scale deploy --all --replicas=0 -n "$ns" 2>/dev/null || true
  run_kubectl scale sts --all --replicas=0 -n "$ns" 2>/dev/null || true

  for ds in $(run_kubectl get ds -n "$ns" \
    -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || true); do
    [[ -z "$ds" ]] && continue
    run_kubectl patch ds "$ds" -n "$ns" \
      -p '{"spec":{"template":{"spec":{"nodeSelector":{"cleanup":"true"}}}}}' \
      --type=merge 2>/dev/null || true
  done

  for job in $(run_kubectl get job -n "$ns" \
    -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || true); do
    [[ -z "$job" ]] && continue
    run_kubectl patch job "$job" -n "$ns" \
      -p '{"spec":{"parallelism":0}}' \
      --type=merge 2>/dev/null || true
  done

  for cj in $(run_kubectl get cronjob -n "$ns" \
    -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || true); do
    [[ -z "$cj" ]] && continue
    run_kubectl patch cronjob "$cj" -n "$ns" \
      -p '{"spec":{"suspend":true}}' \
      --type=merge 2>/dev/null || true
  done
}

# One-pass pod delete per namespace (no re-delete poll loop in reconciler_loop).
delete_pods_one_pass_in_ns() {
  local ns="$1" pods pod_count p
  if is_ns_pod_delete_done "$ns"; then
    return 0
  fi
  pods=$(run_kubectl get pods -n "$ns" --no-headers 2>/dev/null || true)
  pod_count=$(echo "$pods" | awk 'NF {c++} END {print c+0}')
  if (( pod_count == 0 )); then
    mark_ns_pod_delete_done "$ns"
    log "[$ns] One-pass pod delete: already empty"
    return 0
  fi
  log "[$ns] One-pass pod delete: $pod_count pod(s) (finalizers cleared if needed; not re-deleted in monitor loop)"
  if gdce_is_dry_run; then
    echo "$pods" | while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      log "[$ns] [dry-run] would delete pod: $line"
    done
    mark_ns_pod_delete_done "$ns"
    return 0
  fi
  for p in $(echo "$pods" | awk '{print $1}'); do
    cleanup_pod_if_needed "$p" "$ns"
  done
  run_kubectl delete pods --all -n "$ns" \
    --force --grace-period=0 --wait=false 2>/dev/null || true
  mark_ns_pod_delete_done "$ns"
  return 0
}

# Patch finalizers only when present (k8s_cleanup.sh behavior).
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

# -----------------------------
# CLEANUP NS (initial pass per namespace)
# -----------------------------
cleanup_ns() {
  local ns=$1

  trace_enter "cleanup_ns ns=$ns"
  log_step "[NS] Initial cleanup: $ns"

  save_replicas "$ns"
  scale_everything "$ns"
  delete_pods_one_pass_in_ns "$ns"
  trace_exit "cleanup_ns ns=$ns" 0
}

# -----------------------------
# NETWORK LOOP
# -----------------------------
reconciler_loop() {
  local net=$1
  local i ns_list=""

  trace_enter "reconciler_loop net=$net"
  local len=${#NETWORK_NETS[@]}
  i=0
  while [[ $i -lt $len ]]; do
    if [[ "${NETWORK_NETS[$i]}" == "$net" ]]; then
      ns_list="${NETWORK_NS_LIST[$i]}"
      break
    fi
    i=$((i + 1))
  done

  if gdce_is_dry_run; then
    log "[Net:$net] [dry-run] would monitor namespaces until empty, then delete network"
    trace_exit "reconciler_loop net=$net" 0
    return 0
  fi

  (
    log "[Net:$net] Monitoring..."

    while true; do

      if ! run_kubectl get network "$net" &>/dev/null; then
        echo "[Net:$net] Network deleted"
        break
      fi

      all_clean=true

      for ns in $ns_list; do

        pods=$(run_kubectl get pods -n "$ns" --no-headers 2>/dev/null || true)
        pod_count=$(echo "$pods" | awk 'NF {c++} END {print c+0}')

        # Enforce scale each monitor tick (pods deleted once per namespace only)
        scale_everything "$ns"

        if (( pod_count == 0 )); then
          echo "[Net:$net] $ns → CLEAN ✅"
        elif is_ns_pod_delete_done "$ns"; then
          echo "[Net:$net] $ns → $pod_count pod(s) terminating after one-pass delete (not re-deleting)"
          all_clean=false
        else
          echo "[Net:$net] $ns → $pod_count pod(s) remaining — running one-pass delete"
          delete_pods_one_pass_in_ns "$ns"
          all_clean=false
        fi
      done

      if [[ "$all_clean" == "true" ]]; then
        if [[ "$DELETE_NETWORK" == "true" ]]; then
          echo "[Net:$net] ALL namespaces empty → deleting network"
          run_kubectl delete network "$net" || true
        else
          echo "[Net:$net] ALL namespaces empty (--delete-network false; keeping Network CR)"
        fi
        break
      fi

      gdce_dry_run_sleep "$RETRY_INTERVAL"
    done
  ) &
  cleanup_register_bg_pid
}

# -----------------------------
# WORKLOAD BACKUP (all kinds aligned with scale_everything)
# -----------------------------
init_replica_backup_session() {
  cleanup_replica_parts_dir
  if gdce_is_dry_run; then
    return 0
  fi
  REPLICA_PARTS_DIR=$(mktemp -d "${TMPDIR:-/tmp}/gdce-replica-backup.XXXXXX") || {
    echo "ERROR: mktemp failed for replica backup parts" >&2
    exit 1
  }
}

cleanup_replica_parts_dir() {
  if [[ -n "$REPLICA_PARTS_DIR" && -d "$REPLICA_PARTS_DIR" ]]; then
    rm -rf "$REPLICA_PARTS_DIR"
  fi
  REPLICA_PARTS_DIR=""
}

replica_safe_ns_filename() {
  echo "$1" | tr '/:' '__'
}

# Collect deploy/sts/ds/job/cronjob state for one namespace into REPLICA_PARTS_DIR/<ns>.json
collect_namespace_workload_backup() {
  local ns="$1" raw part_file safe group gdir
  safe=$(replica_safe_ns_filename "$ns")
  group=$(gdce_ns_resolve_replica_backup_group "$ns")
  if gdce_is_dry_run; then
    run_kubectl get deploy,sts,ds,job,cronjob -n "$ns" -o json 2>/dev/null || true
    gdce_connect_log "[dry-run] would backup deploy/sts/ds/job/cronjob in $ns -> group=$group ($(gdce_replica_backup_file_for_group "$group"))"
    return 0
  fi
  gdir="${REPLICA_PARTS_DIR}/${group}"
  mkdir -p "$gdir"
  part_file="${gdir}/${safe}.json"

  raw=$(run_kubectl get deploy,sts,ds,job,cronjob -n "$ns" -o json 2>/dev/null) || raw='{"items":[]}'
  echo "$raw" | gdce_kubectl_list_to_replica_backup_json >"$part_file"
}

finalize_replica_backup_group_file() {
  local group="$1" outfile tmp merged=0 gdir parts=()

  outfile=$(gdce_replica_backup_file_for_group "$group")
  if gdce_is_dry_run; then
    gdce_connect_log "[dry-run] would write group backup: $outfile"
    return 0
  fi
  gdir="${REPLICA_PARTS_DIR}/${group}"
  [[ -d "$gdir" ]] || return 0
  shopt -s nullglob
  parts=("$gdir"/*.json)
  shopt -u nullglob
  [[ ${#parts[@]} -eq 0 ]] && return 0
  tmp="${outfile}.tmp.$$"
  if gdce_jq_slurp_add_files "${parts[@]}" >"$tmp" 2>/dev/null; then
    mkdir -p "$(dirname "$outfile")"
    mv -f "$tmp" "$outfile"
    merged=$(gdce_jq 'length' "$outfile" 2>/dev/null || echo 0)
    echo "Wrote $merged workload backup entries to $(realpath "$outfile" 2>/dev/null || echo "$outfile") (group: $group)"
    REPLICA_BACKUP_GROUPS_WRITTEN+=("$group")
  else
    rm -f "$tmp"
    echo "ERROR: failed to merge replica backup parts into $outfile (group: $group)" >&2
    exit 1
  fi
}

finalize_replica_backup_files() {
  local group gdir
  if gdce_is_dry_run; then
    gdce_connect_log "[dry-run] would write per-group backups: pattern $(gdce_replica_backup_file_pattern)"
    return 0
  fi
  if [[ -z "$REPLICA_PARTS_DIR" || ! -d "$REPLICA_PARTS_DIR" ]]; then
    return 0
  fi
  shopt -s nullglob
  for gdir in "$REPLICA_PARTS_DIR"/*/; do
    [[ -d "$gdir" ]] || continue
    group=$(basename "$gdir")
    finalize_replica_backup_group_file "$group"
  done
  shopt -u nullglob
  cleanup_replica_parts_dir
}

save_replicas() {
  collect_namespace_workload_backup "$1"
}

load_ngpos_backup_namespace_list() {
  local list part
  BACKUP_NS_LIST=()
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
    BACKUP_NS_LIST+=("$part")
  done
  return 0
}

run_backup_ngpos_workloads() {
  local ns backed=0 skipped=0 count=0

  trace_enter "run_backup_ngpos_workloads"
  load_ngpos_backup_namespace_list || exit 1
  log_step "Backing up workload state for ${#BACKUP_NS_LIST[@]} ngpos namespace(s)"
  init_replica_backup_session

  for ns in ${BACKUP_NS_LIST[@]+"${BACKUP_NS_LIST[@]}"}; do
    echo "  Checking namespace: $ns ..."
    if ! run_kubectl get namespace "$ns" &>/dev/null; then
      echo "  SKIP: namespace not found (or kubectl timed out): $ns"
      skipped=$((skipped + 1))
      continue
    fi
    echo "  OK: $ns — backing up deploy/sts/ds/job/cronjob"
    collect_namespace_workload_backup "$ns"
    backed=$((backed + 1))
  done

  finalize_replica_backup_files
  if ! gdce_is_dry_run; then
    for group in ${REPLICA_BACKUP_GROUPS_WRITTEN[@]+"${REPLICA_BACKUP_GROUPS_WRITTEN[@]}"}; do
      f=$(gdce_replica_backup_file_for_group "$group")
      count=$((count + $(gdce_jq 'length' "$f" 2>/dev/null || echo 0)))
    done
  fi
  log "Backup summary: $backed namespace(s) backed up, $skipped skipped, ${#REPLICA_BACKUP_GROUPS_WRITTEN[@]} group file(s), $count total entries"
  trace_exit "run_backup_ngpos_workloads" 0
}

restore_one_workload_entry() {
  local i="$1" action ns kind name replicas parallelism suspend node_selector

  action=$(echo "$i" | gdce_jq -r '.action // "scale"')
  ns=$(echo "$i" | gdce_jq -r '.namespace')
  kind=$(echo "$i" | gdce_jq -r '.kind')
  name=$(echo "$i" | gdce_jq -r '.name')

  if [[ -z "$ns" || "$ns" == "null" || -z "$name" || "$name" == "null" ]]; then
    return 0
  fi

  case "$action" in
    scale)
      replicas=$(echo "$i" | gdce_jq -r '.replicas // 1')
      if gdce_is_dry_run; then
        gdce_connect_log "[dry-run] kubectl scale $(echo "$kind" | tr '[:upper:]' '[:lower:]') $name -n $ns --replicas=$replicas"
        return 0
      fi
      run_kubectl scale \
        "$(echo "$kind" | tr '[:upper:]' '[:lower:]')" \
        "$name" -n "$ns" --replicas="$replicas" || true
      ;;
    patch_ds)
      node_selector=$(echo "$i" | gdce_jq -c '.nodeSelector // {}')
      if gdce_is_dry_run; then
        gdce_connect_log "[dry-run] kubectl patch ds $name -n $ns (restore nodeSelector)"
        return 0
      fi
      run_kubectl patch ds "$name" -n "$ns" --type=merge \
        -p "{\"spec\":{\"template\":{\"spec\":{\"nodeSelector\":${node_selector}}}}}" || true
      ;;
    patch_job)
      parallelism=$(echo "$i" | gdce_jq -r '.parallelism // 1')
      if gdce_is_dry_run; then
        gdce_connect_log "[dry-run] kubectl patch job $name -n $ns parallelism=$parallelism"
        return 0
      fi
      run_kubectl patch job "$name" -n "$ns" --type=merge \
        -p "{\"spec\":{\"parallelism\":${parallelism}}}" || true
      ;;
    patch_cronjob)
      suspend=$(echo "$i" | gdce_jq -r '.suspend // false')
      if gdce_is_dry_run; then
        gdce_connect_log "[dry-run] kubectl patch cronjob $name -n $ns suspend=$suspend"
        return 0
      fi
      run_kubectl patch cronjob "$name" -n "$ns" --type=merge \
        -p "{\"spec\":{\"suspend\":${suspend}}}" || true
      ;;
    patch_rabbitmq_cr|patch_elastic_cr|patch_mongo_cr)
      replicas=$(echo "$i" | gdce_jq -r '.replicas // 1')
      RESTORE_ROW_CR_EXTRA=$(echo "$i" | gdce_jq -c '.crExtra // {}')
      gdce_restore_apply_workload "$ns" "$kind" "$name" "$action" "$replicas" 1 false '{}'
      ;;
    *)
      if gdce_is_dry_run; then
        gdce_connect_log "[dry-run] skip unknown backup action: $action ($kind/$name)"
        return 0
      fi
      echo "WARN: unknown backup action '$action' for $kind/$name in $ns" >&2
      ;;
  esac
}

# -----------------------------
# RESTORE
# -----------------------------
restore_replicas_from_file() {
  local file="$1" group="$2"
  local count=0 ns kind name action replicas parallelism suspend node_selector
  local saved_timeout="${GDCE_KUBECTL_REQUEST_TIMEOUT:-}" saved_quiet="${GDCE_RESTORE_QUIET_KUBECTL:-}"

  if [[ ! -f "$file" ]]; then
    echo "  SKIP group $group: backup file not found: $file"
    return 0
  fi
  if ! gdce_replica_backup_is_json_array "$file"; then
    echo "ERROR: $file is not a valid JSON array (re-run cleanup backup for group $group)" >&2
    return 1
  fi
  count=$(gdce_replica_backup_array_length "$file" 2>/dev/null || echo 0)
  echo "  Restoring $count workload entries from $file (group: $group) ..."
  if gdce_is_dry_run; then
    while gdce_restore_read_row; do
      gdce_restore_apply_workload "$RESTORE_ROW_NS" "$RESTORE_ROW_KIND" "$RESTORE_ROW_NAME" \
        "$RESTORE_ROW_ACTION" "$RESTORE_ROW_REPLICAS" "$RESTORE_ROW_PARALLELISM" \
        "$RESTORE_ROW_SUSPEND" "$RESTORE_ROW_NODE_SELECTOR"
    done < <(gdce_replica_backup_stream_restore_rows "$file")
    return 0
  fi
  GDCE_RESTORE_QUIET_KUBECTL=1
  GDCE_KUBECTL_REQUEST_TIMEOUT="${GDCE_RESTORE_KUBECTL_TIMEOUT:-60s}"
  gdce_restore_ns_cache_warm
  while gdce_restore_read_row; do
    gdce_restore_ns_exists "$RESTORE_ROW_NS" || continue
    gdce_restore_apply_workload "$RESTORE_ROW_NS" "$RESTORE_ROW_KIND" "$RESTORE_ROW_NAME" \
      "$RESTORE_ROW_ACTION" "$RESTORE_ROW_REPLICAS" "$RESTORE_ROW_PARALLELISM" \
      "$RESTORE_ROW_SUSPEND" "$RESTORE_ROW_NODE_SELECTOR"
  done < <(gdce_replica_backup_stream_restore_rows "$file")
  GDCE_RESTORE_QUIET_KUBECTL="$saved_quiet"
  GDCE_KUBECTL_REQUEST_TIMEOUT="$saved_timeout"
  return 0
}

restore_replicas() {
  local group file groups=() found=0 failed=0 legacy

  trace_enter "restore_replicas"
  while IFS= read -r group; do
    [[ -z "$group" ]] && continue
    groups+=("$group")
  done < <(gdce_replica_backup_groups_for_restore)

  for group in ${groups[@]+"${groups[@]}"}; do
    file=$(gdce_replica_backup_file_for_group "$group")
    if [[ -f "$file" ]]; then
      found=1
      restore_replicas_from_file "$file" "$group" || failed=1
    else
      echo "  SKIP group $group: no backup file at $file"
    fi
  done

  if [[ $found -eq 0 ]]; then
    gdce_namespace_groups_load_cache || true
    eval "legacy=\"\${GDCE_REPLICA_BACKUP_FILE:-replica-backup.json}\""
    case "$legacy" in
      /*|[A-Za-z]:/*|[A-Za-z]:\\*) ;;
      *) legacy="$SCRIPT_DIR/$legacy" ;;
    esac
    if [[ -f "$legacy" ]]; then
      echo "  Using legacy backup file: $legacy"
      restore_replicas_from_file "$legacy" "legacy" || failed=1
      found=1
    fi
  fi

  if [[ $found -eq 0 ]]; then
    if gdce_is_dry_run; then
      gdce_connect_log "[dry-run] restore-replicas: no per-group or legacy backup files found"
      trace_exit "restore_replicas" 0
      return 0
    fi
    echo "ERROR: no replica backup files found (run cleanup per --network-group pci|non-pci|fuel first)" >&2
    exit 1
  fi

  if gdce_is_dry_run; then
    gdce_connect_log "[dry-run] restore-replicas complete (no changes applied)"
  else
    log "Restore complete"
  fi
  [[ $failed -ne 0 ]] && exit 1
  trace_exit "restore_replicas" 0
}

# -----------------------------
# DRY RUN (single pass, no background loops)
# -----------------------------
dry_run_cleanup_plan() {
  local net ns

  trace_enter "dry_run_cleanup_plan"
  log_step "Cleanup dry-run plan (no changes applied)"
  gdce_connect_log "=== Cleanup dry-run plan (no changes applied) ==="
  gdce_connect_log "  Cluster: ${GDCE_CLUSTER:-<skip-connect>}"
  gdce_connect_log "  Networks: ${NETWORK_NETS[*]}"
  gdce_connect_log "  Per-NS: one-pass scale + pod delete, then monitor until empty (no re-delete loop)"
  gdce_connect_log "  Global monitor stops background watchers when all networks are gone"
  init_replica_backup_session

  if [[ "$RUN_CMS_PAUSE" == "true" ]]; then
    cleanup_cms_pause_start
    cleanup_cms_wait_fully_paused || exit 1
    watch_and_kill_reconcilers
  fi

  if [[ "${RUN_SUSPEND_OPERATOR_CRS:-}" == "true" ]]; then
    cleanup_suspend_data_plane_operator_crs
  fi

  local i=0 len=${#NETWORK_NETS[@]}
  while [[ $i -lt $len ]]; do
    reconciler_loop "${NETWORK_NETS[$i]}"
    for ns in ${NETWORK_NS_LIST[$i]}; do
      cleanup_ns "$ns"
    done
    net="${NETWORK_NETS[$i]}"
    if [[ "$DELETE_NETWORK" == "true" ]]; then
      run_kubectl delete network "$net"
    else
      gdce_connect_log "[dry-run] skip: kubectl delete network $net (--delete-network false)"
    fi
    i=$((i + 1))
  done

  finalize_replica_backup_files
  gdce_connect_log "[dry-run] cleanup plan complete"
  trace_exit "dry_run_cleanup_plan" 0
}

# -----------------------------
# MAIN
# -----------------------------
main() {
  log_step "gdce_k8_cleanup_orchestrator start"
  parse_args "$@"
  gdce_sync_orchestrator_env
  if [[ ${#NAMESPACE_GROUP_REQUESTS[@]} -gt 0 ]]; then
    log_step "apply namespace groups from ini"
    apply_namespace_groups_from_ini
  fi
  validate_args

  log_step "connect and confirm"
  gdce_connect_init || exit 1
  cleanup_confirm_run || exit 1

  gdce_connect_if_needed || exit 1

  if [[ "$RESTORE_REPLICAS" == "true" ]]; then
    log_step "mode: restore-replicas"
    restore_replicas
    log_step "gdce_k8_cleanup_orchestrator finished (restore)"
    exit 0
  fi

  if [[ "$BACKUP_NGPOS_ONLY" == "true" ]]; then
    log_step "mode: backup-ngpos-replicas"
    run_backup_ngpos_workloads
    log_step "gdce_k8_cleanup_orchestrator finished (backup)"
    exit 0
  fi

  if gdce_is_dry_run; then
    log_step "mode: dry-run cleanup plan"
    dry_run_cleanup_plan
    log_step "gdce_k8_cleanup_orchestrator finished (dry-run)"
    exit 0
  fi

  log_step "mode: live network/namespace cleanup"
  init_replica_backup_session
  log "Cluster: ${GDCE_CLUSTER:-<skip-connect>}"
  log "Replica backup per group at end: $(gdce_replica_backup_file_pattern) (e.g. $(gdce_replica_backup_file_for_group "pci"))"
  log "Starting cleanup..."

  trap cleanup_on_signal INT TERM

  if [[ "$RUN_CMS_PAUSE" == "true" ]]; then
    log_step "CMS holdoff (once per run, before namespace drain): pause, wait, watcher"
    cleanup_cms_pause_start
    cleanup_cms_wait_fully_paused || exit 1
    watch_and_kill_reconcilers
  else
    log "[CMS] Holdoff disabled (--no-cms-pause)"
  fi

  if [[ "${RUN_SUSPEND_OPERATOR_CRS:-}" == "true" ]]; then
    cleanup_suspend_data_plane_operator_crs
  else
    log "[operator] CR suspend disabled (--no-suspend-operator-crs)"
  fi

  local i=0 len=${#NETWORK_NETS[@]}
  log_step "initial per-namespace cleanup — one pass (parallel): scale, backup, delete pods once"
  i=0
  while [[ $i -lt $len ]]; do
    for ns in ${NETWORK_NS_LIST[$i]}; do
      is_namespace_processed "$ns" && continue
      mark_namespace_processed "$ns"
      cleanup_ns "$ns" &
    done
    i=$((i + 1))
  done

  log_step "waiting for one-pass namespace cleanup jobs"
  wait

  log_step "finalize per-group replica backup files"
  finalize_replica_backup_files

  log_step "start network monitor loops (${len} network(s); scale-only until empty, no re-delete)"
  i=0
  while [[ $i -lt $len ]]; do
    gdce_trace "starting reconciler_loop for ${NETWORK_NETS[$i]}"
    reconciler_loop "${NETWORK_NETS[$i]}"
    i=$((i + 1))
  done

  log_step "monitor networks until empty"
  monitor_networks_and_exit
}

main "$@"
