data "google_compute_image" "ubuntu" {
  family  = "ubuntu-2204-lts"
  project = "ubuntu-os-cloud"
}

resource "google_compute_instance" "admin_ws" {
  name         = "gong-ws"
  machine_type = "e2-standard-4"
  zone         = var.zone
  project      = var.project_id

  can_ip_forward      = true
  deletion_protection = true

  # Applies default GCP firewall rules to allow inbound traffic on ports 80 and 443
  tags = ["http-server", "https-server"]

  boot_disk {
    initialize_params {
      image = data.google_compute_image.ubuntu.self_link
      size  = 50
      type  = "pd-balanced"
    }
  }

  network_interface {
    network    = google_compute_network.gdc_vpc.self_link
    subnetwork = google_compute_subnetwork.gdc_subnet.self_link
  }

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  metadata = {
    enable-oslogin = "FALSE"
  }

  service_account {
    scopes = ["cloud-platform"]
  }

  depends_on = [google_project_service.apis]
}
