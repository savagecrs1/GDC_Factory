terraform {
  backend "gcs" {
    bucket                      = "gdc-on-gcp-gdc-on-gcp2-tfstate"
    prefix                      = "terraform/bootstrap/state"
    impersonate_service_account = "tf-provisioner@gdc-on-gcp2.iam.gserviceaccount.com"
  }
}