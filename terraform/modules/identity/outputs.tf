# terraform/modules/identity/outputs.tf

output "identity_client_ids" {
  description = "Map of service name to managed identity client ID"
  value = {
    for k, v in azurerm_user_assigned_identity.services :
    k => v.client_id
  }
}

output "identity_principal_ids" {
  description = "Map of service name to managed identity principal ID"
  value = {
    for k, v in azurerm_user_assigned_identity.services :
    k => v.principal_id
  }
}

output "identity_ids" {
  description = "Map of service name to managed identity resource ID"
  value = {
    for k, v in azurerm_user_assigned_identity.services :
    k => v.id
  }
}

output "identity_names" {
  description = "Map of service name to managed identity name"
  value = {
    for k, v in azurerm_user_assigned_identity.services :
    k => v.name
  }
}
