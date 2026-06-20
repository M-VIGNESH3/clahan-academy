# terraform/modules/jumpvm/outputs.tf

output "vm_id" {
  description = "Resource ID of the Jump VM"
  value       = azurerm_linux_virtual_machine.main.id
}

output "vm_name" {
  description = "Name of the Jump VM"
  value       = azurerm_linux_virtual_machine.main.name
}

output "vm_private_ip" {
  description = "Private IP address of the Jump VM"
  value       = azurerm_network_interface.main.private_ip_address
}

output "vm_identity_principal_id" {
  description = "Principal ID of the Jump VM managed identity"
  value       = azurerm_linux_virtual_machine.main.identity[0].principal_id
}

output "vm_admin_username" {
  description = "Admin username for the Jump VM"
  value       = azurerm_linux_virtual_machine.main.admin_username
}

output "vm_admin_password" {
  description = "Admin password stored in Key Vault"
  value       = random_password.vm_admin.result
  sensitive   = true
}
