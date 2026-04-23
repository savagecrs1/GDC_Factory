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
  default = "1.33.300-gke.60"
}

variable "machine_type" {
  type = string
  # 32 vCPU, 128GB RAM
  default = "n2-standard-32"

}

variable "gce_network" {
  type    = string
  default = "gem-clusters-vpc"
}

variable "gce_subnetwork" {
  type    = string
  default = "gem-clusters-subnet"
}

variable "gem_user" {
  type    = string
  default = "gdc"
}

variable "ssh_public_key" {
  type        = string
  description = "The public SSH key to add to the gdc user's authorized_keys."
  default     = ""
}
