# terraform/modules/aks/variables.tf

variable "cluster_name" {
  description = "Name of the AKS cluster"
  type        = string
  default     = "aks-clahan-academy"
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "eastus"
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
  description = "DNS prefix for AKS"
  type        = string
  default     = "clahan"
}

variable "subnet_aks_id" {
  description = "ID of the AKS subnet"
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
  default     = ""
}

variable "log_analytics_workspace_id" {
  description = "ID of the Log Analytics workspace"
  type        = string
}

variable "acr_id" {
  description = "ID of the Azure Container Registry"
  type        = string
}

variable "app_node_vm_size" {
  description = "VM size for app node pool"
  type        = string
  default     = "Standard_D4s_v3"
}

variable "app_node_count" {
  description = "Initial app node count"
  type        = number
  default     = 1
}

variable "app_min_count" {
  description = "Minimum app nodes for autoscaling"
  type        = number
  default     = 1
}

variable "app_max_count" {
  description = "Maximum app nodes for autoscaling"
  type        = number
  default     = 3
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}