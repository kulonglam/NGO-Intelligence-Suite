# STUB — Cloud SQL PostgreSQL HA + PITR (SDD §21).

variable "project_id" { type = string }
variable "region" { type = string }
variable "environment" { type = string }
variable "tier" {
  type    = string
  default = "db-custom-2-7680"
}

locals {
  instance_name = "ngois-${var.environment}-pg"
}

output "connection_name" {
  value = "${var.project_id}:${var.region}:${local.instance_name}"
}

output "pitr_enabled" {
  value = true
}

output "ha_enabled" {
  value = true
}
