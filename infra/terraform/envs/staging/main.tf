# Staging composition — set enable_resources=true + real project_id to apply (SDD §21).

variable "project_id" {
  type    = string
  default = "ngois-staging-stub"
}

variable "region" {
  type    = string
  default = "africa-south1"
}

variable "enable_resources" {
  type        = bool
  default     = false
  description = "When true, create GCP resources. Default false for CI validate."
}

variable "db_password" {
  type      = string
  default   = ""
  sensitive = true
}

locals {
  environment = "staging"
}

module "networking" {
  source           = "../../modules/networking"
  project_id       = var.project_id
  region           = var.region
  environment      = local.environment
  enable_resources = var.enable_resources
}

module "gke" {
  source           = "../../modules/gke"
  project_id       = var.project_id
  region           = var.region
  environment      = local.environment
  network_id       = module.networking.network_id
  subnet_name      = module.networking.subnet_name
  enable_resources = var.enable_resources
}

module "cloudsql" {
  source           = "../../modules/cloudsql"
  project_id       = var.project_id
  region           = var.region
  environment      = local.environment
  enable_resources = var.enable_resources
  db_password      = var.db_password
}

module "redis" {
  source              = "../../modules/redis"
  project_id          = var.project_id
  region              = var.region
  environment         = local.environment
  enable_resources    = var.enable_resources
  authorized_network  = module.networking.network_id
}

module "kms" {
  source           = "../../modules/kms"
  project_id       = var.project_id
  location         = var.region
  environment      = local.environment
  enable_resources = var.enable_resources
}

output "staging_summary" {
  value = {
    environment        = local.environment
    enable_resources   = var.enable_resources
    cluster            = module.gke.cluster_name
    db                 = module.cloudsql.connection_name
    redis              = module.redis.instance_name
    key_ring           = module.kms.key_ring_id
    apply_instructions = "Copy terraform.tfvars.example → terraform.tfvars, set enable_resources=true, then terraform apply"
  }
}
