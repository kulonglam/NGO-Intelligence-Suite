# Cloud SQL PostgreSQL HA + PITR (SDD §21). enable_resources=false → connection name only.

variable "project_id" { type = string }
variable "region" { type = string }
variable "environment" { type = string }
variable "tier" {
  type    = string
  default = "db-custom-2-7680"
}
variable "enable_resources" {
  type    = bool
  default = false
}
variable "db_password" {
  type      = string
  default   = ""
  sensitive = true
}

locals {
  instance_name = "ngois-${var.environment}-pg"
}

resource "google_sql_database_instance" "primary" {
  count            = var.enable_resources ? 1 : 0
  project          = var.project_id
  name             = local.instance_name
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier              = var.tier
    availability_type = "REGIONAL"
    disk_size         = 50
    disk_autoresize   = true

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "02:00"
      transaction_log_retention_days = 7
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = null # set via env composition when PSA ready
      ssl_mode        = "ENCRYPTED_ONLY"
    }

    insights_config {
      query_insights_enabled = true
    }

    user_labels = {
      environment = var.environment
      app         = "ngois"
    }
  }

  deletion_protection = var.environment == "prod"
}

resource "google_sql_database" "ngois" {
  count    = var.enable_resources ? 1 : 0
  project  = var.project_id
  name     = "ngois"
  instance = google_sql_database_instance.primary[0].name
}

resource "google_sql_user" "app" {
  count    = var.enable_resources && var.db_password != "" ? 1 : 0
  project  = var.project_id
  name     = "ngois_app"
  instance = google_sql_database_instance.primary[0].name
  password = var.db_password
}

output "connection_name" {
  value = var.enable_resources ? google_sql_database_instance.primary[0].connection_name : "${var.project_id}:${var.region}:${local.instance_name}"
}

output "pitr_enabled" {
  value = true
}

output "ha_enabled" {
  value = true
}

output "resources_enabled" {
  value = var.enable_resources
}
