# terraform/modules/redis/variables.tf

variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "southeastasia"
}

variable "redis_capacity" {
  description = "Redis cache capacity (1=C1, 2=C2)"
  type        = number
  default     = 1
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