output "network_name" {
  value = google_compute_network.gdc_vpc.name
}

output "project_number" {
  value = data.google_project.project.number
}

output "subnetwork_name" {
  value = google_compute_subnetwork.gdc_subnet.name
}

output "anthos_sa_email" {
  value = google_service_account.baremetal_gcr.email
}