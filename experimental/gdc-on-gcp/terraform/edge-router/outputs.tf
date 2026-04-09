output "edge_router_ip" {
  value = google_compute_instance.edge_router.network_interface[0].network_ip
}

output "edge_router_name" {
  value = google_compute_instance.edge_router.name
}
