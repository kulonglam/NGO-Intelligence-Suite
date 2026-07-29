# STUB — VPC, private services access, Cloud NAT.

variable "project_id" { type = string }
variable "region" { type = string }
variable "environment" { type = string }

locals {
  network_name = "ngois-${var.environment}-vpc"
}

output "network_id" {
  value = "projects/${var.project_id}/global/networks/${local.network_name}"
}

output "network_name" {
  value = local.network_name
}
