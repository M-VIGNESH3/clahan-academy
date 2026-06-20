# terraform/modules/postgres/outputs.tf

output "server_id" {
  description = "Resource ID of the PostgreSQL server"
  value       = azurerm_postgresql_flexible_server.main.id
}

output "server_fqdn" {
  description = "Fully qualified domain name of the PostgreSQL server"
  value       = azurerm_postgresql_flexible_server.main.fqdn
}

output "server_name" {
  description = "Name of the PostgreSQL server"
  value       = azurerm_postgresql_flexible_server.main.name
}

output "admin_login" {
  description = "Administrator login username"
  value       = azurerm_postgresql_flexible_server.main.administrator_login
}

output "admin_password" {
  description = "Administrator login password"
  value       = random_password.postgres_admin.result
  sensitive   = true
}

output "app_connection_string" {
  description = "Connection string for the main application database"
  value       = local.app_connection_string
  sensitive   = true
}

output "judge0_connection_string" {
  description = "Connection string for the Judge0 database"
  value       = local.judge0_connection_string
  sensitive   = true
}

output "database_name" {
  description = "Name of the main application database"
  value       = azurerm_postgresql_flexible_server_database.clahan_academy.name
}

output "judge0_database_name" {
  description = "Name of the Judge0 database"
  value       = azurerm_postgresql_flexible_server_database.judge0.name
}
