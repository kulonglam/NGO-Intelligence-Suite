# STUB — CMEK / per-tenant key ring hooks (ADR-0015).

variable "project_id" { type = string }
variable "location" { type = string }
variable "environment" { type = string }

locals {
  key_ring = "ngois-${var.environment}"
}

output "key_ring_id" {
  value = "projects/${var.project_id}/locations/${var.location}/keyRings/${local.key_ring}"
}

output "master_key_id" {
  value = "projects/${var.project_id}/locations/${var.location}/keyRings/${local.key_ring}/cryptoKeys/platform-master"
}
