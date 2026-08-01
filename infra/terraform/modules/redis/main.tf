# Memorystore Redis (cache + streams). enable_resources=false → host stub.

variable "project_id" { type = string }
variable "region" { type = string }
variable "environment" { type = string }
variable "enable_resources" {
  type    = bool
  default = false
}
variable "memory_size_gb" {
  type    = number
  default = 1
}
variable "authorized_network" {
  type    = string
  default = ""
}

locals {
  name = "ngois-${var.environment}-redis"
}

resource "google_redis_instance" "cache" {
  count          = var.enable_resources ? 1 : 0
  project        = var.project_id
  name           = local.name
  tier           = var.environment == "prod" ? "STANDARD_HA" : "BASIC"
  memory_size_gb = var.memory_size_gb
  region         = var.region
  redis_version  = "REDIS_7_0"

  authorized_network = var.authorized_network != "" ? var.authorized_network : null
  connect_mode       = "PRIVATE_SERVICE_ACCESS"

  labels = {
    environment = var.environment
    app         = "ngois"
  }
}

output "host" {
  value = var.enable_resources ? google_redis_instance.cache[0].host : "redis.stub.invalid"
}

output "port" {
  value = var.enable_resources ? google_redis_instance.cache[0].port : 6379
}

output "instance_name" {
  value = local.name
}

output "resources_enabled" {
  value = var.enable_resources
}
