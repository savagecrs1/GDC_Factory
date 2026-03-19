output "cluster_nodes_ips" {
  value = {
    gong1 = google_compute_instance.gdc_vms["gong1"].network_interface[0].network_ip
    gong2 = google_compute_instance.gdc_vms["gong2"].network_interface[0].network_ip
    gong3 = google_compute_instance.gdc_vms["gong3"].network_interface[0].network_ip
  }
}

output "cluster_nodes_names" {
  value = {
    gong1 = google_compute_instance.gdc_vms["gong1"].name
    gong2 = google_compute_instance.gdc_vms["gong2"].name
    gong3 = google_compute_instance.gdc_vms["gong3"].name
  }
}

output "workstation_name" {
  value = data.google_compute_instance.gong_ws.name
}

output "workstation_ip" {
  value = data.google_compute_instance.gong_ws.network_interface[0].network_ip
}

output "cluster_name" { value = var.cluster_name }
output "bmctl_version" { value = var.bmctl_version }
output "project_id" { value = var.project_id }
output "zone" { value = var.zone }