#!/bin/bash
# GDCE cluster connect (bash) — kubectl context + gcloud fleet credentials.
#
# USAGE EXAMPLES:
#
#   # List clusters and fleet GCP projects from source_of_truth.csv
#   ./gdce_connect.sh --list-clusters
#
#   # Preview connect steps without changing kubeconfig or gcloud (recommended first)
#   ./gdce_connect.sh --dry-run --cluster ci001
#
#   # Connect kubectl + gcloud fleet credentials to a cluster
#   ./gdce_connect.sh --cluster ci001
#   ./gdce_connect.sh --cluster ci003
#
#   # Positional cluster name (same as --cluster)
#   ./gdce_connect.sh ci001
#
#   # Interactive prompt when cluster name is omitted
#   ./gdce_connect.sh
#
#   # Skip node check after connect (faster; RBAC may still block get nodes)
#   ./gdce_connect.sh --cluster ci001 --skip-node-check
#
#   # Override source_of_truth.csv (default: beside this script in hybrid_cluster_migration/)
#   GDCE_SOURCE_OF_TRUTH=/path/to/source_of_truth.csv ./gdce_connect.sh --list-clusters
#   GDCE_NAMESPACE_GROUPS=/path/to/namespace_groups.sh ./gdce_k8_cleanup_orchestrator.sh --network-group pci
#   GDCE_FLEET_PROJECT=kr-9985-edgcmp-d ./gdce_connect.sh --cluster lo001
#
#   # Non-interactive credentials (orchestrators / CI)
#   K8S_USERNAME=myeuid K8S_PASSWORD='***' ./gdce_connect.sh --cluster ci001
#
# Source from orchestrators:
#   source "$(dirname "$0")/gdce_connect.sh"
#   GDCE_CLUSTER=ci001 gdce_connect_if_needed
#   GDCE_SKIP_CONNECT=1 gdce_connect_if_needed   # verify current context only
#
# Passwords: masked at prompt (read -s); all connect/orchestrator logs redact --password/--token.
# Env: GDCE_SOURCE_OF_TRUTH, GDCE_NAMESPACE_GROUPS, K8S_USERNAME, K8S_PASSWORD,
#      KUBECTL_CREDENTIALS_NAME, GDCE_FLEET_PROJECT, GDCE_GCLOUD_CMD, GDCE_SKIP_NODE_CHECK=1, DRY_RUN=true
# KUBECTL_CREDENTIALS_NAME skips the credentials-user confirm prompt when set.
# connectgateway_* context users are skipped (fleet token auth); prefers basic-auth users.

DRY_RUN="${DRY_RUN:-false}"
GDCE_VERBOSE="${GDCE_VERBOSE:-false}"
GDCE_DEFAULT_CREDENTIALS_NAME="${KUBECTL_CREDENTIALS_NAME:-RaajaMD_Isc_GCP_Cloud}"
# Script directory (bash path). On Git Bash /drives/c/... maps to C:/... for logging only.
GDCE_CONNECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
gdce_msys_to_win_path() {
  local p="$1"
  if [[ "$p" =~ ^/drives/([a-zA-Z])/(.*)$ ]]; then
    printf '%s:/%s' "$(printf '%s' "${BASH_REMATCH[1]}" | tr '[:lower:]' '[:upper:]')" "${BASH_REMATCH[2]}"
    return 0
  fi
  if [[ "$p" =~ ^/([a-zA-Z])/(.*)$ ]]; then
    printf '%s:/%s' "$(printf '%s' "${BASH_REMATCH[1]}" | tr '[:lower:]' '[:upper:]')" "${BASH_REMATCH[2]}"
    return 0
  fi
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -m "$p" 2>/dev/null && return 0
  fi
  printf '%s\n' "$p"
}
GDCE_DEFAULT_SOT="${GDCE_CONNECT_DIR}/source_of_truth.csv"
GDCE_DEFAULT_NAMESPACE_GROUPS="${GDCE_CONNECT_DIR}/namespace_groups.sh"
NAMESPACE_GROUP_REQUESTS=()
GDCE_NS_GROUPS_LOADED=""

GDCE_KUBECTL_CMD="${GDCE_KUBECTL_CMD:-kubectl}"
GDCE_GCLOUD_CMD="${GDCE_GCLOUD_CMD:-}"
# Applied to orchestrator run_kubectl calls (avoids indefinite hangs on slow API).
GDCE_KUBECTL_REQUEST_TIMEOUT="${GDCE_KUBECTL_REQUEST_TIMEOUT:-220s}"
# Restore fast path: warm NS cache, quiet per-scale progress logs, optional shorter timeout (e.g. 60s).
GDCE_RESTORE_KUBECTL_TIMEOUT="${GDCE_RESTORE_KUBECTL_TIMEOUT:-60s}"
# Final health report (step 11): single kubectl get pods -A; shorter default than full orchestrator.
GDCE_HEALTH_REPORT_KUBECTL_TIMEOUT="${GDCE_HEALTH_REPORT_KUBECTL_TIMEOUT:-90s}"
GDCE_RESTORE_QUIET_KUBECTL="${GDCE_RESTORE_QUIET_KUBECTL:-}"
GDCE_RESTORE_NS_OK=""
GDCE_RESTORE_NS_MISSING=""

gdce_is_dry_run() {
  [[ "${DRY_RUN:-false}" == "true" ]]
}

gdce_verbose_enabled() {
  case "${GDCE_VERBOSE:-false}" in
    1|true|yes|TRUE|YES) return 0 ;;
    *) return 1 ;;
  esac
}

# Detailed step/function tracing (off by default; --verbose or GDCE_VERBOSE=1 to enable). Always to stderr.
gdce_trace() {
  gdce_verbose_enabled || return 0
  local safe
  safe=$(gdce_redact_sensitive_log_text "$*")
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] [TRACE] $safe" >&2
}

gdce_trace_step() {
  gdce_trace "===== $* ====="
}

gdce_trace_enter() {
  gdce_trace ">> ENTER $*"
}

gdce_trace_exit() {
  local label="${1:-?}" rc="${2:-0}"
  gdce_trace "<< EXIT $label rc=$rc"
}

# Propagate orchestrator flags into the shared environment (same shell as gdce_connect).
gdce_sync_orchestrator_env() {
  export DRY_RUN="${DRY_RUN:-false}"
  export GDCE_VERBOSE="${GDCE_VERBOSE:-false}"
}

# Strip passwords/tokens from arbitrary log text (belt-and-suspenders for all connect logs).
gdce_redact_sensitive_log_text() {
  local msg="$1"
  msg=${msg//--password=*/--password=***}
  msg=${msg//--token=*/--token=***}
  msg=${msg//PASSWORD=*/PASSWORD=***}
  msg=${msg//TOKEN=*/TOKEN=***}
  msg=${msg//K8S_PASSWORD=*/K8S_PASSWORD=***}
  msg=${msg//K8S_PASSWORD:*/K8S_PASSWORD:***}
  echo "$msg"
}

gdce_connect_log() {
  local safe
  safe=$(gdce_redact_sensitive_log_text "$*")
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] [GDCE Connect] $safe"
}

# Always-on progress (stdout/stderr); use for long kubectl/API waits even when GDCE_VERBOSE=0.
gdce_log_progress() {
  local safe
  safe=$(gdce_redact_sensitive_log_text "$*")
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] [PROGRESS] $safe" >&2
}

# Resolve jq binary (GDCE_JQ / GDCE_JQ_BIN override, PATH, or common install paths).
gdce_jq_bin() {
  local c
  if [[ -n "${GDCE_JQ_BIN:-}" && -x "${GDCE_JQ_BIN}" ]]; then
    echo "${GDCE_JQ_BIN}"
    return 0
  fi
  if [[ -n "${GDCE_JQ:-}" && -x "${GDCE_JQ}" ]]; then
    echo "${GDCE_JQ}"
    return 0
  fi
  if command -v jq >/dev/null 2>&1; then
    command -v jq
    return 0
  fi
  for c in /usr/bin/jq /bin/jq /usr/local/bin/jq; do
    if [[ -x "$c" ]]; then
      echo "$c"
      return 0
    fi
  done
  return 1
}

# Git Bash / MSYS: prefer Python for replica-backup JSON (jq and python stubs often break).
gdce_is_msys_platform() {
  case "${OSTYPE:-}" in
    msys*|cygwin*|mingw*) return 0 ;;
  esac
  [[ -n "${MSYSTEM:-}" ]] && return 0
  return 1
}

gdce_replica_backup_use_python_json() {
  [[ "${GDCE_REPLICA_BACKUP_USE_PYTHON:-}" == "1" ]] && return 0
  gdce_is_msys_platform
}

# True if interpreter runs a trivial import (skips Windows Store python shims).
gdce_python_probe() {
  local c="$1"
  [[ -n "$c" ]] || return 1
  if [[ "$c" == "PY3" ]]; then
    py -3 -c 'import json,sys; sys.exit(0)' 2>/dev/null
    return $?
  fi
  "$c" -c 'import json,sys; sys.exit(0)' 2>/dev/null
}

# python3 / python / py -3 (Git Bash on Windows often has only "python" or py launcher).
gdce_python_bin() {
  local c
  if [[ -n "${GDCE_PYTHON:-}" ]] && command -v "${GDCE_PYTHON}" >/dev/null 2>&1; then
    if gdce_python_probe "${GDCE_PYTHON}"; then
      command -v "${GDCE_PYTHON}"
      return 0
    fi
  fi
  for c in python3 python; do
    if command -v "$c" >/dev/null 2>&1 && gdce_python_probe "$c"; then
      command -v "$c"
      return 0
    fi
  done
  if command -v py >/dev/null 2>&1 && gdce_python_probe "PY3"; then
    echo "PY3"
    return 0
  fi
  return 1
}

gdce_python_exec() {
  local launcher
  launcher=$(gdce_python_bin) || return 1
  if [[ "$launcher" == "PY3" ]]; then
    py -3 "$@"
  else
    "$launcher" "$@"
  fi
}

# Legacy name — all JSON ops use inline python (no gdce_jq_compat.py path).
gdce_jq_python() {
  gdce_jq_inline_python "$@"
}

# Inline replica-backup array length (bash opens file; Python reads stdin — MSYS-safe).
gdce_replica_backup_array_length_python() {
  local file="$1"
  [[ -f "$file" ]] || return 1
  gdce_python_exec -c 'import json,sys
data=json.load(sys.stdin)
if not isinstance(data, list):
    sys.exit(1)
print(len(data))' <"$file"
}

gdce_replica_backup_is_json_array_python() {
  local file="$1"
  [[ -f "$file" ]] || return 1
  gdce_python_exec -c 'import json,sys
data=json.load(sys.stdin)
sys.exit(0 if isinstance(data, list) else 1)' <"$file"
}

# Stream compact JSON objects from a replica-backup array file (one per line).
gdce_jq_stream_backup_array() {
  local file="$1"
  [[ -f "$file" ]] || return 1
  if ! gdce_replica_backup_use_python_json; then
    if bin=$(gdce_jq_bin 2>/dev/null); then
      if "$bin" -c '.[]' "$file"; then
        return 0
      fi
    fi
  fi
  gdce_python_exec -c 'import json,sys
for obj in json.load(sys.stdin):
    print(json.dumps(obj, separators=(",", ":")))' <"$file"
}

# Extract one field from a JSON object on stdin (replaces jq -r/-c for backup entries).
gdce_jq_field_from_stdin() {
  local filt="$1" raw="${2:-0}" compact="${3:-0}"
  gdce_python_exec -c 'import json,sys,re
filt=sys.argv[1]
raw=int(sys.argv[2])
compact=int(sys.argv[3])
obj=json.load(sys.stdin)
m=re.match(r"^\.(\w+)(?:\s*//\s*(.+))?$", filt.strip())
if not m:
    sys.exit(1)
key,default=m.group(1),m.group(2)
val=obj.get(key) if isinstance(obj,dict) else None
if val is None and default is not None:
    d=default.strip()
    if d in ("true","false"):
        val=(d=="true")
    elif d=="{}":
        val={}
    elif d.startswith(chr(34)) and d.endswith(chr(34)):
        val=d[1:-1]
    else:
        try:
            val=int(d)
        except ValueError:
            try:
                val=float(d)
            except ValueError:
                val=d
if compact:
    print(json.dumps(val,separators=(",",":")))
elif raw:
    if isinstance(val,bool):
        print("true" if val else "false")
    else:
        s="" if val is None else str(val)
        print(s.replace(chr(13),"").replace(chr(10),""))
else:
    print(json.dumps(val))' "$filt" "$raw" "$compact"
}

# Merge JSON arrays from files (bash opens files; no paths passed to Python).
gdce_jq_slurp_add_files() {
  local merged='[]' p
  for p in "$@"; do
    [[ -f "$p" ]] || continue
    merged=$(gdce_python_exec -c 'import json,sys
acc=json.loads(sys.argv[1])
add=json.load(sys.stdin)
if isinstance(add,list):
    acc.extend(add)
print(json.dumps(acc))' "$merged" <"$p") || return 1
  done
  printf '%s\n' "$merged"
}

# Inline jq subset for replica backup (no gdce_jq_compat.py path — MSYS-safe).
gdce_jq_inline_python() {
  local raw=0 compact=0 exit_e=0 slurp=0
  local filt="" a=() f=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -r) raw=1; shift ;;
      -c) compact=1; shift ;;
      -e) exit_e=1; shift ;;
      -s) slurp=1; shift ;;
      *)
        if [[ -z "$filt" ]]; then
          filt="$1"
        else
          a+=("$1")
        fi
        shift
        ;;
    esac
  done
  if [[ "$filt" == "length" && ${#a[@]} -eq 1 && -f "${a[0]}" ]]; then
    gdce_replica_backup_array_length_python "${a[0]}"
    return $?
  fi
  if [[ "$filt" == 'type == "array"' || "$filt" == "type == array" ]] && [[ ${#a[@]} -eq 1 && -f "${a[0]}" ]]; then
    gdce_replica_backup_is_json_array_python "${a[0]}"
    return $?
  fi
  if [[ "$filt" == ".[]" && ${#a[@]} -eq 1 && -f "${a[0]}" ]]; then
    gdce_jq_stream_backup_array "${a[0]}"
    return $?
  fi
  if [[ "$filt" == "add" && "$slurp" -eq 1 && ${#a[@]} -gt 0 ]]; then
    gdce_jq_slurp_add_files "${a[@]}"
    return $?
  fi
  if [[ ${#a[@]} -eq 0 && "$filt" =~ ^\. ]]; then
    gdce_jq_field_from_stdin "$filt" "$raw" "$compact"
    return $?
  fi
  echo "ERROR: gdce_jq inline python: unsupported filter: $filt" >&2
  return 1
}

# Run jq; on MSYS or jq failure use inline python (never requires gdce_jq_compat.py on disk).
gdce_jq() {
  local bin
  if gdce_replica_backup_use_python_json; then
    gdce_jq_inline_python "$@"
    return $?
  fi
  if bin=$(gdce_jq_bin 2>/dev/null); then
    if "$bin" "$@"; then
      return 0
    fi
  fi
  gdce_jq_inline_python "$@"
}

# Read one field from a backup entry JSON object (trim CR/LF — safe on Windows/Git Bash).
gdce_jq_entry_field() {
  local json="$1" filter="$2" v=""
  [[ -z "$json" ]] && return 0
  v=$(printf '%s' "$json" | gdce_jq -r "$filter" 2>/dev/null | tr -d '\r\n')
  printf '%s' "$v"
}

# Reset namespace existence cache (replica restore).
gdce_restore_ns_cache_reset() {
  GDCE_RESTORE_NS_OK=""
  GDCE_RESTORE_NS_MISSING=""
}

# One kubectl list of all namespaces — avoids per-workload "get namespace" calls.
gdce_restore_ns_cache_warm() {
  local ns
  gdce_restore_ns_cache_reset
  while IFS= read -r ns; do
    ns=$(printf '%s' "$ns" | tr -d '\r\n')
    [[ -z "$ns" ]] && continue
    case ",${GDCE_RESTORE_NS_OK}," in
      *,"${ns}",*) ;;
      *) GDCE_RESTORE_NS_OK="${GDCE_RESTORE_NS_OK},${ns}" ;;
    esac
  done < <(run_kubectl get namespaces -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null)
}

# Cached namespace check (falls back to single get if warm list missed).
gdce_restore_ns_exists() {
  local ns="$1"
  ns=$(printf '%s' "$ns" | tr -d '\r\n')
  [[ -z "$ns" ]] && return 1
  case ",${GDCE_RESTORE_NS_OK}," in
    *,"${ns}",*) return 0 ;;
  esac
  case ",${GDCE_RESTORE_NS_MISSING}," in
    *,"${ns}",*) return 1 ;;
  esac
  if run_kubectl get namespace "$ns" &>/dev/null; then
    GDCE_RESTORE_NS_OK="${GDCE_RESTORE_NS_OK},${ns}"
    return 0
  fi
  GDCE_RESTORE_NS_MISSING="${GDCE_RESTORE_NS_MISSING},${ns}"
  return 1
}

# True if action restores a data-plane operator CR (rabbitmq / elastic / mongo).
gdce_restore_is_data_plane_cr_action() {
  case "$(gdce_restore_normalize_action "$1")" in
    patch_rabbitmq_cr|patch_elastic_cr|patch_mongo_cr) return 0 ;;
    *) return 1 ;;
  esac
}

# True if namespace is in GDCE_DATA_PLANE_OPERATOR_NS (namespace_groups.sh).
gdce_ns_is_data_plane_operator_ns() {
  local ns="$1" list part
  ns=$(gdce_trim "$ns")
  [[ -z "$ns" ]] && return 1
  gdce_namespace_groups_load_cache || return 1
  eval "list=\"\${GDCE_DATA_PLANE_OPERATOR_NS:-rabbitmq-system,elastic-system,mongodb}\""
  IFS=',' read -ra PARTS <<< "$list"
  for part in ${PARTS[@]+"${PARTS[@]}"}; do
    part=$(gdce_trim "$part")
    [[ "$part" == "$ns" ]] && return 0
  done
  return 1
}

# Normalize action token (handles parse glitches like scale-monitoring -> scale).
gdce_restore_normalize_action() {
  local a="$1"
  a=$(printf '%s' "$a" | tr -d '\r\n[:space:]' | tr '[:upper:]' '[:lower:]')
  case "$a" in
    scale|scale*) printf '%s' 'scale' ;;
    patch_ds|patch_ds*|patch-ds*) printf '%s' 'patch_ds' ;;
    patch_job|patch_job*|patch-job*) printf '%s' 'patch_job' ;;
    patch_cronjob|patch_cronjob*|patch-cronjob*) printf '%s' 'patch_cronjob' ;;
    patch_rabbitmq_cr|patch_rabbitmq_cr*|patch-rabbitmq-cr*) printf '%s' 'patch_rabbitmq_cr' ;;
    patch_elastic_cr|patch_elastic_cr*|patch-elastic-cr*) printf '%s' 'patch_elastic_cr' ;;
    patch_mongo_cr|patch_mongo_cr*|patch-mongo-cr*) printf '%s' 'patch_mongo_cr' ;;
    "") printf '%s' 'scale' ;;
    *) printf '%s' "$a" ;;
  esac
}

# Apply one replica-backup row (parsed row fields).
gdce_restore_apply_workload() {
  local ns="$1" kind="$2" name="$3" action="$4" replicas="$5" parallelism="$6" suspend="$7" node_selector="$8"

  ns=$(printf '%s' "$ns" | tr -d '\r\n')
  kind=$(printf '%s' "$kind" | tr -d '\r\n')
  name=$(printf '%s' "$name" | tr -d '\r\n')
  action=$(gdce_restore_normalize_action "$action")

  if [[ -z "$ns" || "$ns" == "null" || -z "$name" || "$name" == "null" ]]; then
    return 0
  fi

  case "$action" in
    scale)
      [[ -z "$replicas" || "$replicas" == "null" ]] && replicas=1
      if gdce_is_dry_run; then
        gdce_connect_log "[dry-run] kubectl scale $(printf '%s' "$kind" | tr '[:upper:]' '[:lower:]') $name -n $ns --replicas=$replicas"
        return 0
      fi
      run_kubectl scale \
        "$(printf '%s' "$kind" | tr '[:upper:]' '[:lower:]')" \
        "$name" -n "$ns" --replicas="$replicas" || true
      ;;
    patch_ds)
      [[ -z "$node_selector" ]] && node_selector='{}'
      if gdce_is_dry_run; then
        gdce_connect_log "[dry-run] kubectl patch ds $name -n $ns (restore nodeSelector)"
        return 0
      fi
      run_kubectl patch ds "$name" -n "$ns" --type=merge \
        -p "{\"spec\":{\"template\":{\"spec\":{\"nodeSelector\":${node_selector}}}}}" || true
      ;;
    patch_job)
      [[ -z "$parallelism" || "$parallelism" == "null" ]] && parallelism=1
      if gdce_is_dry_run; then
        gdce_connect_log "[dry-run] kubectl patch job $name -n $ns parallelism=$parallelism"
        return 0
      fi
      run_kubectl patch job "$name" -n "$ns" --type=merge \
        -p "{\"spec\":{\"parallelism\":${parallelism}}}" || true
      ;;
    patch_cronjob)
      [[ -z "$suspend" || "$suspend" == "null" ]] && suspend=false
      if gdce_is_dry_run; then
        gdce_connect_log "[dry-run] kubectl patch cronjob $name -n $ns suspend=$suspend"
        return 0
      fi
      run_kubectl patch cronjob "$name" -n "$ns" --type=merge \
        -p "{\"spec\":{\"suspend\":${suspend}}}" || true
      ;;
    patch_rabbitmq_cr)
      [[ -z "$replicas" || "$replicas" == "null" ]] && replicas=1
      if gdce_is_dry_run; then
        gdce_connect_log "[dry-run] kubectl patch rabbitmqcluster $name -n $ns spec.replicas=$replicas"
        return 0
      fi
      run_kubectl patch "rabbitmqcluster/$name" -n "$ns" --type=merge \
        -p "{\"spec\":{\"replicas\":${replicas}}}" 2>/dev/null || true
      ;;
    patch_mongo_cr)
      local members="${replicas:-1}"
      if [[ -n "${RESTORE_ROW_CR_EXTRA:-}" && "$RESTORE_ROW_CR_EXTRA" != "{}" ]]; then
        members=$(gdce_python_exec -c 'import json,sys
e=json.loads(sys.argv[1] or "{}")
print(e.get("members", sys.argv[2]))' "$RESTORE_ROW_CR_EXTRA" "$members" 2>/dev/null) || members="${replicas:-1}"
      fi
      if gdce_is_dry_run; then
        gdce_connect_log "[dry-run] kubectl patch mongodbcommunity $name -n $ns spec.members=$members"
        return 0
      fi
      run_kubectl patch "mongodbcommunity/$name" -n "$ns" --type=merge \
        -p "{\"spec\":{\"members\":${members}}}" 2>/dev/null || true
      ;;
    patch_elastic_cr)
      local counts_json nsets i cnt enabled
      counts_json=$(echo "${RESTORE_ROW_CR_EXTRA:-{}}" | gdce_jq -c '.nodeSetCounts // empty' 2>/dev/null) || counts_json=""
      if [[ -n "$counts_json" && "$counts_json" != "null" && "$counts_json" != "[]" ]]; then
        nsets=$(echo "$counts_json" | gdce_jq 'length' 2>/dev/null || echo 0)
        if gdce_is_dry_run; then
          gdce_connect_log "[dry-run] kubectl patch elasticsearch $name -n $ns nodeSetCounts=$counts_json"
          return 0
        fi
        i=0
        while [[ $i -lt $nsets ]]; do
          cnt=$(echo "$counts_json" | gdce_jq ".[$i]" 2>/dev/null || echo 0)
          run_kubectl patch "elasticsearch/$name" -n "$ns" --type=json \
            -p="[{\"op\":\"replace\",\"path\":\"/spec/nodeSets/${i}/count\",\"value\":${cnt}}]" 2>/dev/null || true
          i=$((i + 1))
        done
      else
        enabled=$(echo "${RESTORE_ROW_CR_EXTRA:-{}}" | gdce_jq -r 'if has("enabled") then .enabled else empty end' 2>/dev/null) || enabled=""
        if [[ -n "$enabled" ]]; then
          if gdce_is_dry_run; then
            gdce_connect_log "[dry-run] kubectl patch elasticsearch $name -n $ns spec.enabled=$enabled"
            return 0
          fi
          run_kubectl patch "elasticsearch/$name" -n "$ns" --type=merge \
            -p "{\"spec\":{\"enabled\":${enabled}}}" 2>/dev/null || true
        elif gdce_is_dry_run; then
          gdce_connect_log "[dry-run] kubectl patch elasticsearch $name -n $ns (no crExtra nodeSetCounts/enabled)"
        else
          echo "WARN: patch_elastic_cr for $kind/$name in $ns missing crExtra.nodeSetCounts or crExtra.enabled" >&2
          return 1
        fi
      fi
      ;;
    *)
      echo "WARN: unknown backup action '$action' for $kind/$name in $ns" >&2
      return 1
      ;;
  esac
  return 0
}

# Stream backup rows (one Python read). Pipe-separated fields (tabs break MSYS read).
gdce_replica_backup_stream_restore_rows() {
  local file="$1"
  [[ -f "$file" ]] || return 1
  gdce_python_exec -c 'import json,sys,base64
data=json.load(sys.stdin)
if not isinstance(data,list):
    sys.exit(1)
sep="|"
def esc(v):
    return str(v).replace("|", "_")
for obj in data:
    if not isinstance(obj,dict):
        continue
    ns=str(obj.get("namespace") or "")
    kind=str(obj.get("kind") or "")
    name=str(obj.get("name") or "")
    action=str(obj.get("action") or "scale") or "scale"
    replicas=str(obj.get("replicas", 1))
    parallelism=str(obj.get("parallelism", 1))
    suspend=str(obj.get("suspend", False)).lower()
    nsel_b64=base64.b64encode(
        json.dumps(obj.get("nodeSelector") or {}, separators=(",", ":")).encode()
    ).decode()
    cr_extra_b64=base64.b64encode(
        json.dumps(obj.get("crExtra") or {}, separators=(",", ":")).encode()
    ).decode()
    sys.stdout.write(
        sep.join([esc(ns), esc(kind), esc(name), esc(action), esc(replicas),
                  esc(parallelism), esc(suspend), nsel_b64, cr_extra_b64]) + "\n"
    )' <"$file"
}

# Back-compat alias
gdce_replica_backup_stream_restore_tsv() {
  gdce_replica_backup_stream_restore_rows "$@"
}

# Read one pipe-separated restore row (9 fields).
gdce_restore_read_row() {
  local ns kind name action replicas parallelism suspend nsel_b64 cr_extra_b64
  IFS='|' read -r ns kind name action replicas parallelism suspend nsel_b64 cr_extra_b64 || return 1
  [[ -z "$ns" && -z "$name" ]] && return 1
  RESTORE_ROW_NS=$(printf '%s' "$ns" | tr -d '\r\n')
  RESTORE_ROW_KIND=$(printf '%s' "$kind" | tr -d '\r\n')
  RESTORE_ROW_NAME=$(printf '%s' "$name" | tr -d '\r\n')
  RESTORE_ROW_ACTION=$(gdce_restore_normalize_action "$action")
  RESTORE_ROW_REPLICAS=$(printf '%s' "$replicas" | tr -d '\r\n')
  RESTORE_ROW_PARALLELISM=$(printf '%s' "$parallelism" | tr -d '\r\n')
  RESTORE_ROW_SUSPEND=$(printf '%s' "$suspend" | tr -d '\r\n')
  RESTORE_ROW_NODE_SELECTOR='{}'
  RESTORE_ROW_CR_EXTRA='{}'
  if [[ "$RESTORE_ROW_ACTION" == "patch_ds" && -n "$nsel_b64" ]]; then
    RESTORE_ROW_NODE_SELECTOR=$(gdce_python_exec -c 'import base64,sys; print(base64.b64decode(sys.argv[1]).decode())' "$nsel_b64" 2>/dev/null) || RESTORE_ROW_NODE_SELECTOR='{}'
  fi
  if [[ -n "$cr_extra_b64" ]]; then
    RESTORE_ROW_CR_EXTRA=$(gdce_python_exec -c 'import base64,sys; print(base64.b64decode(sys.argv[1]).decode())' "$cr_extra_b64" 2>/dev/null) || RESTORE_ROW_CR_EXTRA='{}'
  fi
  return 0
}

# True if file is a JSON array (python on MSYS; else jq then python).
gdce_replica_backup_is_json_array() {
  local file="$1"
  [[ -f "$file" ]] || return 1
  if gdce_replica_backup_use_python_json; then
    gdce_replica_backup_is_json_array_python "$file" &>/dev/null
    return $?
  fi
  if bin=$(gdce_jq_bin 2>/dev/null); then
    if "$bin" -e 'type == "array"' "$file" &>/dev/null; then
      return 0
    fi
  fi
  gdce_replica_backup_is_json_array_python "$file" &>/dev/null
}

# Array entry count for replica-backup JSON files.
gdce_replica_backup_array_length() {
  local file="$1" n="" err=""
  [[ -f "$file" ]] || {
    echo 0
    return 1
  }
  if gdce_replica_backup_use_python_json; then
    if ! gdce_replica_backup_is_json_array_python "$file" 2>/dev/null; then
      err=$(gdce_replica_backup_is_json_array_python "$file" 2>&1) || true
      gdce_connect_log "ERROR: $file is not a valid JSON array (python): ${err:-invalid JSON}" >&2
      echo 0
      return 1
    fi
    n=$(gdce_replica_backup_array_length_python "$file" 2>/dev/null | tr -d '\r\n[:space:]') || {
      err=$(gdce_replica_backup_array_length_python "$file" 2>&1) || true
      gdce_connect_log "ERROR: cannot count entries in $file (python): ${err:-unknown}" >&2
      echo 0
      return 1
    }
    if [[ "$n" =~ ^[0-9]+$ ]]; then
      echo "$n"
      return 0
    fi
  fi
  if ! gdce_replica_backup_is_json_array "$file"; then
    gdce_connect_log "ERROR: $file is not a valid JSON array (jq/python)" >&2
    echo 0
    return 1
  fi
  if bin=$(gdce_jq_bin 2>/dev/null); then
    n=$("$bin" 'length' "$file" 2>/dev/null | tr -d '\r\n[:space:]')
    if [[ "$n" =~ ^[0-9]+$ ]]; then
      echo "$n"
      return 0
    fi
  fi
  n=$(gdce_replica_backup_array_length_python "$file" 2>/dev/null | tr -d '\r\n[:space:]') || n=""
  if [[ "$n" =~ ^[0-9]+$ ]]; then
    echo "$n"
    return 0
  fi
  err=$(gdce_replica_backup_array_length_python "$file" 2>&1) || true
  gdce_connect_log "ERROR: cannot count entries in $file: ${err:-install jq or working python3}" >&2
  echo 0
  return 1
}

# Transform kubectl list JSON (stdin) to replica-backup entry array.
gdce_kubectl_list_to_replica_backup_json() {
  local bin
  if ! gdce_replica_backup_use_python_json; then
    if bin=$(gdce_jq_bin 2>/dev/null); then
      "$bin" '
    [.items[] |
      if .kind == "Deployment" or .kind == "StatefulSet" then
        {
          namespace: .metadata.namespace,
          kind: .kind,
          name: .metadata.name,
          action: "scale",
          replicas: (.spec.replicas // 1)
        }
      elif .kind == "DaemonSet" then
        {
          namespace: .metadata.namespace,
          kind: .kind,
          name: .metadata.name,
          action: "patch_ds",
          nodeSelector: (.spec.template.spec.nodeSelector // {})
        }
      elif .kind == "Job" then
        {
          namespace: .metadata.namespace,
          kind: .kind,
          name: .metadata.name,
          action: "patch_job",
          parallelism: (.spec.parallelism // 1)
        }
      elif .kind == "CronJob" then
        {
          namespace: .metadata.namespace,
          kind: .kind,
          name: .metadata.name,
          action: "patch_cronjob",
          suspend: (.spec.suspend // false)
        }
      else
        empty
      end
    ]'
      return $?
    fi
  fi
  gdce_python_exec -c 'import json,sys
doc=json.load(sys.stdin)
items=doc.get("items") or []
out=[]
for item in items:
    kind=item.get("kind")
    meta=item.get("metadata") or {}
    spec=item.get("spec") or {}
    tpl=(spec.get("template") or {}).get("spec") or {}
    ns, name=meta.get("namespace"), meta.get("name")
    if not ns or not name:
        continue
    if kind in ("Deployment","StatefulSet"):
        out.append({"namespace":ns,"kind":kind,"name":name,"action":"scale","replicas":spec.get("replicas",1)})
    elif kind=="DaemonSet":
        out.append({"namespace":ns,"kind":kind,"name":name,"action":"patch_ds","nodeSelector":tpl.get("nodeSelector") or {}})
    elif kind=="Job":
        out.append({"namespace":ns,"kind":kind,"name":name,"action":"patch_job","parallelism":spec.get("parallelism",1)})
    elif kind=="CronJob":
        out.append({"namespace":ns,"kind":kind,"name":name,"action":"patch_cronjob","suspend":spec.get("suspend",False)})
print(json.dumps(out))'
}

# Operator CR list (rabbitmqclusters, elasticsearch, mongodbcommunity) -> replica-backup JSON array.
gdce_kubectl_crs_to_replica_backup_json() {
  local ns="$1"
  gdce_python_exec -c 'import json,sys
ns=sys.argv[1]
doc=json.load(sys.stdin)
items=doc.get("items") or []
out=[]
for item in items:
    kind=item.get("kind")
    meta=item.get("metadata") or {}
    spec=item.get("spec") or {}
    name=meta.get("name")
    if not name:
        continue
    if kind=="RabbitmqCluster":
        out.append({
            "namespace": ns, "kind": kind, "name": name,
            "action": "patch_rabbitmq_cr",
            "replicas": spec.get("replicas", 1)
        })
    elif kind=="Elasticsearch":
        nsets=spec.get("nodeSets") or []
        if nsets:
            out.append({
                "namespace": ns, "kind": kind, "name": name,
                "action": "patch_elastic_cr",
                "replicas": 0,
                "crExtra": {"nodeSetCounts": [n.get("count", 0) for n in nsets]}
            })
        else:
            out.append({
                "namespace": ns, "kind": kind, "name": name,
                "action": "patch_elastic_cr",
                "replicas": 0,
                "crExtra": {"enabled": spec.get("enabled", True)}
            })
    elif kind=="MongoDBCommunity":
        members=spec.get("members", 1)
        out.append({
            "namespace": ns, "kind": kind, "name": name,
            "action": "patch_mongo_cr",
            "replicas": members,
            "crExtra": {"members": members}
        })
print(json.dumps(out))' "$ns"
}

# Replica backup read/merge requires jq or working python.
gdce_require_jq() {
  if gdce_replica_backup_use_python_json && gdce_python_bin >/dev/null 2>&1; then
    gdce_connect_log "replica backup JSON: using python on MSYS/Git Bash (set GDCE_REPLICA_BACKUP_USE_PYTHON=0 to try jq)"
    return 0
  fi
  if gdce_jq_bin >/dev/null 2>&1; then
    return 0
  fi
  if gdce_python_bin >/dev/null 2>&1; then
    gdce_connect_log "jq not in PATH; using python for replica backup JSON"
    return 0
  fi
  echo "ERROR: replica backup requires jq or a working python3/python." >&2
  echo "  Install jq: yum install -y jq  OR  apt-get install -y jq" >&2
  echo "  Or install Python and run: py -3 -c \"import json\"" >&2
  echo "  Or set GDCE_JQ=/full/path/to/jq  or  GDCE_PYTHON=/path/to/python.exe" >&2
  return 1
}

# Masked secret read (uses /dev/tty when available so input is not echoed).
gdce_read_secret() {
  local prompt="$1" var_name="$2" default_val="${3:-}"
  local secret=""
  if [[ -r /dev/tty ]]; then
    read -r -s -p "$prompt" secret </dev/tty
    echo "" >/dev/tty
  else
    read -r -s -p "$prompt" secret
    echo ""
  fi
  if [[ -n "$default_val" ]]; then
    secret="${secret:-$default_val}"
  fi
  printf -v "$var_name" '%s' "$secret"
}

gdce_trim() {
  local s="$1"
  s="${s//$'\r'/}"
  s="${s%%#*}"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  echo "$s"
}

gdce_normalize_group_name() {
  gdce_trim "$(echo "$1" | tr '[:upper:]' '[:lower:]')"
}

# Group id for shell vars: non-pci -> non_pci (hyphens invalid in bash identifiers).
gdce_ns_group_var_id() {
  gdce_normalize_group_name "$1" | tr '-' '_'
}

gdce_namespace_groups_file() {
  if [[ -n "${GDCE_NAMESPACE_GROUPS:-}" && -f "${GDCE_NAMESPACE_GROUPS}" ]]; then
    echo "${GDCE_NAMESPACE_GROUPS}"
    return 0
  fi
  if [[ -f "$GDCE_DEFAULT_NAMESPACE_GROUPS" ]]; then
    echo "$GDCE_DEFAULT_NAMESPACE_GROUPS"
    return 0
  fi
  return 1
}

# Load namespace_groups.sh once (fast; no INI parsing).
gdce_namespace_groups_load_cache() {
  local f
  [[ "${GDCE_NS_GROUPS_LOADED:-}" == "1" ]] && return 0
  f=$(gdce_namespace_groups_file) || {
    gdce_connect_log "ERROR: namespace_groups.sh not found. Set GDCE_NAMESPACE_GROUPS."
    return 1
  }
  # shellcheck source=/dev/null
  source "$f"
  GDCE_NS_GROUPS_LOADED=1
  return 0
}

gdce_ini_get() {
  local want_section="$1" want_key="$2" var_id
  want_section=$(gdce_normalize_group_name "$want_section")
  want_key=$(gdce_normalize_group_name "$want_key")
  gdce_namespace_groups_load_cache || return 1
  var_id=$(gdce_ns_group_var_id "$want_section")
  case "$want_key" in
    network|namespaces|default_replicas|default_touch)
      eval "echo \"\${NS_GROUP_${var_id}_${want_key}:-}\""
      ;;
    *)
      echo ""
      ;;
  esac
}

# Namespace name -> shell var id (ngpos-fuel-pci-l0 -> ngpos_fuel_pci_l0).
gdce_ns_var_id() {
  gdce_normalize_group_name "$1" | tr '-' '_'
}

# Remember which --namespace-group a namespace came from (for profile fallbacks).
gdce_ns_register_group() {
  local ns="$1" group="$2" var_id
  [[ -z "$ns" || -z "$group" ]] && return 0
  var_id=$(gdce_ns_var_id "$ns")
  group=$(gdce_normalize_group_name "$group")
  eval "NS_GROUP_FOR_${var_id}=\"$group\""
}

gdce_ns_get_group() {
  local ns="$1" var_id
  var_id=$(gdce_ns_var_id "$ns")
  eval "echo \"\${NS_GROUP_FOR_${var_id}:-}\""
}

# Namespace groups that have a Network CR (pci, non-pci, fuel) — one backup file per group.
gdce_replica_backup_network_groups_list() {
  local g var_id net
  gdce_namespace_groups_load_cache || return 1
  for g in ${GDCE_NS_GROUP_IDS[@]+"${GDCE_NS_GROUP_IDS[@]}"}; do
    [[ "$g" == "ngpos-apps" ]] && continue
    var_id=$(gdce_ns_group_var_id "$g")
    eval "net=\"\${NS_GROUP_${var_id}_network:-}\""
    [[ -n "$net" ]] && echo "$g"
  done
}

gdce_replica_backup_file_pattern() {
  gdce_namespace_groups_load_cache || true
  if [[ -n "${GDCE_REPLICA_BACKUP_FILE_PATTERN:-}" ]]; then
    printf '%s\n' "$GDCE_REPLICA_BACKUP_FILE_PATTERN"
  else
    printf '%s\n' 'replica-backup-{group}.json'
  fi
}

gdce_replica_backup_file_for_group() {
  local group="$1" pattern base dir
  group=$(gdce_normalize_group_name "$group")
  [[ -z "$group" ]] && group="ungrouped"
  pattern=$(gdce_replica_backup_file_pattern)
  base="${pattern//\{group\}/$group}"
  case "$base" in
    /*|[A-Za-z]:/*|[A-Za-z]:\\*)
      echo "$base"
      ;;
    *)
      dir="${GDCE_CONNECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
      echo "$dir/$base"
      ;;
  esac
}

# Resolve backup group for a namespace (registered group, pci/non-pci/fuel lists, or net-* / ungrouped).
gdce_ns_resolve_replica_backup_group() {
  local ns="$1" g var_id ns_list part reg
  ns=$(gdce_trim "$ns")
  reg=$(gdce_ns_get_group "$ns")
  if [[ -n "$reg" && "$reg" != "ngpos-apps" ]]; then
    echo "$reg"
    return 0
  fi
  gdce_namespace_groups_load_cache || {
    echo "ungrouped"
    return 0
  }
  while IFS= read -r g; do
    [[ -z "$g" ]] && continue
    var_id=$(gdce_ns_group_var_id "$g")
    eval "ns_list=\"\${NS_GROUP_${var_id}_namespaces:-}\""
    IFS=',' read -ra PARTS <<< "$ns_list"
    for part in ${PARTS[@]+"${PARTS[@]}"}; do
      part=$(gdce_trim "$part")
      [[ "$part" == "$ns" ]] && {
        echo "$g"
        return 0
      }
    done
  done < <(gdce_replica_backup_network_groups_list)
  if [[ -n "$reg" ]]; then
    echo "$reg"
    return 0
  fi
  echo "ungrouped"
  return 0
}

# Groups to restore: explicit --namespace-group requests, else all network groups with backup files.
gdce_replica_backup_groups_for_restore() {
  local g groups=() file
  if [[ ${#NAMESPACE_GROUP_REQUESTS[@]} -gt 0 ]]; then
    for g in ${NAMESPACE_GROUP_REQUESTS[@]+"${NAMESPACE_GROUP_REQUESTS[@]}"}; do
      g=$(gdce_normalize_group_name "$g")
      [[ "$g" == "ngpos-apps" ]] && continue
      groups+=("$g")
    done
  else
    while IFS= read -r g; do
      [[ -z "$g" ]] && continue
      groups+=("$g")
    done < <(gdce_replica_backup_network_groups_list)
  fi
  printf '%s\n' "${groups[@]}"
}

# True if namespace is in GDCE_NGPOS_RESTART_PODS_DELETE_SVC_NS (pods+svc only; no deploy/sts/ds/job).
gdce_ns_is_ngpos_pods_svc_refresh_ns() {
  local ns="$1" list part
  ns=$(gdce_trim "$ns")
  [[ -z "$ns" ]] && return 1
  gdce_namespace_groups_load_cache || return 1
  eval "list=\"\${GDCE_NGPOS_RESTART_PODS_DELETE_SVC_NS:-}\""
  [[ -z "$list" ]] && return 1
  IFS=',' read -ra PARTS <<< "$list"
  for part in ${PARTS[@]+"${PARTS[@]}"}; do
    part=$(gdce_trim "$part")
    [[ "$part" == "$ns" ]] && return 0
  done
  return 1
}

# CMS (Config Sync) — namespace_groups.sh: GDCE_CMS_NAMESPACE, GDCE_CMS_TARGET_REPLICAS
gdce_load_cms_config() {
  local legacy_target
  gdce_namespace_groups_load_cache 2>/dev/null || true
  eval "GDCE_CMS_NAMESPACE=\"\${GDCE_CMS_NAMESPACE:-config-management-system}\""
  eval "GDCE_CMS_TARGET_REPLICAS=\"\${GDCE_CMS_TARGET_REPLICAS:-}\""
  if [[ -z "${GDCE_CMS_TARGET_REPLICAS:-}" ]]; then
    eval "legacy_target=\"\${GDCE_CMS_RESUME_REPLICAS:-}\""
    GDCE_CMS_TARGET_REPLICAS="${legacy_target:-1}"
  fi
}

gdce_cms_list_deployments() {
  gdce_load_cms_config
  run_kubectl get deploy -n "$GDCE_CMS_NAMESPACE" \
    -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null || true
}

gdce_cms_get_deploy_spec_replicas() {
  local d="$1" r
  gdce_load_cms_config
  r=$(run_kubectl get deploy "$d" -n "$GDCE_CMS_NAMESPACE" \
    -o jsonpath='{.spec.replicas}' 2>/dev/null) || echo "0"
  echo "${r:-0}"
}

# Scale all CMS deployments to 0 and force-delete pods (cleanup holdoff start).
gdce_cms_pause_all_deployments() {
  local d
  gdce_load_cms_config
  gdce_connect_log "[CMS] Scaling down deployments in $GDCE_CMS_NAMESPACE (replicas=0 until cleanup completes)"

  if gdce_is_dry_run; then
    gdce_connect_log "[dry-run] kubectl scale deploy --all -n $GDCE_CMS_NAMESPACE --replicas=0"
    gdce_connect_log "[dry-run] kubectl delete pods --all -n $GDCE_CMS_NAMESPACE --force --grace-period=0"
    return 0
  fi

  if ! run_kubectl get namespace "$GDCE_CMS_NAMESPACE" &>/dev/null; then
    gdce_connect_log "[CMS] WARN: namespace $GDCE_CMS_NAMESPACE not found — skip pause"
    return 0
  fi

  run_kubectl scale deploy reconciler-manager -n "$GDCE_CMS_NAMESPACE" --replicas=0 2>/dev/null || true
  run_kubectl scale deploy root-reconciler -n "$GDCE_CMS_NAMESPACE" --replicas=0 2>/dev/null || true
  for d in $(gdce_cms_list_deployments); do
    [[ -z "$d" ]] && continue
    run_kubectl scale deploy "$d" -n "$GDCE_CMS_NAMESPACE" --replicas=0 2>/dev/null || true
  done
  run_kubectl delete pods -n "$GDCE_CMS_NAMESPACE" \
    --all --force --grace-period=0 --wait=false 2>/dev/null || true
}

# Restore CMS after cleanup: replicas=0 -> scale to target; replicas=target -> rollout restart.
gdce_cms_restore_deployments() {
  local d current target
  gdce_load_cms_config
  target="$GDCE_CMS_TARGET_REPLICAS"
  gdce_connect_log "[CMS] Restoring deployments in $GDCE_CMS_NAMESPACE (target replicas=$target)"

  if gdce_is_dry_run; then
    for d in $(gdce_cms_list_deployments); do
      [[ -z "$d" ]] && continue
      current=$(gdce_cms_get_deploy_spec_replicas "$d")
      gdce_connect_log "[dry-run] [CMS] deploy/$d replicas=$current -> ensure $target + rollout restart"
    done
    return 0
  fi

  if ! run_kubectl get namespace "$GDCE_CMS_NAMESPACE" &>/dev/null; then
    gdce_connect_log "[CMS] WARN: namespace $GDCE_CMS_NAMESPACE not found — skip restore"
    return 0
  fi

  for d in $(gdce_cms_list_deployments); do
    [[ -z "$d" ]] && continue
    current=$(gdce_cms_get_deploy_spec_replicas "$d")
    if [[ "$current" -eq 0 ]]; then
      gdce_connect_log "[CMS] deploy/$d replicas=0 → scale to $target"
      run_kubectl scale deploy "$d" -n "$GDCE_CMS_NAMESPACE" --replicas="$target" 2>/dev/null || true
      run_kubectl rollout restart deploy "$d" -n "$GDCE_CMS_NAMESPACE" 2>/dev/null || true
    elif [[ "$current" -eq "$target" ]]; then
      gdce_connect_log "[CMS] deploy/$d replicas=$target → rollout restart"
      run_kubectl rollout restart deploy "$d" -n "$GDCE_CMS_NAMESPACE" 2>/dev/null || true
    else
      gdce_connect_log "[CMS] deploy/$d replicas=$current → scale to $target, rollout restart"
      run_kubectl scale deploy "$d" -n "$GDCE_CMS_NAMESPACE" --replicas="$target" 2>/dev/null || true
      run_kubectl rollout restart deploy "$d" -n "$GDCE_CMS_NAMESPACE" 2>/dev/null || true
    fi
  done
}

# Per-namespace replicas: NS_PROFILE_<id>_replicas -> group default_replicas -> fallback.
gdce_ns_profile_replicas() {
  local ns="$1" group="$2" fallback="${3:-1}" var_id gvar val
  gdce_namespace_groups_load_cache || {
    echo "$fallback"
    return 0
  }
  var_id=$(gdce_ns_var_id "$ns")
  eval "val=\"\${NS_PROFILE_${var_id}_replicas:-}\""
  if [[ -n "$val" ]]; then
    echo "$val"
    return 0
  fi
  [[ -z "$group" ]] && group=$(gdce_ns_get_group "$ns")
  if [[ -n "$group" ]]; then
    gvar=$(gdce_ns_group_var_id "$group")
    eval "val=\"\${NS_GROUP_${gvar}_default_replicas:-}\""
    if [[ -n "$val" ]]; then
      echo "$val"
      return 0
    fi
  fi
  eval "val=\"\${GDCE_NS_DEFAULT_REPLICAS:-}\""
  if [[ -n "$val" ]]; then
    echo "$val"
    return 0
  fi
  echo "$fallback"
}

# Per-namespace touch list: NS_PROFILE_<id>_touch -> group default_touch -> GDCE_NS_DEFAULT_TOUCH (pods).
gdce_ns_profile_touch() {
  local ns="$1" group="$2" fallback_replicas="${3:-1}" var_id gvar val
  gdce_namespace_groups_load_cache || {
    echo "pods"
    return 0
  }
  var_id=$(gdce_ns_var_id "$ns")
  eval "val=\"\${NS_PROFILE_${var_id}_touch:-}\""
  if [[ -n "$val" ]]; then
    echo "$val"
    return 0
  fi
  if gdce_ns_is_ngpos_pods_svc_refresh_ns "$ns"; then
    echo "pods,svc"
    return 0
  fi
  [[ -z "$group" ]] && group=$(gdce_ns_get_group "$ns")
  if [[ -n "$group" ]]; then
    gvar=$(gdce_ns_group_var_id "$group")
    eval "val=\"\${NS_GROUP_${gvar}_default_touch:-}\""
    if [[ -n "$val" ]]; then
      echo "$val"
      return 0
    fi
  fi
  eval "val=\"\${GDCE_NS_DEFAULT_TOUCH:-pods}\""
  echo "$val"
}

# True if token (deploy|sts|pods|svc|ds|job|cronjob) is in the profile touch list.
gdce_ns_touch_enabled() {
  local ns="$1" token="$2" group="$3" fallback_replicas="${4:-1}"
  local touch part
  token=$(gdce_normalize_group_name "$token")
  touch=$(gdce_ns_profile_touch "$ns" "$group" "$fallback_replicas")
  IFS=',' read -ra PARTS <<< "$touch"
  for part in ${PARTS[@]+"${PARTS[@]}"}; do
    part=$(gdce_trim "$part")
    part=$(gdce_normalize_group_name "$part")
    [[ "$part" == "$token" ]] && return 0
  done
  return 1
}

gdce_group_exists() {
  local group="$1" var_id net
  group=$(gdce_normalize_group_name "$group")
  gdce_namespace_groups_load_cache || return 1
  var_id=$(gdce_ns_group_var_id "$group")
  eval "net=\"\${NS_GROUP_${var_id}_network:-}\""
  [[ -n "$net" ]]
}

gdce_register_namespace_group() {
  local arg="$1" part
  arg=$(gdce_trim "$arg")
  [[ -z "$arg" ]] && return 1
  IFS=',' read -ra PARTS <<< "$arg"
  for part in ${PARTS[@]+"${PARTS[@]}"}; do
    part=$(gdce_normalize_group_name "$part")
    [[ -z "$part" ]] && continue
    NAMESPACE_GROUP_REQUESTS+=("$part")
  done
}

gdce_validate_namespace_groups_registered() {
  local g
  if [[ ${#NAMESPACE_GROUP_REQUESTS[@]} -eq 0 ]]; then
    return 0
  fi
  if ! gdce_namespace_groups_file &>/dev/null; then
    gdce_connect_log "ERROR: namespace_groups.sh not found. Set GDCE_NAMESPACE_GROUPS."
    return 1
  fi
  for g in ${NAMESPACE_GROUP_REQUESTS[@]+"${NAMESPACE_GROUP_REQUESTS[@]}"}; do
    if ! gdce_group_exists "$g"; then
      gdce_connect_log "ERROR: unknown namespace group '$g' (use --list-namespace-groups)"
      return 1
    fi
  done
  return 0
}

gdce_ini_print_group_block() {
  local g="$1" net="$2" ns="$3" var_id def_rep def_touch part ns_id prof_rep prof_touch
  [[ -z "$g" ]] && return 0
  var_id=$(gdce_ns_group_var_id "$g")
  eval "def_rep=\"\${NS_GROUP_${var_id}_default_replicas:-}\""
  eval "def_touch=\"\${NS_GROUP_${var_id}_default_touch:-}\""
  echo "  [$g]"
  echo "    network=$net"
  echo "    namespaces=$ns"
  [[ -n "$def_rep" ]] && echo "    default_replicas=$def_rep"
  [[ -n "$def_touch" ]] && echo "    default_touch=$def_touch"
  IFS=',' read -ra PARTS <<< "$ns"
  for part in ${PARTS[@]+"${PARTS[@]}"}; do
    part=$(gdce_trim "$part")
    [[ -z "$part" ]] && continue
    ns_id=$(gdce_ns_var_id "$part")
    eval "prof_rep=\"\${NS_PROFILE_${ns_id}_replicas:-}\""
    eval "prof_touch=\"\${NS_PROFILE_${ns_id}_touch:-}\""
    if [[ -n "$prof_rep" || -n "$prof_touch" ]]; then
      echo "    [$part]"
      [[ -n "$prof_rep" ]] && echo "      replicas=$prof_rep"
      [[ -n "$prof_touch" ]] && echo "      touch=$prof_touch"
    fi
  done
  echo ""
}

gdce_list_namespace_groups() {
  local file g net ns var_id
  file=$(gdce_namespace_groups_file) || {
    gdce_connect_log "ERROR: namespace_groups.sh not found. Set GDCE_NAMESPACE_GROUPS."
    return 1
  }
  gdce_namespace_groups_load_cache || return 1
  echo "Namespace groups: $file"
  echo ""
  for g in ${GDCE_NS_GROUP_IDS[@]+"${GDCE_NS_GROUP_IDS[@]}"}; do
    local var_id
    var_id=$(gdce_ns_group_var_id "$g")
    eval "net=\"\${NS_GROUP_${var_id}_network:-}\""
    eval "ns=\"\${NS_GROUP_${var_id}_namespaces:-}\""
    gdce_ini_print_group_block "$g" "$net" "$ns"
  done
}

_gdce_script_dir() {
  cd "$(dirname "${BASH_SOURCE[1]:-${BASH_SOURCE[0]}}")" && pwd
}

# Run kubectl or log only in dry-run mode (orchestrator workloads).
# Dry-run logs go to stderr so "$(run_kubectl ...)" capture stays empty.
run_kubectl() {
  local arg has_timeout=0

  for arg in "$@"; do
    if [[ "$arg" == --request-timeout || "$arg" == --request-timeout=* ]]; then
      has_timeout=1
      break
    fi
  done

  if gdce_is_dry_run; then
    local desc
    desc=$(gdce_format_kubectl_log_safe "$@")
    gdce_connect_log "[dry-run] $desc" >&2
    gdce_trace "kubectl (dry-run): $desc"
    return 0
  fi

  if [[ "${GDCE_RESTORE_QUIET_KUBECTL:-}" != "1" ]]; then
    gdce_log_progress "kubectl: $(gdce_format_kubectl_log_safe "$@")"
  fi
  gdce_trace "kubectl: $(gdce_format_kubectl_log_safe "$@")"

  if [[ "$has_timeout" -eq 0 ]]; then
    "${GDCE_KUBECTL_CMD}" "$@" --request-timeout="${GDCE_KUBECTL_REQUEST_TIMEOUT}"
  else
  "${GDCE_KUBECTL_CMD}" "$@"
  fi
}

# Log sleep, file writes, jq, and other non-kubectl actions in dry-run mode.
gdce_dry_run_sleep() {
  if gdce_is_dry_run; then
    gdce_connect_log "[dry-run] sleep $1" >&2
    gdce_trace "sleep $1 (dry-run)"
    return 0
  fi
  gdce_trace "sleep $1"
  sleep "$1"
}

gdce_write_file() {
  local path="$1"
  local content="$2"
  if gdce_is_dry_run; then
    gdce_connect_log "[dry-run] write file: $path"
    return 0
  fi
  echo "$content" > "$path"
}

gdce_log_jq() {
  if gdce_is_dry_run; then
    gdce_connect_log "[dry-run] jq $*"
    return 0
  fi
  return 1
}

# Orchestrator informational messages (optional dry-run prefix).
orch_log() {
  if gdce_is_dry_run; then
    gdce_connect_log "[dry-run] $*"
  else
    echo "$*"
  fi
}

# Cluster label for pre-run confirmation (orchestrators).
gdce_cluster_display_name() {
  if [[ -n "${GDCE_CLUSTER:-}" ]]; then
    echo "$GDCE_CLUSTER"
    return 0
  fi
  if [[ "${GDCE_SKIP_CONNECT:-false}" == "true" ]] || [[ "${GDCE_SKIP_CONNECT:-}" == "1" ]]; then
    local ctx
    ctx=$("${GDCE_KUBECTL_CMD}" config current-context 2>/dev/null || true)
    if [[ -n "$ctx" ]]; then
      echo "<skip-connect / current context: ${ctx}>"
    else
      echo "<skip-connect / no current context>"
    fi
    return 0
  fi
  echo "<not set>"
}

# Active kubectl context before connect (--cluster target may differ).
gdce_kubeconfig_current_context_display() {
  local ctx cluster auth

  ctx=$("${GDCE_KUBECTL_CMD}" config current-context 2>/dev/null || true)
  if [[ -z "$ctx" ]]; then
    echo "<none>"
    return 0
  fi

  cluster=$("${GDCE_KUBECTL_CMD}" config view -o jsonpath="{.contexts[?(@.name=='${ctx}')].context.cluster}" 2>/dev/null || true)
  auth=$("${GDCE_KUBECTL_CMD}" config view -o jsonpath="{.contexts[?(@.name=='${ctx}')].context.user}" 2>/dev/null || true)

  if [[ -n "$cluster" && -n "$auth" ]]; then
    echo "${ctx} (cluster=${cluster}, user=${auth})"
  else
    echo "$ctx"
  fi
}

# Ask once before orchestrator runs (set GDCE_YES=1 or --yes to skip).
gdce_confirm_orchestrator_run() {
  local script_label="$1"
  local cluster_display="$2"
  local run_type="$3"
  local command_type="$4"
  local extra_details="${5:-}"
  local answer prompt

  if [[ "${GDCE_YES:-}" == "1" ]] || [[ "${GDCE_SKIP_RUN_CONFIRM:-}" == "1" ]]; then
    gdce_connect_log "Run confirmation skipped (GDCE_YES or GDCE_SKIP_RUN_CONFIRM)"
    return 0
  fi

  local current_ctx_display
  current_ctx_display=$(gdce_kubeconfig_current_context_display)

  echo ""
  echo "========== GDCE run confirmation =========="
  echo "  Script         : $script_label"
  echo "  Target cluster : $cluster_display"
  echo "  Current context: $current_ctx_display"
  echo "  Run type       : $run_type"
  echo "  Command type   : $command_type"
  if [[ -n "$extra_details" ]]; then
    echo "$extra_details"
  fi
  echo "=========================================="

  if [[ "$run_type" == "DRY-RUN" ]]; then
    prompt="Proceed with dry-run preview? [Y/n] "
    read -r -p "$prompt" answer
    answer=$(echo "$answer" | tr '[:upper:]' '[:lower:]')
    if [[ -z "$answer" || "$answer" == "y" || "$answer" == "yes" ]]; then
      return 0
    fi
  else
    prompt="Proceed with LIVE run (destructive)? [y/N] "
    read -r -p "$prompt" answer
    answer=$(echo "$answer" | tr '[:upper:]' '[:lower:]')
    if [[ "$answer" == "y" || "$answer" == "yes" ]]; then
      return 0
    fi
  fi

  gdce_connect_log "Run cancelled by user."
  return 1
}

gdce_resolve_kubectl() {
  if command -v kubectl.exe &>/dev/null; then
    GDCE_KUBECTL_CMD="kubectl.exe"
  elif command -v kubectl &>/dev/null; then
    GDCE_KUBECTL_CMD="kubectl"
  else
    gdce_connect_log "ERROR: kubectl not found on PATH."
    return 1
  fi
}

gdce_resolve_gcloud() {
  if [[ -n "$GDCE_GCLOUD_CMD" && -x "$GDCE_GCLOUD_CMD" ]]; then
    return 0
  fi
  if command -v gcloud.cmd &>/dev/null; then
    GDCE_GCLOUD_CMD="gcloud.cmd"
  elif command -v gcloud &>/dev/null; then
    GDCE_GCLOUD_CMD="gcloud"
  else
    gdce_connect_log "ERROR: gcloud not found on PATH. Set GDCE_GCLOUD_CMD."
    return 1
  fi
}

# Build a log-safe kubectl command line (never print passwords or tokens).
gdce_format_kubectl_log_safe() {
  local parts=(kubectl) i=1 arg redact=""
  while [[ $i -le $# ]]; do
    arg="${!i}"
    case "$arg" in
      --password|--token)
        parts+=("$arg")
        redact="***"
        ;;
      --password=*|PASSWORD=*)
        parts+=("--password=***")
        ;;
      --token=*|TOKEN=*)
        parts+=("--token=***")
        ;;
      *)
        if [[ -n "$redact" ]]; then
          parts+=("$redact")
          redact=""
        else
          parts+=("$arg")
        fi
        ;;
    esac
    i=$((i + 1))
  done
  echo "${parts[*]}"
}

gdce_run_kubectl() {
  local desc
  desc=$(gdce_format_kubectl_log_safe "$@")
  if gdce_is_dry_run; then
    gdce_connect_log "[dry-run] $desc"
    return 0
  fi
  gdce_connect_log "$desc"
  "${GDCE_KUBECTL_CMD}" "$@" || {
    gdce_connect_log "ERROR: command failed: $desc"
    return 1
  }
}

gdce_run_gcloud() {
  local desc
  desc=$(gdce_redact_sensitive_log_text "gcloud $*")
  if gdce_is_dry_run; then
    gdce_connect_log "[dry-run] $desc"
    return 0
  fi
  gdce_connect_log "$desc"
  "${GDCE_GCLOUD_CMD}" "$@" || {
    gdce_connect_log "ERROR: command failed: $desc"
    return 1
  }
}

gdce_source_of_truth_path() {
  local candidates=()
  [[ -n "${GDCE_SOURCE_OF_TRUTH:-}" ]] && candidates+=("$GDCE_SOURCE_OF_TRUTH")
  candidates+=(
    "${GDCE_CONNECT_DIR}/source_of_truth.csv.tmp"
    "${GDCE_CONNECT_DIR}/source_of_truth.csv"
    "${GDCE_CONNECT_DIR}/../../gdce-acm/source_of_truth.csv"
    "/c/kroger_isc_projects/gdce-acm/source_of_truth.csv"
    "/cygdrive/c/kroger_isc_projects/gdce-acm/source_of_truth.csv"
    "$GDCE_DEFAULT_SOT"
  )
  local p
  for p in "${candidates[@]}"; do
    [[ -f "$p" ]] && echo "$p" && return 0
  done
  return 1
}

gdce_fleet_project_from_csv() {
  local cluster="$1" csv="$2"
  awk -F',' -v c="$cluster" '
    NR > 1 {
      gsub(/^[ \t\r]+|[ \t\r]+$/, "", $1)
      gsub(/^[ \t\r]+|[ \t\r]+$/, "", $4)
      if ($1 == c && $4 != "") { print $4; exit }
    }
  ' "$csv"
}

gdce_fleet_project_heuristic() {
  local cluster="$1"
  case "$cluster" in
    lo001|lo001-pci) echo "kr-9985-edgcmp-024-p" ;;
    ci921|ci921-pci|ci705|ci705-pci) echo "kr-9985-edgcmp-014-p" ;;
    ci020|ci020-pci) echo "kr-9985-edgcmp-t" ;;
    ci021|ci021-pci) echo "kr-9985-edgcmp-s" ;;
    ci022*) echo "kr-9985-edgcmp-t" ;;
    ci001|ci003|ci009|ci009-pci) echo "kr-9985-edgcmp-d" ;;
    *) return 1 ;;
  esac
}

gdce_resolve_fleet_project() {
  local cluster="$1"
  local csv project

  if [[ -n "${GDCE_FLEET_PROJECT:-}" ]]; then
    echo "$GDCE_FLEET_PROJECT"
    return 0
  fi

  csv=$(gdce_source_of_truth_path 2>/dev/null || true)
  if [[ -n "$csv" ]]; then
    project=$(gdce_fleet_project_from_csv "$cluster" "$csv")
    if [[ -n "$project" ]]; then
      echo "$project"
      return 0
    fi
  fi

  gdce_fleet_project_heuristic "$cluster"
}

gdce_load_local_overrides() {
  local dir candidates f
  dir="$(_gdce_script_dir)"
  candidates=(
    "$dir/Connect-GdceCluster.local.sh"
    "$dir/../powershell_bat/Connect-GdceCluster.local.sh"
  )
  for f in "${candidates[@]}"; do
    if [[ -f "$f" ]]; then
      gdce_connect_log "Loading local overrides: $f"
      # shellcheck source=/dev/null
      source "$f"
      return 0
    fi
  done
}

gdce_kubeconfig_username() {
  local cred="$1"
  "${GDCE_KUBECTL_CMD}" config view --raw -o "jsonpath={.users[?(@.name=='${cred}')].user.username}" 2>/dev/null
}

gdce_kubeconfig_password() {
  local cred="$1"
  "${GDCE_KUBECTL_CMD}" config view --raw -o "jsonpath={.users[?(@.name=='${cred}')].user.password}" 2>/dev/null
}

gdce_kubeconfig_current_context_user() {
  "${GDCE_KUBECTL_CMD}" config view --minify -o jsonpath='{.contexts[0].context.user}' 2>/dev/null
}

gdce_kubeconfig_has_basic_auth() {
  local cred="$1"
  local u p
  u=$(gdce_kubeconfig_username "$cred")
  p=$(gdce_kubeconfig_password "$cred")
  [[ -n "$u" && -n "$p" ]]
}

gdce_kubeconfig_is_connectgateway_user() {
  [[ "$1" == connectgateway_* ]]
}

# True when kubeconfig context name matches a fleet cluster (e.g. connectgateway_*_global_ci009h).
gdce_context_name_targets_cluster() {
  local ctx="$1" cluster="$2"
  [[ -n "$ctx" && -n "$cluster" ]] || return 1
  [[ "$ctx" == "$cluster" ]] && return 0
  [[ "$ctx" == *"_global_${cluster}" ]] && return 0
  return 1
}

# Skip credential/gcloud refresh when already on a working connectgateway context for this cluster.
gdce_already_connected_to_cluster() {
  local cluster="$1" ctx ctx_user

  gdce_is_dry_run && return 1
  [[ "${GDCE_FORCE_CONNECT:-}" == "1" ]] && return 1

  ctx=$("${GDCE_KUBECTL_CMD}" config current-context 2>/dev/null || true)
  [[ -z "$ctx" ]] && return 1
  gdce_context_name_targets_cluster "$ctx" "$cluster" || return 1

  ctx_user=$(gdce_kubeconfig_current_context_user)
  if gdce_kubeconfig_is_connectgateway_user "$ctx_user"; then
    "${GDCE_KUBECTL_CMD}" get nodes --request-timeout=20s &>/dev/null && return 0
  fi
  if [[ "$ctx" == "$cluster" ]]; then
    "${GDCE_KUBECTL_CMD}" get nodes --request-timeout=20s &>/dev/null && return 0
  fi
  return 1
}

# List kubeconfig user names (space-separated, Bash 3.2 safe)
gdce_kubeconfig_user_names() {
  "${GDCE_KUBECTL_CMD}" config view -o jsonpath='{range .users[*]}{.name}{" "}{end}' 2>/dev/null
}

# Candidate: KUBECTL_CREDENTIALS_NAME > context user (basic auth, not connectgateway) >
#            GDCE_DEFAULT (if basic auth) > first basic-auth user > GDCE_DEFAULT name
gdce_resolve_credentials_candidate() {
  local ctx_user u

  if [[ -n "${KUBECTL_CREDENTIALS_NAME:-}" ]]; then
    echo "$KUBECTL_CREDENTIALS_NAME"
    return 0
  fi

  ctx_user=$(gdce_kubeconfig_current_context_user)
  if [[ -n "$ctx_user" ]] && ! gdce_kubeconfig_is_connectgateway_user "$ctx_user" \
      && gdce_kubeconfig_has_basic_auth "$ctx_user"; then
    echo "$ctx_user"
    return 0
  fi

  if gdce_kubeconfig_has_basic_auth "$GDCE_DEFAULT_CREDENTIALS_NAME"; then
    echo "$GDCE_DEFAULT_CREDENTIALS_NAME"
    return 0
  fi

  for u in $(gdce_kubeconfig_user_names); do
    [[ -z "$u" ]] && continue
    gdce_kubeconfig_is_connectgateway_user "$u" && continue
    if gdce_kubeconfig_has_basic_auth "$u"; then
      echo "$u"
      return 0
    fi
  done

  echo "$GDCE_DEFAULT_CREDENTIALS_NAME"
}

gdce_confirm_credentials_name() {
  local candidate="$1" answer

  if [[ -n "${KUBECTL_CREDENTIALS_NAME:-}" ]]; then
    echo "$candidate"
    return 0
  fi

  if gdce_is_dry_run; then
    echo "$candidate"
    return 0
  fi

  read -r -p "Use kubectl credentials user '$candidate'? [Y/n] " answer
  answer=$(echo "$answer" | tr '[:upper:]' '[:lower:]')
  if [[ -z "$answer" || "$answer" == "y" || "$answer" == "yes" ]]; then
    echo "$candidate"
    return 0
  fi

  read -r -p "Enter kubectl credentials user name: " answer
  if [[ -z "$answer" ]]; then
    gdce_connect_log "ERROR: credentials user name is required."
    return 1
  fi
  echo "$answer"
}

gdce_resolve_confirmed_credentials_name() {
  local candidate
  candidate=$(gdce_resolve_credentials_candidate)
  gdce_confirm_credentials_name "$candidate"
}

gdce_should_set_credentials() {
  local has_stored=$1 prompt answer
  if [[ "$has_stored" == "true" ]]; then
    prompt="Run kubectl config set-credentials again? [y/N]"
  else
    prompt="kubectl credentials not found. Run kubectl config set-credentials now? [Y/n]"
  fi
  if gdce_is_dry_run; then
    gdce_connect_log "[dry-run] prompt: $prompt → no"
    return 1
  fi
  read -r -p "$prompt " answer
  answer=$(echo "$answer" | tr '[:upper:]' '[:lower:]')
  if [[ -z "$answer" ]]; then
    [[ "$has_stored" != "true" ]]
    return
  fi
  [[ "$answer" == "y" || "$answer" == "yes" ]]
}

gdce_ensure_k8s_credentials() {
  local cred_name="${1:-$GDCE_DEFAULT_CREDENTIALS_NAME}"
  local stored_user stored_pass user pass default_user default_pass

  stored_user=$(gdce_kubeconfig_username "$cred_name")
  stored_pass=$(gdce_kubeconfig_password "$cred_name")

  if gdce_is_dry_run; then
    if [[ -n "$stored_user" && -n "$stored_pass" ]]; then
      gdce_connect_log "[dry-run] Using stored credentials: $cred_name (user=$stored_user)"
    else
      gdce_connect_log "[dry-run] kubectl config set-credentials $cred_name --username=<user> --password=***"
    fi
    return 0
  fi

  if [[ -n "$stored_user" && -n "$stored_pass" ]] && ! gdce_should_set_credentials "true"; then
    gdce_connect_log "Using stored credentials: $cred_name (user=$stored_user)"
    return 0
  fi

  if [[ -z "$stored_user" || -z "$stored_pass" ]] && ! gdce_should_set_credentials "false"; then
    gdce_connect_log "ERROR: kubectl credentials '$cred_name' not configured."
    return 1
  fi

  default_user="${K8S_USERNAME:-${stored_user:-${USER:-}}}"
  default_pass="${K8S_PASSWORD:-${PASSWORD:-$stored_pass}}"

  if [[ -n "$default_user" ]]; then
    read -r -p "Kubernetes username (Enter to keep '$default_user'): " user
    user="${user:-$default_user}"
  else
    read -r -p "Kubernetes username (e.g. Kroger EUID): " user
  fi

  if [[ -n "$default_pass" ]]; then
    gdce_read_secret "Kubernetes password (Enter to keep current): " pass "$default_pass"
  else
    gdce_read_secret "Kubernetes password: " pass
  fi

  if [[ -z "$user" || -z "$pass" ]]; then
    gdce_connect_log "ERROR: username and password required (K8S_USERNAME/K8S_PASSWORD or prompt)."
    return 1
  fi

  gdce_run_kubectl config set-credentials "$cred_name" --username="$user" --password="$pass"
  pass=""
  default_pass=""
}

gdce_ensure_gcloud_auth() {
  local token
  if gdce_is_dry_run; then
    gdce_connect_log "[dry-run] gcloud auth print-access-token"
    return 0
  fi
  token=$("${GDCE_GCLOUD_CMD}" auth print-access-token 2>/dev/null || true)
  if [[ -n "$token" ]]; then
    return 0
  fi
  gdce_connect_log "gcloud auth login required"
  gdce_run_gcloud auth login || return 1
  token=$("${GDCE_GCLOUD_CMD}" auth print-access-token 2>/dev/null || true)
  if [[ -z "$token" ]]; then
    gdce_connect_log "ERROR: no gcloud access token after login."
    return 1
  fi
}

gdce_list_clusters() {
  local csv
  gdce_connect_init || return 1
  if gdce_is_dry_run; then
    gdce_connect_log "[dry-run] awk read source_of_truth.csv (read-only preview)"
  fi
  csv=$(gdce_source_of_truth_path) || {
    gdce_connect_log "ERROR: source_of_truth.csv not found. Set GDCE_SOURCE_OF_TRUTH."
    return 1
  }
  gdce_connect_log "Clusters in: $csv"
  awk -F',' 'NR > 1 && $1 != "" {
    gsub(/^[ \t\r]+|[ \t\r]+$/, "", $1)
    gsub(/^[ \t\r]+|[ \t\r]+$/, "", $4)
    printf "  %s -> %s\n", $1, $4
  }' "$csv" | sort
}

gdce_connect_cluster() {
  local cluster="$1"
  local fleet_project cred_name ctx

  [[ -z "$cluster" ]] && {
    gdce_connect_log "ERROR: cluster name is required."
    return 1
  }

  if gdce_already_connected_to_cluster "$cluster"; then
    ctx=$("${GDCE_KUBECTL_CMD}" config current-context 2>/dev/null || true)
    fleet_project=$(gdce_resolve_fleet_project "$cluster" 2>/dev/null || true)
    gdce_connect_log "==== GDCE cluster connect (already connected) ===="
    gdce_connect_log "  Cluster       : $cluster"
    [[ -n "$fleet_project" ]] && gdce_connect_log "  Fleet project : $fleet_project"
    gdce_connect_log "  Context       : $ctx"
    gdce_connect_log "kubectl connection OK (skipped credential prompts; use GDCE_FORCE_CONNECT=1 to refresh)"
    gdce_connect_log "Done. Active context: $ctx"
    return 0
  fi

  cred_name=$(gdce_resolve_confirmed_credentials_name) || return 1
  if gdce_is_dry_run; then
    gdce_connect_log "[dry-run] prompt: Use kubectl credentials user '$cred_name'? [Y/n] → yes"
  fi

  fleet_project=$(gdce_resolve_fleet_project "$cluster" 2>/dev/null || true)
  if [[ -z "$fleet_project" ]]; then
    if gdce_is_dry_run; then
      fleet_project="<prompt-fleet-project>"
    else
      read -r -p "Fleet GCP project ID for cluster '$cluster': " fleet_project
    fi
  fi
  [[ -z "$fleet_project" ]] && {
    gdce_connect_log "ERROR: fleet project could not be resolved."
    return 1
  }

  gdce_connect_log "==== GDCE cluster connect ===="
  gdce_connect_log "  Cluster       : $cluster"
  gdce_connect_log "  Fleet project : $fleet_project"
  gdce_connect_log "  Credentials   : $cred_name"

  gdce_ensure_k8s_credentials "$cred_name" || return 1

  gdce_run_kubectl config set-context "$cluster" --cluster="$cluster" --user="$cred_name" || return 1
  gdce_run_kubectl config use-context "$cluster" || return 1

  gdce_ensure_gcloud_auth || return 1
  gdce_run_gcloud config set project "$fleet_project" || return 1
  gdce_connect_log "Note: gcloud 'quota project' WARNING is usually harmless for kubectl; fix: gcloud auth application-default set-quota-project $fleet_project"
  gdce_run_gcloud container fleet memberships get-credentials "$cluster" || return 1

  if [[ "${GDCE_SKIP_NODE_CHECK:-}" != "1" ]]; then
    gdce_run_kubectl get nodes || return 1
  fi

  if ! gdce_is_dry_run; then
    gdce_connect_log "Done. Active context: $("${GDCE_KUBECTL_CMD}" config current-context 2>/dev/null)"
  fi
}

gdce_verify_kubectl_connection() {
  local ctx

  if gdce_is_dry_run; then
    gdce_connect_log "[dry-run] kubectl config current-context"
    gdce_connect_log "[dry-run] kubectl get nodes --request-timeout=20s"
    return 0
  fi

  ctx=$("${GDCE_KUBECTL_CMD}" config current-context 2>/dev/null || true)
  if [[ -z "$ctx" ]]; then
    gdce_connect_log "ERROR: no kubectl current-context."
    return 1
  fi
  gdce_connect_log "Active context: $ctx"
  "${GDCE_KUBECTL_CMD}" get nodes --request-timeout=20s &>/dev/null || {
    gdce_connect_log "ERROR: kubectl get nodes failed. Check VPN, auth, and RBAC."
    return 1
  }
  gdce_connect_log "kubectl connection OK"
}

gdce_connect_if_needed() {
  gdce_connect_init || return 1

  if gdce_is_dry_run; then
    gdce_connect_log "=== DRY RUN MODE (no cluster changes) ==="
  fi

  if [[ "${GDCE_SKIP_CONNECT:-false}" == "true" ]] || [[ "${GDCE_SKIP_CONNECT:-}" == "1" ]]; then
    gdce_connect_log "Skipping connect (--skip-connect)"
    gdce_verify_kubectl_connection
    return $?
  fi

  if [[ -z "${GDCE_CLUSTER:-}" ]]; then
    gdce_connect_log "ERROR: --cluster <name> is required unless --skip-connect is set."
    return 1
  fi

  gdce_connect_cluster "$GDCE_CLUSTER"
}

gdce_connect_init() {
  gdce_sync_orchestrator_env
  gdce_load_local_overrides
  gdce_resolve_kubectl || return 1
  gdce_resolve_gcloud || return 1
  if gdce_verbose_enabled; then
    gdce_connect_log "Verbose tracing on (--verbose or GDCE_VERBOSE=1)"
  fi
}

# --- Standalone CLI ---
gdce_connect_main() {
  local cluster="" list_only=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --cluster)
        shift
        cluster="${1:?--cluster requires a value}"
        ;;
      --list-clusters) list_only=true ;;
      --dry-run) DRY_RUN=true ;;
      --skip-node-check) GDCE_SKIP_NODE_CHECK=1 ;;
      --help|-h)
        cat << EOF
GDCE cluster connect — kubectl context + gcloud fleet credentials

USAGE:
  $0 --cluster <name>              Connect kubectl to a GDCE fleet cluster
  $0 <name>                        Same as --cluster <name>
  $0 --list-clusters               List clusters from source_of_truth.csv
  $0 --dry-run --cluster <name>    Print commands only; no kubeconfig/gcloud changes
  $0 --skip-node-check             Skip kubectl get nodes after connect
  $0 --help                        Show this message

EXAMPLES:
  $0 --list-clusters
  $0 --dry-run --cluster ci001
  $0 --cluster ci001
  $0 --cluster ci003 --skip-node-check
  $0 ci001
  GDCE_SOURCE_OF_TRUTH=$GDCE_CONNECT_DIR/source_of_truth.csv $0 --list-clusters
  GDCE_FLEET_PROJECT=kr-9985-edgcmp-d $0 --cluster lo001
  K8S_USERNAME=myeuid K8S_PASSWORD='***' $0 --cluster ci001

ORCHESTRATOR INTEGRATION (sourced, not executed):
  source "\$(dirname "\$0")/gdce_connect.sh"
  GDCE_CLUSTER=ci001 gdce_connect_if_needed
  GDCE_SKIP_CONNECT=1 gdce_connect_if_needed

ENVIRONMENT:
  GDCE_SOURCE_OF_TRUTH     Override CSV path (default: $GDCE_CONNECT_DIR/source_of_truth.csv)
  GDCE_NAMESPACE_GROUPS  Override groups file (default: $GDCE_CONNECT_DIR/namespace_groups.sh)
  GDCE_FLEET_PROJECT       Override fleet GCP project for --cluster
  K8S_USERNAME, K8S_PASSWORD
  KUBECTL_CREDENTIALS_NAME If set, use without prompt; else basic-auth user (not connectgateway_*)
  GDCE_GCLOUD_CMD          Path to gcloud if not on PATH
  GDCE_SKIP_NODE_CHECK=1   Skip kubectl get nodes after connect
  DRY_RUN=true             Same as --dry-run
EOF
        exit 0
        ;;
      *)
        [[ -z "$cluster" ]] && cluster="$1" || {
          gdce_connect_log "Unknown argument: $1"
          exit 1
        }
        ;;
    esac
    shift
  done

  gdce_connect_init || exit 1

  if [[ "$list_only" == "true" ]]; then
    gdce_list_clusters
    exit $?
  fi

  if [[ -z "$cluster" ]]; then
    read -r -p "Cluster name (e.g. lo001, ci001): " cluster
  fi

  GDCE_CLUSTER="$cluster"
  gdce_connect_cluster "$cluster"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  set -euo pipefail
  gdce_connect_main "$@"
fi
