# GDCE hybrid cluster migration — namespace groups (sourced by gdce_connect.sh)
# Edit this file to change targets. List: ./gdce_k8_cleanup_orchestrator.sh --list-namespace-groups
# Override path: GDCE_NAMESPACE_GROUPS=/path/to/namespace_groups.sh
#
# Recovery orchestrator profiles (Option A):
#   Global defaults (all namespaces unless overridden):
#     GDCE_NS_DEFAULT_REPLICAS=1   GDCE_NS_DEFAULT_TOUCH=pods
#   NS_GROUP_<group>_default_replicas / default_touch  — group fallback
#   NS_PROFILE_<namespace_id>_replicas / _touch         — per-namespace override
#   namespace_id = namespace with hyphens -> underscores (ngpos-fuel-pci-l0 -> ngpos_fuel_pci_l0)
#   touch tokens: deploy, sts, pods, svc, ds, job, cronjob (comma-separated)
#   CLI --replicas overrides all profile replica counts when passed explicitly.
#   GDCE_NS_CLUSTER_WIDE_EXCLUDE — namespaces skipped in --cluster-wide mode

GDCE_NS_DEFAULT_REPLICAS="1"
GDCE_NS_DEFAULT_TOUCH="pods"
GDCE_NS_CLUSTER_WIDE_EXCLUDE="kube-system,anthos-creds,anthos-identity-service,capi-kubeadm-bootstrap-system,capi-system,cert-manager,cert-manager-cluster-resources,cluster-ci009h,config-management-monitoring,controller-vm,dns-system,g-istio-system,gdce-jumphost,gke-connect,gke-managed-metrics-server,gke-operators,gpc-backup-system,gpu-system,isc-gatekeeper,local-image-registry,nf-operator,observability,oclcm-system,reflector,reloader,resource-group-system,robin-admin,robinio,saas-system,t001-u000001,t001-u000002,t001-u000003,t001-u000004,t001-u000005,vm-system,vm-tools,logging"

# Anthos Config Management (config-management-system)
# gdce_k8_cleanup_orchestrator.sh — live cleanup: scale CMS to 0, block until fully paused (0 pods),
#   then namespace drain + watcher until script exits; restore to GDCE_CMS_TARGET_REPLICAS (unless --no-cms-restore).
#   CLEANUP_CMS_PAUSE_WAIT_TIMEOUT (default 180s) on cleanup orchestrator.
# gdce_k8_recovery_orchestrator.sh — cms_ensure_deployments_active:
#   spec.replicas=0  -> scale to GDCE_CMS_TARGET_REPLICAS
#   spec.replicas=GDCE_CMS_TARGET_REPLICAS -> kubectl rollout restart
GDCE_CMS_NAMESPACE="config-management-system"
GDCE_CMS_TARGET_REPLICAS="1"

# Ngpos/app namespaces: restart pods + delete services only (no deploy/sts/ds/job/cronjob).
# Used by --restart-pods-delete-svc and --namespace-group ngpos-apps. Missing NS are skipped and reported.
GDCE_NGPOS_RESTART_PODS_DELETE_SVC_NS="ngpos-lab,ngpos-payments-pci,ngpos-shared-pci,prom-monitoring-pci,kong-system-pci,ngpos-fuel-pci-l1,ngpos-apex,ngpos-dev,ngpos-isa,ngpos-mx,ngpos-mxc,ngpos-payments,ngpos-platform,ngpos-shared,ngpos-tax,prom-monitoring,local-image-registry,edsmongodb,kong-system,ngpos-fuel,mx-offers,ngpos-fuel-pci-l0,filebeat,prom-monitoring-fuel,kong-system-fuel"

# Data-plane operator namespaces: cleanup orchestrator backs up then suspends CRs before scale-down:
#   Backup: patch_rabbitmq_cr / patch_elastic_cr / patch_mongo_cr entries in replica-backup-{group}.json
#   Suspend: RabbitmqCluster spec.replicas=0 | Elasticsearch nodeSets[].count=0 | MongoDBCommunity spec.members=0
# Recovery: gdce_k8_recovery_sequence.sh step 5 / --restore-data-plane-crs (before data-plane health)
GDCE_DATA_PLANE_OPERATOR_NS="rabbitmq-system,elastic-system,mongodb"

# Per-namespace-group workload backup files (pci, non-pci, fuel, net-* for --network).
# gdce_k8_cleanup_orchestrator.sh writes one file per group; recovery step 9 restores all that exist.
GDCE_REPLICA_BACKUP_FILE_PATTERN="replica-backup-{group}.json"
# Legacy single-file backup (restore fallback only if no per-group files exist):
GDCE_REPLICA_BACKUP_FILE="replica-backup.json"

# Final health report (recovery orchestrator health step 11 / --final-health-report)
# Fast path: one kubectl get pods -A (GDCE_HEALTH_REPORT_KUBECTL_TIMEOUT, default 90s).
# Groups-only: --final-health-report-groups-only or GDCE_HEALTH_REPORT_GROUPS_ONLY=1
GDCE_HEALTH_REPORT_FILE="HealthReport.txt"

GDCE_NS_GROUP_IDS=(pci non-pci fuel ngpos-apps)

NS_GROUP_pci_network="pci-network-3430"
NS_GROUP_pci_namespaces="rabbitmq-system,elastic-system,mongodb,ngpos-lab,ngpos-payments-pci,ngpos-shared-pci,prom-monitoring-pci,kong-system-pci,ngpos-fuel-pci-l1"

NS_GROUP_non_pci_network="non-pci-network-3130"
NS_GROUP_non_pci_namespaces="ngpos-apex,ngpos-dev,ngpos-isa,ngpos-mx,ngpos-mxc,ngpos-payments,ngpos-platform,ngpos-shared,ngpos-tax,prom-monitoring,local-image-registry,edsmongodb,kong-system,ngpos-fuel,mx-offers"

NS_GROUP_fuel_network="fuel-network-3421"
NS_GROUP_fuel_namespaces="ngpos-fuel-pci-l0,filebeat,prom-monitoring-fuel,kong-system-fuel"

NS_GROUP_ngpos_apps_network="ngpos-applications"
NS_GROUP_ngpos_apps_namespaces="${GDCE_NGPOS_RESTART_PODS_DELETE_SVC_NS}"
NS_GROUP_ngpos_apps_default_touch="pods,svc"

# Per-namespace overrides (omit to use global defaults: replicas=1, touch=pods)

# Data plane: health step scales deployments and rollout-restarts when pods are unhealthy
NS_PROFILE_rabbitmq_system_touch="deploy,pods"
NS_PROFILE_elastic_system_touch="deploy,pods"
NS_PROFILE_mongodb_touch="deploy,pods"

# Kong in ngpos-apps list: drain uses pods,svc only; health steps scale deploy via health_* helpers
NS_PROFILE_kong_system_replicas="1"
NS_PROFILE_kong_system_touch="pods,svc"
NS_PROFILE_kong_system_default_replicas="1"
NS_PROFILE_kong_system_default_touch="deploy,pods"
NS_PROFILE_kong_system_pci_replicas="1"
NS_PROFILE_kong_system_pci_touch="pods,svc"
NS_PROFILE_kong_system_fuel_replicas="1"
NS_PROFILE_kong_system_fuel_touch="pods,svc"

# Platform: kroger-issuer deployments at 1 replica (scale deploy, rollout restart in health step 1)
NS_PROFILE_kroger_issuer_replicas="1"
NS_PROFILE_kroger_issuer_touch="deploy,pods"

# Platform: namespace-labeler deployments run at 2 replicas (scale deploy, clean unhealthy pods)
NS_PROFILE_namespace_labeler_replicas="2"
NS_PROFILE_namespace_labeler_touch="deploy,pods"
