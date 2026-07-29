# STUB — warm DR region (ADR-0012). Async replica / standby only.

variable "project_id" {
  type    = string
  default = "ngois-prod-stub"
}

variable "primary_region" {
  type    = string
  default = "africa-south1"
}

variable "dr_region" {
  type    = string
  default = "europe-west1"
}

locals {
  environment = "dr"
}

module "networking" {
  source      = "../../modules/networking"
  project_id  = var.project_id
  region      = var.dr_region
  environment = local.environment
}

module "gke" {
  source      = "../../modules/gke"
  project_id  = var.project_id
  region      = var.dr_region
  environment = local.environment
  network_id  = module.networking.network_id
}

# Cloud SQL DR: cross-region replica stub — wire to primary instance name later.
module "cloudsql" {
  source      = "../../modules/cloudsql"
  project_id  = var.project_id
  region      = var.dr_region
  environment = local.environment
}

output "stub_summary" {
  value = {
    environment    = local.environment
    primary_region = var.primary_region
    dr_region      = var.dr_region
    cluster        = module.gke.cluster_name
    note           = "Warm DR — drill via ops/drills/regional-failover.md (RB-12)"
  }
}
