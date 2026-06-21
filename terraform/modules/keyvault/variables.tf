# terraform/modules/keyvault/variables.tf

variable "resource_group_name" {
  type = string
}
variable "location" {
  type    = string
  default = "eastus2"
}
variable "tenant_id" {
  type = string
}
variable "deployer_object_id" {
  type = string
}
variable "github_sp_object_id" {
  type = string
}
variable "tags" {
  type    = map(string)
  default = {}
}
variable "secrets" {
  description = "Sensitive secrets to store in Key Vault"
  sensitive   = true
  type = object({
    smtp_host            = string
    smtp_port            = string
    smtp_user            = string
    smtp_pass            = string
    smtp_from            = string
    sendgrid_api_key     = string
    sendgrid_from        = string
    blob_storage_account = string
    blob_storage_key     = string
    snyk_token           = string
    sonar_token          = string
  })
}