variable "project_id" {
  type        = string
  description = "The GCP project ID to deploy resources into"
}

variable "region" {
  type        = string
  description = "The GCP region to deploy resources into"
  default     = "us-central1"
}

variable "zone" {
  type        = string
  description = "The GCP zone to deploy resources into"
  default     = "us-central1-a"
}

variable "provisioning_sa_email" {
  type        = string
  description = "The service account email to impersonate for Terraform provisioning"
  default     = ""
}

variable "cluster_name" {
  type        = string
  description = "The name of the GDC hybrid cluster"
  default     = "abm-cluster-1"
}

variable "bmctl_version" {
  type        = string
  description = "The version of Anthos Bare Metal (bmctl) to install"
  default     = "1.28.1400-gke.79" # Valid version from GS bucket
}

variable "machine_type" {
  type        = string
  description = "The machine type for GCE VMs"
  default     = "n1-standard-8"
}

variable "gce_network" {
  type        = string
  description = "The name of the VPC network to create for GCE VMs"
  default     = "gdc-so-vpc"
}

variable "gce_subnetwork" {
  type        = string
  description = "The name of the subnetwork to create for GCE VMs"
  default     = "gdc-so-subnet"
}

variable "gce_subnetwork_cidr" {
  type        = string
  description = "The CIDR range for the subnetwork"
  default     = "10.10.0.0/24"
}
