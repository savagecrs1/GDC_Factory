mock_provider "google" {}

variables {
  project_id    = "test-project"
  region        = "us-central1"
  zone          = "us-central1-a"
  cluster_name  = "test-cluster"
  machine_type  = "n1-standard-8"
  bmctl_version = "1.28.0"
}

run "validate_sa_creation" {
  command = plan

  assert {
    condition     = google_service_account.baremetal_gcr.account_id == "baremetal-gcr"
    error_message = "Baremetal service account has wrong ID."
  }
}

run "validate_vm_count_and_config" {
  command = plan

  assert {
    condition     = length(google_compute_instance.gdc_vms) == 3
    error_message = "Should provision exactly 3 VMs."
  }

  assert {
    condition     = google_compute_instance.gdc_vms["gong1"].machine_type == "n1-standard-8"
    error_message = "Workstation VM has wrong machine type."
  }

  assert {
    condition     = google_compute_instance.gdc_vms["gong1"].advanced_machine_features[0].enable_nested_virtualization == true
    error_message = "Nested virtualization should be enabled."
  }
}
