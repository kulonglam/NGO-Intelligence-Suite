# CMEK key ring + platform master key (ADR-0015). enable_resources=false → IDs only.

variable "project_id" { type = string }
variable "location" { type = string }
variable "environment" { type = string }
variable "enable_resources" {
  type    = bool
  default = false
}

locals {
  key_ring = "ngois-${var.environment}"
}

resource "google_kms_key_ring" "platform" {
  count    = var.enable_resources ? 1 : 0
  project  = var.project_id
  name     = local.key_ring
  location = var.location
}

resource "google_kms_crypto_key" "master" {
  count           = var.enable_resources ? 1 : 0
  name            = "platform-master"
  key_ring        = google_kms_key_ring.platform[0].id
  rotation_period = "7776000s" # 90 days

  lifecycle {
    prevent_destroy = false
  }
}

output "key_ring_id" {
  value = var.enable_resources ? google_kms_key_ring.platform[0].id : "projects/${var.project_id}/locations/${var.location}/keyRings/${local.key_ring}"
}

output "master_key_id" {
  value = var.enable_resources ? google_kms_crypto_key.master[0].id : "projects/${var.project_id}/locations/${var.location}/keyRings/${local.key_ring}/cryptoKeys/platform-master"
}

output "resources_enabled" {
  value = var.enable_resources
}
