variable "project_id" {
  type = string
}

variable "zone" {
  type    = string
  default = "us-central1-a"
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "gce_network" {
  type    = string
  default = "gem-clusters-vpc"
}

variable "gce_subnetwork" {
  type    = string
  default = "gem-clusters-subnet"
}
