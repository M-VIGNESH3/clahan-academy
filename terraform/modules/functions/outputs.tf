# terraform/modules/functions/outputs.tf

output "function_app_id" {
  description = "Resource ID of the Function App"
  value       = azurerm_linux_function_app.main.id
}

output "function_app_name" {
  description = "Name of the Function App"
  value       = azurerm_linux_function_app.main.name
}

output "function_app_hostname" {
  description = "Default hostname of the Function App"
  value       = azurerm_linux_function_app.main.default_hostname
}

output "function_app_identity_principal_id" {
  description = "Principal ID of Function App managed identity"
  value       = azurerm_linux_function_app.main.identity[0].principal_id
}
