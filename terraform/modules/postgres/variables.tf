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
