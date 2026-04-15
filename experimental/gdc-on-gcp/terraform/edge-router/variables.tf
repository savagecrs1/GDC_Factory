variable "project_id" {
  type        = string
  description = "The GCP project ID"
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "zone" {
  type    = string
  default = "us-central1-a"
}

variable "machine_type" {
  type    = string
  default = "e2-small"
}

variable "edge_router_name" {
  type    = string
  default = "gem-edge-router"
}
