terraform {
  required_version = ">= 1.6.0"
  # STUB: backend "gcs" { bucket = "ngois-tfstate" prefix = "ENV" }
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

# Providers are intentionally not configured — stubs must not apply.
