# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

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
  # 8 vCPU, 32GB RAM - Compact Standard (Supports Nested Virtualization)
  default = "n2-standard-8"

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
