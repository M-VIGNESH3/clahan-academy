# terraform/modules/postgres/main.tf

locals {
  tags = merge(var.tags, {
    module = "postgres"
  })
}

# Auto-generate secure admin password
resource "random_password" "postgres_admin" {
  length           = 24
  special          = true
  override_special = "!#$%&*-_=+?"
  min_lower        = 4
  min_upper        = 4
  min_numeric      = 4
  min_special      = 2
}

# PostgreSQL Flexible Server - primary database for Clahan Academy
resource "azurerm_postgresql_flexible_server" "main" {
  name                          = "psql-clahan-academy"
  resource_group_name           = var.resource_group_name
  location                      = var.location
  administrator_login           = "clahanadmin"
  administrator_password        = random_password.postgres_admin.result
  sku_name                      = var.sku_name
  version                       = "15"
  storage_mb                    = var.storage_mb
  backup_retention_days         = var.backup_retention_days
  public_network_access_enabled = false

  geo_redundant_backup_enabled = var.geo_redundant_backup_enabled
  delegated_subnet_id          = var.subnet_postgres_id
  private_dns_zone_id          = var.private_dns_zone_postgres_id

  dynamic "high_availability" {
    for_each = var.high_availability_mode != "Disabled" ? [1] : []
    content {
      mode = var.high_availability_mode
    }
  }

  maintenance_window {
    day_of_week  = 0
    start_hour   = 2
    start_minute = 0
  }

  tags = local.tags

  depends_on = [var.private_dns_zone_postgres_id]

  lifecycle {
    ignore_changes = [
      administrator_password,
      zone,
      high_availability[0].standby_availability_zone
    ]
  }
}

# Main application database
resource "azurerm_postgresql_flexible_server_database" "clahan_academy" {
  name      = "clahan_academy"
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

# Separate database for Judge0 code compilation sandbox
resource "azurerm_postgresql_flexible_server_database" "judge0" {
  name      = "judge0"
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

# Enable connection throttling for security
resource "azurerm_postgresql_flexible_server_configuration" "connection_throttling" {
  name      = "connection_throttling"
  server_id = azurerm_postgresql_flexible_server.main.id
  value     = "on"
}

# Log all connections for audit purposes
resource "azurerm_postgresql_flexible_server_configuration" "log_connections" {
  name      = "log_connections"
  server_id = azurerm_postgresql_flexible_server.main.id
  value     = "on"
}

locals {
  app_connection_string = "postgresql://clahanadmin:${random_password.postgres_admin.result}@${azurerm_postgresql_flexible_server.main.fqdn}:5432/clahan_academy?sslmode=require"

  judge0_connection_string = "postgresql://clahanadmin:${random_password.postgres_admin.result}@${azurerm_postgresql_flexible_server.main.fqdn}:5432/judge0?sslmode=require"
}
