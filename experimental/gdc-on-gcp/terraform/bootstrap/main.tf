terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.26.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

# Essential APIs
resource "google_project_service" "apis" {
  for_each = toset([
    "anthos.googleapis.com",
    "anthosaudit.googleapis.com",
    "anthosgke.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "compute.googleapis.com",
    "connectgateway.googleapis.com",
    "container.googleapis.com",
    "gkeconnect.googleapis.com",
    "gkehub.googleapis.com",
    "gkeonprem.googleapis.com",
    "iam.googleapis.com",
    "iap.googleapis.com",
    "kubernetesmetadata.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "networkmanagement.googleapis.com",
    "opsconfigmonitoring.googleapis.com",
    "serviceusage.googleapis.com",
    "stackdriver.googleapis.com"
  ])
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}
