terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
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
    "compute.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "serviceusage.googleapis.com",
    "anthos.googleapis.com",
    "anthosgke.googleapis.com",
    "gkehub.googleapis.com",
    "gkeconnect.googleapis.com",
    "connectgateway.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "opsconfigmonitoring.googleapis.com",
    "stackdriver.googleapis.com",
    "iam.googleapis.com",
    "iap.googleapis.com",
    "anthosaudit.googleapis.com",
    "kubernetesmetadata.googleapis.com",
    "container.googleapis.com",
    "networkmanagement.googleapis.com",
    "gkeonprem.googleapis.com"
  ])
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}