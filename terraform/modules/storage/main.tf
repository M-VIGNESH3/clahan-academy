# terraform/modules/storage\main.tf

locals {
  tags = merge(var.tags, {
    module = "storage"
  })
}

# Storage account for AI models, profile photos, and CSV imports
resource "azurerm_storage_account" "main" {
  name                            = "stclahanacademy"
  resource_group_name             = var.resource_group_name
  location                        = var.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  account_kind                    = "StorageV2"
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false
  public_network_access_enabled   = false

  blob_properties {
    versioning_enabled = true
    delete_retention_policy {
      days = 7
    }
    container_delete_retention_policy {
      days = 7
    }
  }

  tags = local.tags
}

# Stores YOLO weights and InsightFace models
resource "azurerm_storage_container" "ai_models" {
  name                  = "ai-models"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}

# Stores student profile photos for face verification
resource "azurerm_storage_container" "profile_photos" {
  name                  = "profile-photos"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}

# Stores CSV files for bulk student imports
resource "azurerm_storage_container" "csv_imports" {
  name                  = "csv-imports"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}

# Private endpoint - Storage only accessible within VNet
resource "azurerm_private_endpoint" "storage" {
  name                = "pe-storage"
  location            = var.location
  resource_group_name = var.resource_group_name
  subnet_id           = var.subnet_privateendpoints_id

  private_service_connection {
    name                           = "pec-storage"
    private_connection_resource_id = azurerm_storage_account.main.id
    subresource_names              = ["blob"]
    is_manual_connection           = false
  }

  private_dns_zone_group {
    name                 = "storage-dns-group"
    private_dns_zone_ids = [var.private_dns_zone_blob_id]
  }

  tags = local.tags
}

# Store storage account name in Key Vault
resource "azurerm_key_vault_secret" "storage_account_name" {
  name         = "blob-storage-account"
  value        = azurerm_storage_account.main.name
  key_vault_id = var.key_vault_id
  content_type = "text/plain"
  tags         = local.tags
}

# Store storage access key in Key Vault
resource "azurerm_key_vault_secret" "storage_account_key" {
  name         = "blob-storage-key"
  value        = azurerm_storage_account.main.primary_access_key
  key_vault_id = var.key_vault_id
  content_type = "text/plain"
  tags         = local.tags
}
