# terraform/variables.tf
# Variable declarations for Clahan Academy V2 Infrastructure

variable "environment" {
  description = "Environment name (dev or prod)"
  type        = string
  default     = "dev"
}

variable "subscription_id" {
  description = "Azure subscription ID"
  type        = string
  default     = "34c41824-bb7a-4316-af37-2597f35b730e"
}

variable "tenant_id" {
  description = "Azure AD tenant ID"
  type        = string
  default     = "67e6de35-58f8-4419-b1c4-1e5d7c49e04b"
}

variable "location" {
  description = "Azure region for all resources"
  type        = string
  default     = "eastus2"
}

variable "resource_group_name" {
  description = "Resource group name"
  type        = string
}

variable "github_app_client_id" {
  description = "Client ID of GitHub Actions app registration"
  type        = string
}

variable "github_sp_object_id" {
  description = "Object ID of GitHub Actions service principal"
  type        = string
}

variable "deployer_object_id" {
  description = "Object ID of the Terraform deployer"
  type        = string
}

variable "admin_email" {
  description = "Admin email for alerts"
  type        = string
  default     = "admin@clahaanacademy.online"
}

variable "smtp_host" {
  type    = string
  default = "smtp.gmail.com"
}

variable "smtp_port" {
  type    = string
  default = "587"
}

variable "smtp_user" {
  type      = string
  sensitive = true
}

variable "smtp_pass" {
  type      = string
  sensitive = true
}

variable "smtp_from" {
  type      = string
  sensitive = true
}

variable "sendgrid_api_key" {
  type      = string
  sensitive = true
  default   = ""
}

variable "sendgrid_from" {
  type    = string
  default = ""
}

variable "snyk_token" {
  type      = string
  sensitive = true
}

variable "sonar_token" {
  type      = string
  sensitive = true
}

# AKS sizing (different per environment)
variable "app_node_vm_size" {
  description = "VM size for AKS app node pool"
  type        = string
  default     = "Standard_D2s_v3"
}

variable "app_node_count" {
  description = "Number of app nodes"
  type        = number
  default     = 1
}

variable "app_min_count" {
  description = "Min app nodes for autoscaling"
  type        = number
  default     = 1
}

variable "app_max_count" {
  description = "Max app nodes for autoscaling"
  type        = number
  default     = 3
}

# PostgreSQL sizing
variable "postgres_sku" {
  description = "PostgreSQL SKU"
  type        = string
  default     = "GP_Standard_D2s_v3"
}

variable "postgres_storage_mb" {
  description = "PostgreSQL storage in MB"
  type        = number
  default     = 32768
}

variable "postgres_backup_days" {
  description = "PostgreSQL backup retention days"
  type        = number
  default     = 7
}

variable "postgres_geo_redundant" {
  description = "Enable geo-redundant PostgreSQL backups"
  type        = bool
  default     = false
}

# Redis sizing
variable "redis_capacity" {
  description = "Redis cache capacity"
  type        = number
  default     = 1
}

# Key Vault name (must be globally unique)
variable "key_vault_name" {
  description = "Key Vault name (globally unique)"
  type        = string
  default     = "kv-clahan-dev"
}
