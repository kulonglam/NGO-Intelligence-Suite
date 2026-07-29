# STUB module — GKE Autopilot / standard cluster.
# Replace with google_container_cluster + node pools per SDD §21.

variable "project_id" { type = string }
variable "region" { type = string }
variable "environment" { type = string }
variable "network_id" { type = string }

locals {
  cluster_name = "ngois-${var.environment}-gke"
}

output "cluster_name" {
  value       = local.cluster_name
  description = "STUB cluster name — not provisioned"
}

output "endpoint" {
  value       = "https://stub.invalid"
  description = "STUB — replace after apply"
}
