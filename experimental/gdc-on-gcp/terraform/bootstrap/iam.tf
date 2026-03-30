# Dedicated Service Account for Anthos Bare Metal
resource "google_service_account" "baremetal_gcr" {
  account_id   = "baremetal-gcr"
  display_name = "Service Account for Anthos Bare Metal"
  project      = var.project_id
}

resource "google_project_iam_member" "baremetal_gcr_roles" {
  for_each = toset([
    "roles/gkehub.connect",
    "roles/gkehub.admin",
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/monitoring.dashboardEditor",
    "roles/stackdriver.resourceMetadata.writer",
    "roles/opsconfigmonitoring.resourceMetadata.writer",
    "roles/kubernetesmetadata.publisher",
    "roles/compute.viewer",
    "roles/serviceusage.serviceUsageViewer"
  ])
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.baremetal_gcr.email}"
}

# Dedicated Service Account for Cluster Administration (via GKE Connect Gateway)
resource "google_service_account" "gong_cluster_admin" {
  account_id   = "gong-cluster-admin"
  display_name = "GONG Cluster Admin"
  project      = var.project_id
}

resource "google_project_iam_member" "gong_cluster_admin_roles" {
  for_each = toset([
    "roles/gkehub.gatewayAdmin",
    "roles/gkehub.admin"
  ])
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.gong_cluster_admin.email}"
}