# terraform/modules/postgres/outputs.tf

output "server_id" {
  value = azurerm_postgresql_flexible_server.main.id
}

output "server_fqdn" {
  value = azurerm_postgresql_flexible_server.main.fqdn
}

output "server_name" {
  value = azurerm_postgresql_flexible_server.main.name
}

output "admin_login" {
  value = azurerm_postgresql_flexible_server.main.administrator_login
}

output "admin_password" {
  value     = random_password.postgres_admin.result
  sensitive = true
}

output "app_connection_string" {
  value     = "postgresql://clahanadmin:${random_password.postgres_admin.result}@${azurerm_postgresql_flexible_server.main.fqdn}:5432/clahan_academy?sslmode=require"
  sensitive = true
}

output "judge0_connection_string" {
  value     = "postgresql://clahanadmin:${random_password.postgres_admin.result}@${azurerm_postgresql_flexible_server.main.fqdn}:5432/judge0?sslmode=require"
  sensitive = true
}

output "database_name" {
  value = azurerm_postgresql_flexible_server_database.clahan_academy.name
}