# terraform/modules/aks/variables.tf

variable "cluster_name" {
  description = "Name of the AKS cluster"
  type        = string
  default     = "aks-clahan-academy"
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "westcentralus"
}

variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
}

variable "resource_group_id" {
  description = "ID of the resource group"
  type        = string
}

variable "kubernetes_version" {
  description = "Kubernetes version"
  type        = string
  default     = "1.29"
}

variable "dns_prefix" {
  description = "DNS prefix for the AKS cluster"
  type        = string
  default     = "clahan"
}

variable "subnet_aks_id" {
  description = "ID of the AKS subnet (10.0.4.0/24)"
  type        = string
}

variable "subnet_appgw_id" {
  description = "ID of the Application Gateway subnet"
  type        = string
}

variable "vnet_id" {
  description = "ID of the virtual network"
  type        = string
}

variable "private_dns_zone_aks_id" {
  description = "ID of the AKS private DNS zone"
  type        = string
}

variable "log_analytics_workspace_id" {
  description = "ID of the Log Analytics workspace"
  type        = string
}

variable "acr_id" {
  description = "ID of the Azure Container Registry"
  type        = string
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
