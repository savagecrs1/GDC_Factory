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

# Read the shared Foundation networking
data "google_compute_network" "gdc_vpc" {
  name    = var.gce_network
  project = var.project_id
}

data "google_compute_subnetwork" "gdc_subnet" {
  name    = var.gce_subnetwork
  region  = var.region
  project = var.project_id
}

# Read the shared Admin Workstation
data "google_compute_instance" "gem_admin_ws" {
  name    = "gem-admin-ws"
  zone    = var.zone
  project = var.project_id
}
