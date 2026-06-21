# terraform/modules/jumpvm/variables.tf

variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "eastus2"
}

variable "subnet_mgmt_id" {
  description = "ID of the management subnet for Jump VM"
  type        = string
}

variable "aks_cluster_id" {
  description = "Resource ID of the AKS cluster"
  type        = string
}

variable "key_vault_id" {
  description = "Resource ID of the Key Vault"
  type        = string
}

variable "vm_size" {
  description = "VM size for Jump VM"
  type        = string
  default     = "Standard_B2ms"
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
