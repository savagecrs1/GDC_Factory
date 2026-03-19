output "workstation_ip" {
  value = google_compute_instance.admin_ws.network_interface[0].network_ip
}

output "workstation_name" {
  value = google_compute_instance.admin_ws.name
}

output "network_name" {
  value = google_compute_network.gdc_vpc.name
}

output "subnetwork_name" {
  value = google_compute_subnetwork.gdc_subnet.name
}

output "anthos_sa_email" {
  value = google_service_account.baremetal_gcr.email
}