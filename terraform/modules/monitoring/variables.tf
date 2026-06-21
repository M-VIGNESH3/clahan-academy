# terraform/modules/monitoring/variables.tf

variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "southeastasia"
}

variable "admin_email" {
  description = "Admin email for alert notifications"
  type        = string
  default     = "admin@clahaanacademy.online"
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}