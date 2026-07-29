# STUB — staging composition.

variable "project_id" {
  type    = string
  default = "ngois-staging-stub"
}

variable "region" {
  type    = string
  default = "africa-south1"
}

locals {
  environment = "staging"
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
    redis       = module.redis.instance_name
  }
}
