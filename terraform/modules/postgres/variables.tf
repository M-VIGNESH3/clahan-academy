# terraform/modules/postgres/variables.tf

variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "westcentralus"
}

variable "subnet_postgres_id" {
  description = "ID of the PostgreSQL delegated subnet (10.0.7.0/24)"
  type        = string
}

variable "private_dns_zone_postgres_id" {
  description = "ID of the PostgreSQL private DNS zone"
  type        = string
}

variable "key_vault_id" {
  description = "Resource ID of the Key Vault to store secrets"
  type        = string
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}

variable "sku_name" {
  description = "PostgreSQL SKU name"
  type        = string
  default     = "GP_Standard_D2s_v3"
}

variable "storage_mb" {
  description = "Storage in MB"
  type        = number
  default     = 32768
}

variable "backup_retention_days" {
  description = "Backup retention in days"
  type        = number
  default     = 7
}

variable "geo_redundant_backup_enabled" {
  description = "Enable geo-redundant backups"
  type        = bool
  default     = false
}

variable "high_availability_mode" {
  description = "High availability mode (Disabled, ZoneRedundant, SameZone)"
  type        = string
  default     = "Disabled"
}

