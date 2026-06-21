# terraform/modules/postgres/main.tf
# PostgreSQL Flexible Server with private access

locals {
  tags = merge(var.tags, {
    module = "postgres"
  })
}

resource "random_password" "postgres_admin" {
  length           = 24
  special          = true
  override_special = "!#$%&*-_=+?"
  min_lower        = 4
  min_upper        = 4
  min_numeric      = 4
  min_special      = 2
}

# PostgreSQL Flexible Server
resource "azurerm_postgresql_flexible_server" "main" {
  name                = "psql-clahan-academy"
  resource_group_name = var.resource_group_name
  location            = var.location

  administrator_login    = "clahanadmin"
  administrator_password = random_password.postgres_admin.result

  sku_name   = var.sku_name
  version    = "15"
  storage_mb = var.storage_mb

  backup_retention_days        = var.backup_retention_days
  geo_redundant_backup_enabled = var.geo_redundant_backup_enabled

  delegated_subnet_id = var.subnet_postgres_id
  private_dns_zone_id = var.private_dns_zone_postgres_id

  high_availability {
    mode = "Disabled"
  }

  maintenance_window {
    day_of_week  = 0
    start_hour   = 2
    start_minute = 0
  }

  lifecycle {
    ignore_changes = [
      administrator_password,
      zone,
      high_availability[0].standby_availability_zone
    ]
  }

  tags = local.tags
}

# Main application database
resource "azurerm_postgresql_flexible_server_database" "clahan_academy" {
  name      = "clahan_academy"
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

# Judge0 compilation sandbox database
resource "azurerm_postgresql_flexible_server_database" "judge0" {
  name      = "judge0"
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

resource "azurerm_postgresql_flexible_server_configuration" "connection_throttling" {
  name      = "connection_throttling"
  server_id = azurerm_postgresql_flexible_server.main.id
  value     = "on"
}

resource "azurerm_postgresql_flexible_server_configuration" "log_connections" {
  name      = "log_connections"
  server_id = azurerm_postgresql_flexible_server.main.id
  value     = "on"
}

locals {
  app_connection_string    = "postgresql://clahanadmin:${random_password.postgres_admin.result}@${azurerm_postgresql_flexible_server.main.fqdn}:5432/clahan_academy?sslmode=require"
  judge0_connection_string = "postgresql://clahanadmin:${random_password.postgres_admin.result}@${azurerm_postgresql_flexible_server.main.fqdn}:5432/judge0?sslmode=require"
}

resource "azurerm_key_vault_secret" "db_connection_string" {
  name         = "db-connection-string"
  value        = local.app_connection_string
  key_vault_id = var.key_vault_id
  content_type = "text/plain"
  tags         = local.tags
}

resource "azurerm_key_vault_secret" "judge0_db_connection_string" {
  name         = "judge0-db-connection-string"
  value        = local.judge0_connection_string
  key_vault_id = var.key_vault_id
  content_type = "text/plain"
  tags         = local.tags
}

resource "azurerm_key_vault_secret" "postgres_admin_password" {
  name         = "postgres-admin-password"
  value        = random_password.postgres_admin.result
  key_vault_id = var.key_vault_id
  content_type = "text/plain"
  tags         = local.tags
}