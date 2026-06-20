# terraform/modules/storage/outputs.tf

output "storage_account_id" {
  description = "Resource ID of the storage account"
  value       = azurerm_storage_account.main.id
}

output "storage_account_name" {
  description = "Name of the storage account"
  value       = azurerm_storage_account.main.name
}

output "primary_access_key" {
  description = "Primary access key for the storage account"
  value       = azurerm_storage_account.main.primary_access_key
  sensitive   = true
}

output "blob_endpoint" {
  description = "Primary blob service endpoint"
  value       = azurerm_storage_account.main.primary_blob_endpoint
}

output "container_names" {
  description = "Map of container logical names to actual names"
  value = {
    ai_models      = azurerm_storage_container.ai_models.name
    profile_photos = azurerm_storage_container.profile_photos.name
    csv_imports    = azurerm_storage_container.csv_imports.name
  }
}
