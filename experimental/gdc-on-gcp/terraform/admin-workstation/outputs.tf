output "workstation_ip" {
  value = google_compute_instance.admin_ws.network_interface[0].network_ip
}

output "workstation_name" {
  value = google_compute_instance.admin_ws.name
}

output "project_id" {
  value = var.project_id
}

output "zone" {
  value = var.zone
}