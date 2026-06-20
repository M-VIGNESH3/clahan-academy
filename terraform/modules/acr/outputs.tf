# terraform/modules/acr/outputs.tf

output "acr_id" {
  description = "Resource ID of the Container Registry"
  value       = azurerm_container_registry.main.id
}

output "acr_name" {
  description = "Name of the Container Registry"
  value       = azurerm_container_registry.main.name
}

output "acr_login_server" {
  description = "Login server URL for the Container Registry"
  value       = azurerm_container_registry.main.login_server
}

output "acr_admin_username" {
  description = "Admin username (disabled but kept for reference)"
  value       = azurerm_container_registry.main.admin_username
}
