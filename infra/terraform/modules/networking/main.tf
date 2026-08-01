# VPC + subnet + Cloud NAT. When enable_resources=false (default), outputs are names only (CI validate).
# Set enable_resources=true with credentials to apply (SDD §21 / ADR-0014).

variable "project_id" { type = string }
variable "region" { type = string }
variable "environment" { type = string }
variable "enable_resources" {
  type    = bool
  default = false
}

locals {
  network_name = "ngois-${var.environment}-vpc"
  subnet_name  = "ngois-${var.environment}-subnet"
  cidr         = var.environment == "prod" ? "10.10.0.0/20" : var.environment == "dr" ? "10.30.0.0/20" : "10.20.0.0/20"
}

resource "google_compute_network" "vpc" {
  count                   = var.enable_resources ? 1 : 0
  project                 = var.project_id
  name                    = local.network_name
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
}

resource "google_compute_subnetwork" "primary" {
  count                    = var.enable_resources ? 1 : 0
  project                  = var.project_id
  name                     = local.subnet_name
  region                   = var.region
  network                  = google_compute_network.vpc[0].id
  ip_cidr_range            = local.cidr
  private_ip_google_access = true
  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = cidrsubnet(local.cidr, 2, 1)
  }
  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = cidrsubnet(local.cidr, 2, 2)
  }
}

resource "google_compute_router" "nat_router" {
  count   = var.enable_resources ? 1 : 0
  project = var.project_id
  name    = "ngois-${var.environment}-router"
  region  = var.region
  network = google_compute_network.vpc[0].id
}

resource "google_compute_router_nat" "nat" {
  count                              = var.enable_resources ? 1 : 0
  project                            = var.project_id
  name                               = "ngois-${var.environment}-nat"
  router                             = google_compute_router.nat_router[0].name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"
}

resource "google_compute_global_address" "private_services" {
  count         = var.enable_resources ? 1 : 0
  project       = var.project_id
  name          = "ngois-${var.environment}-psa"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc[0].id
}

resource "google_service_networking_connection" "private_vpc" {
  count                 = var.enable_resources ? 1 : 0
  network               = google_compute_network.vpc[0].id
  service               = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services[0].name]
}

output "network_id" {
  value = var.enable_resources ? google_compute_network.vpc[0].id : "projects/${var.project_id}/global/networks/${local.network_name}"
}

output "network_name" {
  value = local.network_name
}

output "subnet_name" {
  value = local.subnet_name
}

output "resources_enabled" {
  value = var.enable_resources
}
