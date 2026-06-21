# terraform/modules/postgres/variables.tf

variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "eastus"
}

variable "subnet_postgres_id" {
  description = "ID of the delegated PostgreSQL subnet"
  type        = string
}

variable "private_dns_zone_postgres_id" {
  description = "ID of the PostgreSQL private DNS zone"
  type        = string
}

variable "sku_name" {
  description = "PostgreSQL SKU"
  type        = string
  default     = "GP_Standard_D2s_v3"
}

variable "storage_mb" {
  description = "Storage in MB"
  type        = number
  default     = 32768
}

variable "backup_retention_days" {
  description = "Backup retention days"
  type        = number
  default     = 7
}

variable "geo_redundant_backup_enabled" {
  description = "Geo-redundant backup"
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags"
  type        = map(string)
  default     = {}
}