variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "zone" {
  type    = string
  default = "us-central1-a"
}

variable "provisioning_sa_email" {
  type    = string
  default = ""
}

variable "cluster_name" {
  type    = string
  default = "abm-cluster-1"
}

variable "bmctl_version" {
  type    = string
  default = "1.28.1400-gke.79"
}

variable "machine_type" {
  type    = string
  default = "n1-standard-8"
}

variable "gce_network" {
  type    = string
  default = "gdc-so-vpc"
}

variable "gce_subnetwork" {
  type    = string
  default = "gdc-so-subnet"
}

variable "gdc_user" {
  type    = string
  default = "gdc"
}

variable "ssh_public_key" {
  type        = string
  description = "The public SSH key to add to the gdc user's authorized_keys."
  default     = ""
}