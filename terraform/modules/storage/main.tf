# terraform/modules/storage/main.tf

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
  public_network_access_enabled   = true

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

# Role assignment allowing deployer to manage storage containers/blobs
resource "azurerm_role_assignment" "deployer_storage" {
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = var.deployer_object_id
  scope                = azurerm_storage_account.main.id

  lifecycle {
    ignore_changes = all
  }
}

# Stores YOLO weights and InsightFace models
resource "azurerm_storage_container" "ai_models" {
  name                  = "ai-models"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"

  depends_on = [azurerm_role_assignment.deployer_storage]
}

# Stores student profile photos for face verification
resource "azurerm_storage_container" "profile_photos" {
  name                  = "profile-photos"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"

  depends_on = [azurerm_role_assignment.deployer_storage]
}

# Stores CSV files for bulk student imports
resource "azurerm_storage_container" "csv_imports" {
  name                  = "csv-imports"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"

  depends_on = [azurerm_role_assignment.deployer_storage]
}
