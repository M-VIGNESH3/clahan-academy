# terraform/modules/keyvault/variables.tf

variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "westcentralus"
}

variable "tenant_id" {
  description = "Azure AD tenant ID"
  type        = string
}

variable "deployer_object_id" {
  description = "Object ID of the person/SP running Terraform"
  type        = string
}

variable "github_sp_object_id" {
  description = "Object ID of the GitHub Actions service principal"
  type        = string
}

variable "subnet_privateendpoints_id" {
  description = "ID of the private endpoints subnet"
  type        = string
}

variable "private_dns_zone_keyvault_id" {
  description = "ID of the Key Vault private DNS zone"
  type        = string
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}

variable "postgres_admin_password" {
  description = "PostgreSQL admin password to store in Key Vault"
  type        = string
  sensitive   = true
  default     = ""
}

variable "secrets" {
  description = "Sensitive secrets to store in Key Vault"
  type = object({
    db_connection_string        = string
    judge0_db_connection_string = string
    smtp_host                   = string
    smtp_port                   = string
    smtp_user                   = string
    smtp_pass                   = string
    smtp_from                   = string
    sendgrid_api_key            = string
    sendgrid_from               = string
    blob_storage_account        = string
    blob_storage_key            = string
    snyk_token                  = string
    sonar_token                 = string
  })
  sensitive = true
}
