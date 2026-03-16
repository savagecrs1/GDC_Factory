terraform {
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

  # Use service account impersonation if the variable is provided.
  # Otherwise, standard auth is used.
  impersonate_service_account = var.provisioning_sa_email != "" ? var.provisioning_sa_email : null
}
