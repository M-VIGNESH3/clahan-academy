# terraform/modules/identity/variables.tf

variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "westcentralus"
}

variable "aks_oidc_issuer_url" {
  description = "OIDC issuer URL from AKS cluster for workload identity"
  type        = string
}

variable "key_vault_id" {
  description = "Resource ID of the Azure Key Vault"
  type        = string
}

variable "storage_account_id" {
  description = "Resource ID of the Azure Storage Account"
  type        = string
}

variable "acr_id" {
  description = "Resource ID of the Azure Container Registry"
  type        = string
}

variable "github_sp_object_id" {
  description = "Object ID of the GitHub Actions service principal"
  type        = string
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
