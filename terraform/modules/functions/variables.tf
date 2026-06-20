# terraform/modules/functions/variables.tf

variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "westcentralus"
}

variable "storage_account_name" {
  description = "Storage account name for Function App"
  type        = string
}

variable "storage_account_key" {
  description = "Storage account access key for Function App"
  type        = string
  sensitive   = true
}

variable "app_insights_instrumentation_key" {
  description = "Application Insights instrumentation key"
  type        = string
  sensitive   = true
}

variable "app_insights_connection_string" {
  description = "Application Insights connection string"
  type        = string
  sensitive   = true
}

variable "key_vault_id" {
  description = "Resource ID of the Key Vault"
  type        = string
}

variable "aks_cluster_id" {
  description = "Resource ID of the AKS cluster"
  type        = string
}

variable "redis_hostname" {
  description = "Hostname of the Redis cache"
  type        = string
}

variable "postgres_fqdn" {
  description = "FQDN of the PostgreSQL server"
  type        = string
}

variable "admin_email" {
  description = "Admin email for health alert notifications"
  type        = string
  default     = "admin@clahaanacademy.online"
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
