# terraform/modules/storage/variables.tf

variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "westcentralus"
}

variable "subnet_privateendpoints_id" {
  description = "ID of the private endpoints subnet"
  type        = string
}

variable "private_dns_zone_blob_id" {
  description = "ID of the Blob Storage private DNS zone"
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
