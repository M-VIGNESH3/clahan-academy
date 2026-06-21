# terraform/modules/postgres/variables.tf

variable "resource_group_name" {
  type = string
}
variable "location" {
  type    = string
  default = "eastus2"
}
variable "subnet_postgres_id" {
  description = "Delegated subnet for PostgreSQL VNet integration"
  type        = string
}
variable "private_dns_zone_postgres_id" {
  description = "Private DNS zone for PostgreSQL"
  type        = string
}
variable "sku_name" {
  type    = string
  default = "GP_Standard_D2s_v3"
}
variable "storage_mb" {
  type    = number
  default = 32768
}
variable "backup_retention_days" {
  type    = number
  default = 7
}
variable "geo_redundant_backup_enabled" {
  type    = bool
  default = false
}
variable "tags" {
  type    = map(string)
  default = {}
}