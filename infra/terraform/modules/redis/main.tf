# STUB — Memorystore Redis (cache + streams).

variable "project_id" { type = string }
variable "region" { type = string }
variable "environment" { type = string }

locals {
  name = "ngois-${var.environment}-redis"
}

output "host" {
  value = "redis.stub.invalid"
}

output "port" {
  value = 6379
}

output "instance_name" {
  value = local.name
}
