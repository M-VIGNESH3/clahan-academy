# terraform/modules/monitoring/variables.tf

variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "westcentralus"
}

variable "admin_email" {
  description = "Admin email address for alert notifications"
  type        = string
  default     = "admin@clahaanacademy.online"
}

variable "aks_cluster_id" {
  description = "Resource ID of the AKS cluster for alerts"
  type        = string
  default     = ""
}

variable "redis_id" {
  description = "Resource ID of the Redis cache for alerts"
  type        = string
  default     = ""
}

variable "postgres_server_id" {
  description = "Resource ID of the PostgreSQL server for alerts"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
