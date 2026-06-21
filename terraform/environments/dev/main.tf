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

module "monitoring" {
  source = "../../modules/monitoring"

  resource_group_name = var.resource_group_name
  location            = var.location
  admin_email         = var.admin_email
  aks_cluster_id      = ""
  redis_id            = ""
  postgres_server_id  = ""
  tags                = local.tags
}

module "networking" {
  source = "../../modules/networking"

  resource_group_name = var.resource_group_name
  location            = var.location
  tags                = local.tags
}

module "acr" {
  source = "../../modules/acr"

  resource_group_name        = module.networking.resource_group_name
  location                   = var.location
  subnet_privateendpoints_id = module.networking.subnet_privateendpoints_id
  private_dns_zone_acr_id    = module.networking.private_dns_zone_ids["acr"]
  tags                       = local.tags
}

# NOTE: DB, Redis, and Storage secrets are written directly
# by their respective modules to avoid circular dependencies.
# The keyvault module creates the vault and base secrets.
# Postgres, Redis, Storage modules write their own secrets.
module "keyvault" {
  source = "../../modules/keyvault"

  resource_group_name          = module.networking.resource_group_name
  location                     = var.location
  tenant_id                    = var.tenant_id
  deployer_object_id           = var.deployer_object_id
  github_sp_object_id          = var.github_sp_object_id
  subnet_privateendpoints_id   = module.networking.subnet_privateendpoints_id
  private_dns_zone_keyvault_id = module.networking.private_dns_zone_ids["keyvault"]
  tags                         = local.tags

  secrets = {
    db_connection_string        = "PLACEHOLDER_UPDATED_BY_POSTGRES_MODULE"
    judge0_db_connection_string = "PLACEHOLDER_UPDATED_BY_POSTGRES_MODULE"
    redis_connection_string     = "PLACEHOLDER_UPDATED_BY_REDIS_MODULE"
    smtp_host                   = var.smtp_host
    smtp_port                   = var.smtp_port
    smtp_user                   = var.smtp_user
    smtp_pass                   = var.smtp_pass
    smtp_from                   = var.smtp_from
    sendgrid_api_key            = var.sendgrid_api_key
    sendgrid_from               = var.sendgrid_from
    blob_storage_account        = "stclahanacademy"
    blob_storage_key            = "PLACEHOLDER_UPDATED_BY_STORAGE_MODULE"
    snyk_token                  = var.snyk_token
    sonar_token                 = var.sonar_token
  }
}

module "postgres" {
  source = "../../modules/postgres"

  resource_group_name          = module.networking.resource_group_name
  location                     = var.location
  subnet_postgres_id           = module.networking.subnet_postgres_id
  private_dns_zone_postgres_id = module.networking.private_dns_zone_ids["postgres"]
  key_vault_id                 = module.keyvault.key_vault_id
  tags                         = local.tags
}

module "redis" {
  source = "../../modules/redis"

  resource_group_name        = module.networking.resource_group_name
  location                   = var.location
  subnet_privateendpoints_id = module.networking.subnet_privateendpoints_id
  private_dns_zone_redis_id  = module.networking.private_dns_zone_ids["redis"]
  key_vault_id               = module.keyvault.key_vault_id
  tags                       = local.tags
}

module "storage" {
  source = "../../modules/storage"

  resource_group_name        = module.networking.resource_group_name
  location                   = var.location
  subnet_privateendpoints_id = module.networking.subnet_privateendpoints_id
  private_dns_zone_blob_id   = module.networking.private_dns_zone_ids["blob"]
  key_vault_id               = module.keyvault.key_vault_id
  tags                       = local.tags
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
  private_dns_zone_aks_id    = module.networking.private_dns_zone_ids["aks"]
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

module "functions" {
  source = "../../modules/functions"

  resource_group_name              = module.networking.resource_group_name
  location                         = var.location
  storage_account_name             = module.storage.storage_account_name
  storage_account_key              = module.storage.primary_access_key
  app_insights_instrumentation_key = module.monitoring.app_insights_instrumentation_key
  app_insights_connection_string   = module.monitoring.app_insights_connection_string
  key_vault_id                     = module.keyvault.key_vault_id
  aks_cluster_id                   = module.aks.cluster_id
  redis_hostname                   = module.redis.redis_hostname
  postgres_fqdn                    = module.postgres.server_fqdn
  admin_email                      = var.admin_email
  tags                             = local.tags
}

