# terraform/modules/postgres/main.tf

terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.100"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

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
  name                   = "psql-clahan-academy"
  resource_group_name    = var.resource_group_name
  location               = var.location
  administrator_login    = "clahanadmin"
  administrator_password = random_password.postgres_admin.result
  sku_name               = "GP_Standard_D2s_v3"
  version                = "15"
  storage_mb             = 32768
  backup_retention_days  = 7

  geo_redundant_backup_enabled = false
  delegated_subnet_id          = var.subnet_postgres_id
  private_dns_zone_id          = var.private_dns_zone_postgres_id

  high_availability {
    mode = "Disabled"
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

# Store app connection string in Key Vault
resource "azurerm_key_vault_secret" "db_connection_string" {
  name         = "db-connection-string"
  value        = local.app_connection_string
  key_vault_id = var.key_vault_id
  content_type = "text/plain"
  tags         = local.tags
}

# Store Judge0 connection string in Key Vault
resource "azurerm_key_vault_secret" "judge0_db_connection_string" {
  name         = "judge0-db-connection-string"
  value        = local.judge0_connection_string
  key_vault_id = var.key_vault_id
  content_type = "text/plain"
  tags         = local.tags
}

# Store admin password in Key Vault for emergency access
resource "azurerm_key_vault_secret" "postgres_admin_password" {
  name         = "postgres-admin-password"
  value        = random_password.postgres_admin.result
  key_vault_id = var.key_vault_id
  content_type = "text/plain"
  tags         = local.tags
}
