# terraform/modules/functions/main.tf

locals {
  tags = merge(var.tags, {
    module = "functions"
  })
}

# Consumption plan - serverless, pay per execution, zero cost at rest
resource "azurerm_service_plan" "main" {
  name                = "asp-clahan-functions"
  resource_group_name = var.resource_group_name
  location            = var.location
  os_type             = "Linux"
  sku_name            = "Y1"
  tags                = local.tags
}

# ResourceHealthMonitor function app
resource "azurerm_linux_function_app" "main" {
  name                       = "func-clahan-academy"
  resource_group_name        = var.resource_group_name
  location                   = var.location
  storage_account_name       = var.storage_account_name
  storage_account_access_key = var.storage_account_key
  service_plan_id            = azurerm_service_plan.main.id
  https_only                 = true

  identity {
    type = "SystemAssigned"
  }

  site_config {
    application_stack {
      node_version = "20"
    }
    application_insights_key               = var.app_insights_instrumentation_key
    application_insights_connection_string = var.app_insights_connection_string
  }

  app_settings = {
    "FUNCTIONS_WORKER_RUNTIME"              = "node"
    "WEBSITE_RUN_FROM_PACKAGE"              = "1"
    "APPINSIGHTS_INSTRUMENTATIONKEY"        = var.app_insights_instrumentation_key
    "APPLICATIONINSIGHTS_CONNECTION_STRING" = var.app_insights_connection_string
    "DATABASE_URL"                          = "@Microsoft.KeyVault(VaultName=kv-clahan-academy;SecretName=db-connection-string)"
    "SMTP_HOST"                             = "@Microsoft.KeyVault(VaultName=kv-clahan-academy;SecretName=smtp-host)"
    "SMTP_PORT"                             = "@Microsoft.KeyVault(VaultName=kv-clahan-academy;SecretName=smtp-port)"
    "SMTP_USER"                             = "@Microsoft.KeyVault(VaultName=kv-clahan-academy;SecretName=smtp-user)"
    "SMTP_PASS"                             = "@Microsoft.KeyVault(VaultName=kv-clahan-academy;SecretName=smtp-pass)"
    "ADMIN_EMAIL"                           = var.admin_email
    "AKS_RESOURCE_GROUP"                    = var.resource_group_name
    "AKS_CLUSTER_NAME"                      = "aks-clahan-academy"
    "REDIS_HOSTNAME"                        = var.redis_hostname
    "POSTGRES_FQDN"                         = var.postgres_fqdn
  }

  tags = local.tags
}

# Allow Function App to read secrets from Key Vault
resource "azurerm_role_assignment" "function_keyvault_reader" {
  role_definition_name             = "Key Vault Secrets User"
  principal_id                     = azurerm_linux_function_app.main.identity[0].principal_id
  scope                            = var.key_vault_id
  skip_service_principal_aad_check = true

  lifecycle {
    ignore_changes = all
  }
}

# Allow Function App to check AKS cluster health
resource "azurerm_role_assignment" "function_aks_reader" {
  role_definition_name             = "Azure Kubernetes Service Cluster User Role"
  principal_id                     = azurerm_linux_function_app.main.identity[0].principal_id
  scope                            = var.aks_cluster_id
  skip_service_principal_aad_check = true

  lifecycle {
    ignore_changes = all
  }
}
