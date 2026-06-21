# terraform/environments/dev/main.tf

# Clahan Academy V2 - Dev Environment
# Wires all Terraform modules together
# Region: West Central US
# Last updated: 2026

locals {
  tags = {
    Environment = "dev"
    Project     = "clahan-academy"
    Owner       = "M-VIGNESH3"
    ManagedBy   = "terraform"
    Region      = "westcentralus"
  }
}

data "azurerm_client_config" "current" {}

module "networking" {
  source = "../../modules/networking"

  resource_group_name = var.resource_group_name
  location            = var.location
  tags                = local.tags
}

module "monitoring" {
  source = "../../modules/monitoring"

  resource_group_name = module.networking.resource_group_name
  location            = var.location
  admin_email         = var.admin_email
  tags                = local.tags
}

module "acr" {
  source = "../../modules/acr"

  resource_group_name        = module.networking.resource_group_name
  location                   = var.location
  subnet_privateendpoints_id = module.networking.subnet_privateendpoints_id
  tags                       = local.tags
}

module "storage" {
  source = "../../modules/storage"

  resource_group_name        = module.networking.resource_group_name
  location                   = var.location
  subnet_privateendpoints_id = module.networking.subnet_privateendpoints_id
  deployer_object_id         = var.deployer_object_id
  tags                       = local.tags
}

module "postgres" {
  source = "../../modules/postgres"

  resource_group_name          = module.networking.resource_group_name
  location                     = var.location
  subnet_postgres_id           = module.networking.subnet_postgres_id
  private_dns_zone_postgres_id = module.networking.private_dns_zone_ids["postgres"]
  tags                         = local.tags
}

module "keyvault" {
  source = "../../modules/keyvault"

  resource_group_name          = module.networking.resource_group_name
  location                     = var.location
  tenant_id                    = var.tenant_id
  deployer_object_id           = var.deployer_object_id
  github_sp_object_id          = var.github_sp_object_id
  tags                         = local.tags

  secrets = {
    db_connection_string        = module.postgres.app_connection_string
    judge0_db_connection_string = module.postgres.judge0_connection_string
    smtp_host                   = var.smtp_host
    smtp_port                   = var.smtp_port
    smtp_user                   = var.smtp_user
    smtp_pass                   = var.smtp_pass
    smtp_from                   = var.smtp_from
    sendgrid_api_key            = var.sendgrid_api_key
    sendgrid_from               = var.sendgrid_from
    blob_storage_account        = module.storage.storage_account_name
    blob_storage_key            = module.storage.primary_access_key
    snyk_token                  = var.snyk_token
    sonar_token                 = var.sonar_token
  }
}

module "aks" {
  source = "../../modules/aks"

  cluster_name               = "aks-clahan-academy"
  location                   = var.location
  resource_group_name        = module.networking.resource_group_name
  resource_group_id          = module.networking.resource_group_id
  kubernetes_version         = "1.29"
  dns_prefix                 = "clahan"
  subnet_aks_id              = module.networking.subnet_aks_id
  subnet_appgw_id            = module.networking.subnet_appgw_id
  vnet_id                    = module.networking.vnet_id
  log_analytics_workspace_id = module.monitoring.log_analytics_workspace_id
  acr_id                     = module.acr.acr_id
  tags                       = local.tags
}

module "identity" {
  source = "../../modules/identity"

  resource_group_name = module.networking.resource_group_name
  location            = var.location
  aks_oidc_issuer_url = module.aks.oidc_issuer_url
  key_vault_id        = module.keyvault.key_vault_id
  storage_account_id  = module.storage.storage_account_id
  acr_id              = module.acr.acr_id
  github_sp_object_id = var.github_sp_object_id
  tags                = local.tags
}

module "jumpvm" {
  source = "../../modules/jumpvm"

  resource_group_name = module.networking.resource_group_name
  location            = var.location
  subnet_mgmt_id      = module.networking.subnet_mgmt_id
  aks_cluster_id      = module.aks.cluster_id
  key_vault_id        = module.keyvault.key_vault_id
  tags                = local.tags
}

# Functions module removed - VM quota limit on free subscription
# DB Secrets at root level to avoid circular dependency
resource "azurerm_key_vault_secret" "db_connection_string" {
  name         = "db-connection-string"
  value        = module.postgres.app_connection_string
  key_vault_id = module.keyvault.key_vault_id
  content_type = "text/plain"
  tags         = local.tags
  depends_on   = [module.keyvault, module.postgres]
}

resource "azurerm_key_vault_secret" "judge0_db_connection_string" {
  name         = "judge0-db-connection-string"
  value        = module.postgres.judge0_connection_string
  key_vault_id = module.keyvault.key_vault_id
  content_type = "text/plain"
  tags         = local.tags
  depends_on   = [module.keyvault, module.postgres]
}

resource "azurerm_key_vault_secret" "postgres_admin_password" {
  name         = "postgres-admin-password"
  value        = module.postgres.admin_password
  key_vault_id = module.keyvault.key_vault_id
  content_type = "text/plain"
  tags         = local.tags
  depends_on   = [module.keyvault, module.postgres]
}