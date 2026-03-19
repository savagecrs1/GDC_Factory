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

variable "gce_network" {
  type    = string
  default = "gdc-so-vpc"
}

variable "gce_subnetwork" {
  type    = string
  default = "gdc-so-subnet"
}

variable "gce_subnetwork_cidr" {
  type    = string
  default = "10.10.0.0/24"
}