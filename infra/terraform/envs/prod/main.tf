# STUB — production composition (rolling deploy; canary deferred to Phase 2).

variable "project_id" {
  type    = string
  default = "ngois-prod-stub"
}

variable "region" {
  type    = string
  default = "africa-south1"
}

locals {
  environment = "prod"
}

module "networking" {
  source      = "../../modules/networking"
  project_id  = var.project_id
  region      = var.region
  environment = local.environment
}

module "gke" {
  source      = "../../modules/gke"
  project_id  = var.project_id
  region      = var.region
  environment = local.environment
  network_id  = module.networking.network_id
}

module "cloudsql" {
  source      = "../../modules/cloudsql"
  project_id  = var.project_id
  region      = var.region
  environment = local.environment
  tier        = "db-custom-4-15360"
}

module "redis" {
  source      = "../../modules/redis"
  project_id  = var.project_id
  region      = var.region
  environment = local.environment
}

module "kms" {
  source      = "../../modules/kms"
  project_id  = var.project_id
  location    = var.region
  environment = local.environment
}

output "stub_summary" {
  value = {
    environment = local.environment
    cluster     = module.gke.cluster_name
    db          = module.cloudsql.connection_name
    ha          = module.cloudsql.ha_enabled
    pitr        = module.cloudsql.pitr_enabled
  }
}
