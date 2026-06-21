# terraform/modules/identity/main.tf
# Creates one managed identity per microservice
# Each identity gets federated credentials for AKS Workload Identity

locals {
  tags = merge(var.tags, {
    module = "identity"
  })

  services = toset([
    "frontend", "auth", "admin", "student",
    "exam", "proctoring", "notification", "ai"
  ])

  storage_contributor_services = toset(["admin", "ai"])
  storage_reader_services      = toset(["exam", "student", "frontend"])
}

# One managed identity per service
resource "azurerm_user_assigned_identity" "services" {
  for_each            = local.services
  name                = "mi-clahan-${each.key}"
  resource_group_name = var.resource_group_name
  location            = var.location
  tags                = local.tags
}

# Federated credential links AKS pod ServiceAccount to managed identity
resource "azurerm_federated_identity_credential" "services" {
  for_each            = local.services
  name                = "fc-clahan-${each.key}"
  resource_group_name = var.resource_group_name
  parent_id           = azurerm_user_assigned_identity.services[each.key].id
  audience            = ["api://AzureADTokenExchange"]
  issuer              = var.aks_oidc_issuer_url
  subject             = "system:serviceaccount:clahan-academy:clahan-${each.key}-sa"
}

# All services can read secrets from Key Vault
resource "azurerm_role_assignment" "keyvault_secrets_user" {
  for_each             = local.services
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.services[each.key].principal_id
  scope                = var.key_vault_id

  lifecycle {
    ignore_changes = all
  }
}

# Admin and AI services can read and write blobs
resource "azurerm_role_assignment" "storage_blob_contributor" {
  for_each             = local.storage_contributor_services
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.services[each.key].principal_id
  scope                = var.storage_account_id

  lifecycle {
    ignore_changes = all
  }
}

# Exam, student, frontend can read blobs
resource "azurerm_role_assignment" "storage_blob_reader" {
  for_each             = local.storage_reader_services
  role_definition_name = "Storage Blob Data Reader"
  principal_id         = azurerm_user_assigned_identity.services[each.key].principal_id
  scope                = var.storage_account_id

  lifecycle {
    ignore_changes = all
  }
}

# GitHub Actions can push images to ACR
resource "azurerm_role_assignment" "github_acr_push" {
  role_definition_name             = "AcrPush"
  principal_id                     = var.github_sp_object_id
  scope                            = var.acr_id
  skip_service_principal_aad_check = true

  lifecycle {
    ignore_changes = all
  }
}

# GitHub Actions can read secrets from Key Vault during CI
resource "azurerm_role_assignment" "github_keyvault_reader" {
  role_definition_name             = "Key Vault Secrets User"
  principal_id                     = var.github_sp_object_id
  scope                            = var.key_vault_id
  skip_service_principal_aad_check = true

  lifecycle {
    ignore_changes = all
  }
}