output "cluster_nodes_ips" {
  value = {
    node1 = google_compute_instance.gdc_vms["node1"].network_interface[0].network_ip
    node2 = google_compute_instance.gdc_vms["node2"].network_interface[0].network_ip
    node3 = google_compute_instance.gdc_vms["node3"].network_interface[0].network_ip
  }
}

output "cluster_nodes_names" {
  value = {
    node1 = google_compute_instance.gdc_vms["node1"].name
    node2 = google_compute_instance.gdc_vms["node2"].name
    node3 = google_compute_instance.gdc_vms["node3"].name
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