# terraform/modules/postgres/main.tf
# PostgreSQL Flexible Server with VNet integration
# Uses delegated subnet for private access within VNet

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

resource "azurerm_postgresql_flexible_server" "main" {
  name                         = "psql-clahan-academy"
  resource_group_name          = var.resource_group_name
  location                     = var.location
  administrator_login          = "clahanadmin"
  administrator_password       = random_password.postgres_admin.result
  sku_name                     = var.sku_name
  version                      = "15"
  storage_mb                   = var.storage_mb
  backup_retention_days        = var.backup_retention_days
  geo_redundant_backup_enabled = var.geo_redundant_backup_enabled

  # VNet integration - private access only
  delegated_subnet_id = var.subnet_postgres_id
  private_dns_zone_id = var.private_dns_zone_postgres_id

  maintenance_window {
    day_of_week  = 0
    start_hour   = 2
    start_minute = 0
  }

  lifecycle {
    ignore_changes = [
      administrator_password,
      zone
    ]
  }

  tags = local.tags
}

resource "azurerm_postgresql_flexible_server_database" "clahan_academy" {
  name      = "clahan_academy"
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

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