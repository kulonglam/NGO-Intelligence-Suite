# GKE Standard regional cluster (ADR-0014). enable_resources=false → name outputs only.

variable "project_id" { type = string }
variable "region" { type = string }
variable "environment" { type = string }
variable "network_id" { type = string }
variable "subnet_name" {
  type    = string
  default = ""
}
variable "enable_resources" {
  type    = bool
  default = false
}
variable "node_count" {
  type    = number
  default = 2
}
variable "machine_type" {
  type    = string
  default = "e2-standard-4"
}

locals {
  cluster_name = "ngois-${var.environment}-gke"
}

resource "google_container_cluster" "primary" {
  count    = var.enable_resources ? 1 : 0
  project  = var.project_id
  name     = local.cluster_name
  location = var.region

  network    = var.network_id
  subnetwork = var.subnet_name != "" ? var.subnet_name : null

  remove_default_node_pool = true
  initial_node_count       = 1

  release_channel {
    channel = "REGULAR"
  }

  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }

  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block  = "172.16.0.0/28"
  }

  resource_labels = {
    environment = var.environment
    app         = "ngois"
  }
}

resource "google_container_node_pool" "primary" {
  count      = var.enable_resources ? 1 : 0
  project    = var.project_id
  name       = "ngois-${var.environment}-pool"
  location   = var.region
  cluster    = google_container_cluster.primary[0].name
  node_count = var.node_count

  node_config {
    machine_type = var.machine_type
    oauth_scopes = ["https://www.googleapis.com/auth/cloud-platform"]
    workload_metadata_config {
      mode = "GKE_METADATA"
    }
    labels = {
      environment = var.environment
    }
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }
}

output "cluster_name" {
  value = local.cluster_name
}

output "endpoint" {
  value = var.enable_resources ? google_container_cluster.primary[0].endpoint : "https://stub.invalid"
}

output "resources_enabled" {
  value = var.enable_resources
}
