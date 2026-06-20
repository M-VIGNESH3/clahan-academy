# terraform/modules/acr/variables.tf

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

variable "private_dns_zone_acr_id" {
  description = "ID of the ACR private DNS zone"
  type        = string
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
