# Enable Required APIs
locals {
  gcp_services = [
    "anthos.googleapis.com",
    "anthosaudit.googleapis.com",
    "anthosgke.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "connectgateway.googleapis.com",
    "container.googleapis.com",
    "gkeconnect.googleapis.com",
    "gkehub.googleapis.com",
    "serviceusage.googleapis.com",
    "stackdriver.googleapis.com",
    "monitoring.googleapis.com",
    "logging.googleapis.com",
    "opsconfigmonitoring.googleapis.com",
    "compute.googleapis.com",
    "gkeonprem.googleapis.com",
    "iam.googleapis.com",
    "kubernetesmetadata.googleapis.com",
    "iap.googleapis.com",
    "networkmanagement.googleapis.com"

  ]
}

resource "google_project_service" "apis" {
  for_each           = toset(local.gcp_services)
  project            = var.project_id
  service            = each.key
  disable_on_destroy = false
}

# Create Service Account for Anthos Bare Metal
resource "google_service_account" "baremetal_gcr" {
  account_id   = "baremetal-gcr"
  display_name = "Service Account for Anthos Bare Metal"
  project      = var.project_id
  depends_on   = [google_project_service.apis]
}

# Add IAM Roles to the Service Account
locals {
  baremetal_sa_roles = [
    "roles/gkehub.connect",
    "roles/gkehub.admin",
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/monitoring.dashboardEditor",
    "roles/stackdriver.resourceMetadata.writer",
    "roles/opsconfigmonitoring.resourceMetadata.writer",
    "roles/kubernetesmetadata.publisher",
    "roles/monitoring.viewer",
    "roles/serviceusage.serviceUsageViewer",
    "roles/compute.viewer"
  ]
}

resource "google_project_iam_member" "baremetal_gcr_roles" {
  for_each = toset(local.baremetal_sa_roles)
  project  = var.project_id
  role     = each.key
  member   = "serviceAccount:${google_service_account.baremetal_gcr.email}"
}
