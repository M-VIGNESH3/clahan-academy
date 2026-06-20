# terraform/modules/networking/outputs.tf

output "resource_group_name" {
  description = "Name of the created resource group"
  value       = azurerm_resource_group.main.name
}

output "resource_group_id" {
  description = "ID of the created resource group"
  value       = azurerm_resource_group.main.id
}

output "vnet_id" {
  description = "ID of the virtual network"
  value       = azurerm_virtual_network.main.id
}

output "vnet_name" {
  description = "Name of the virtual network"
  value       = azurerm_virtual_network.main.name
}

output "subnet_appgw_id" {
  description = "ID of the Application Gateway subnet"
  value       = azurerm_subnet.appgw.id
}

output "subnet_bastion_id" {
  description = "ID of the Bastion subnet"
  value       = azurerm_subnet.bastion.id
}

output "subnet_mgmt_id" {
  description = "ID of the management subnet"
  value       = azurerm_subnet.mgmt.id
}

output "subnet_aks_id" {
  description = "ID of the AKS subnet (10.0.4.0/24)"
  value       = azurerm_subnet.aks.id
}

output "subnet_privateendpoints_id" {
  description = "ID of the private endpoints subnet"
  value       = azurerm_subnet.privateendpoints.id
}

output "subnet_functions_id" {
  description = "ID of the Azure Functions subnet"
  value       = azurerm_subnet.functions.id
}

output "subnet_postgres_id" {
  description = "ID of the PostgreSQL delegated subnet"
  value       = azurerm_subnet.postgres.id
}

output "private_dns_zone_ids" {
  description = "Map of private DNS zone IDs keyed by service name"
  value = {
    for k, v in azurerm_private_dns_zone.zones :
    k => v.id
  }
}

output "private_dns_zone_names" {
  description = "Map of private DNS zone names keyed by service name"
  value = {
    for k, v in azurerm_private_dns_zone.zones :
    k => v.name
  }
}

output "bastion_name" {
  description = "Name of the Azure Bastion host"
  value       = azurerm_bastion_host.main.name
}

output "bastion_id" {
  description = "ID of the Azure Bastion host"
  value       = azurerm_bastion_host.main.id
}
