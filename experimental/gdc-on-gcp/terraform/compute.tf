locals {
  vms = {
    gong1 = "${var.cluster_name}-gong1"
    gong2 = "${var.cluster_name}-gong2"
    gong3 = "${var.cluster_name}-gong3"
  }
}

data "google_compute_image" "ubuntu" {
  family  = "ubuntu-2204-lts"
  project = "ubuntu-os-cloud"
}

resource "google_compute_instance" "gdc_vms" {
  for_each     = local.vms
  name         = each.value
  machine_type = var.machine_type
  zone         = var.zone
  project      = var.project_id

  # Nested virtualization requires Intel Haswell or newer
  min_cpu_platform = "Intel Haswell"

  tags = ["http-server", "https-server"]

  boot_disk {
    initialize_params {
      image = data.google_compute_image.ubuntu.self_link
      size  = 200
      type  = "pd-ssd"
    }
  }

  network_interface {
    network    = data.google_compute_network.gdc_vpc.self_link
    subnetwork = data.google_compute_subnetwork.gdc_subnet.self_link
  }

  can_ip_forward = true

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  advanced_machine_features {
    enable_nested_virtualization = true
  }

  metadata = {
    cluster_id     = var.cluster_name
    bmctl_version  = var.bmctl_version
    enable-oslogin = "FALSE"
  }

  service_account {
    scopes = ["cloud-platform"]
  }
}