# terraform/environments/dev/variables.tf

variable "subscription_id" {
  description = "Azure subscription ID"
  type        = string
  default     = "34c41824-bb7a-4316-af37-2597f35b730e"
}

variable "tenant_id" {
  description = "Azure AD tenant ID"
  type        = string
  default     = "67e6de35-58f8-4419-b1c4-1e5d7c49e04b"
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "westcentralus"
}

variable "resource_group_name" {
  description = "Name of the main resource group"
  type        = string
  default     = "rg-clahan-academy"
}

variable "github_app_client_id" {
  description = "Client ID of GitHub Actions app registration (from bootstrap output)"
  type        = string
}

variable "github_sp_object_id" {
  description = "Object ID of GitHub Actions service principal (from bootstrap output)"
  type        = string
}

variable "deployer_object_id" {
  description = "Object ID of the person running Terraform (from bootstrap output)"
  type        = string
}

variable "admin_email" {
  description = "Admin email for alerts and notifications"
  type        = string
  default     = "admin@clahaanacademy.online"
}

variable "smtp_host" {
  description = "SMTP server hostname"
  type        = string
  default     = "smtp.gmail.com"
}

variable "smtp_port" {
  description = "SMTP server port"
  type        = string
  default     = "587"
}

variable "smtp_user" {
  description = "SMTP username"
  type        = string
  sensitive   = true
}

variable "smtp_pass" {
  description = "SMTP password or app password"
  type        = string
  sensitive   = true
}

variable "smtp_from" {
  description = "SMTP from email address"
  type        = string
}

variable "sendgrid_api_key" {
  description = "SendGrid API key for email sending"
  type        = string
  sensitive   = true
  default     = ""
}

variable "sendgrid_from" {
  description = "SendGrid verified sender email"
  type        = string
  default     = ""
}

variable "snyk_token" {
  description = "Snyk API token for security scanning"
  type        = string
  sensitive   = true
}

variable "sonar_token" {
  description = "SonarCloud token for code quality analysis"
  type        = string
  sensitive   = true
}
