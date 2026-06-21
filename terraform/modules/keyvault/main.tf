# terraform/modules/keyvault\main.tf

locals {
  tags = merge(var.tags, {
    module = "keyvault"
  })
}

# Central secret store for all application secrets
resource "azurerm_key_vault" "main" {
  name                          = "kv-clahan-academy"
  location                      = var.location
  resource_group_name           = var.resource_group_name
  sku_name                      = "standard"
  tenant_id                     = var.tenant_id
  enable_rbac_authorization     = true
  soft_delete_retention_days    = 90
  purge_protection_enabled      = true
  public_network_access_enabled = false

  network_acls {
    bypass                     = "AzureServices"
    default_action             = "Deny"
    ip_rules                   = []
    virtual_network_subnet_ids = []
  }

  tags = local.tags
}

# Deployer (person running Terraform) can manage all secrets
resource "azurerm_role_assignment" "deployer_secrets_officer" {
  role_definition_name             = "Key Vault Secrets Officer"
  principal_id                     = var.deployer_object_id
  scope                            = azurerm_key_vault.main.id
  skip_service_principal_aad_check = true
}

# GitHub Actions can read secrets during CI/CD pipelines
resource "azurerm_role_assignment" "github_secrets_user" {
  role_definition_name             = "Key Vault Secrets User"
  principal_id                     = var.github_sp_object_id
  scope                            = azurerm_key_vault.main.id
  skip_service_principal_aad_check = true
}

# Auto-generated JWT access token signing secret
resource "random_password" "jwt_access" {
  length           = 64
  special          = true
  override_special = "!#$%&*-_=+?"
  min_lower        = 8
  min_upper        = 8
  min_numeric      = 8
  min_special      = 4
}

# Auto-generated JWT refresh token signing secret
resource "random_password" "jwt_refresh" {
  length           = 64
  special          = true
  override_special = "!#$%&*-_=+?"
  min_lower        = 8
  min_upper        = 8
  min_numeric      = 8
  min_special      = 4
}

# SENSITIVE - Never move to ConfigMap
resource "azurerm_key_vault_secret" "db_connection_string" {
  name         = "db-connection-string"
  value        = var.secrets.db_connection_string
  key_vault_id = azurerm_key_vault.main.id
  content_type = "text/plain"
  tags         = local.tags
  depends_on   = [azurerm_role_assignment.deployer_secrets_officer]
}

# SENSITIVE - Never move to ConfigMap
resource "azurerm_key_vault_secret" "judge0_db_connection_string" {
  name         = "judge0-db-connection-string"
  value        = var.secrets.judge0_db_connection_string
  key_vault_id = azurerm_key_vault.main.id
  content_type = "text/plain"
  tags         = local.tags
  depends_on   = [azurerm_role_assignment.deployer_secrets_officer]
}

# SENSITIVE - Never move to ConfigMap
resource "azurerm_key_vault_secret" "redis_connection_string" {
  name         = "redis-connection-string"
  value        = var.secrets.redis_connection_string
  key_vault_id = azurerm_key_vault.main.id
  content_type = "text/plain"
  tags         = local.tags
  depends_on   = [azurerm_role_assignment.deployer_secrets_officer]
}

# SENSITIVE - Never move to ConfigMap
resource "azurerm_key_vault_secret" "jwt_access_secret" {
  name         = "jwt-access-secret"
  value        = random_password.jwt_access.result
  key_vault_id = azurerm_key_vault.main.id
  content_type = "text/plain"
  tags         = local.tags
  depends_on   = [azurerm_role_assignment.deployer_secrets_officer]
}

# SENSITIVE - Never move to ConfigMap
resource "azurerm_key_vault_secret" "jwt_refresh_secret" {
  name         = "jwt-refresh-secret"
  value        = random_password.jwt_refresh.result
  key_vault_id = azurerm_key_vault.main.id
  content_type = "text/plain"
  tags         = local.tags
  depends_on   = [azurerm_role_assignment.deployer_secrets_officer]
}

# SENSITIVE - Never move to ConfigMap
resource "azurerm_key_vault_secret" "smtp_host" {
  name         = "smtp-host"
  value        = var.secrets.smtp_host
  key_vault_id = azurerm_key_vault.main.id
  content_type = "text/plain"
  tags         = local.tags
  depends_on   = [azurerm_role_assignment.deployer_secrets_officer]
}

# SENSITIVE - Never move to ConfigMap
resource "azurerm_key_vault_secret" "smtp_port" {
  name         = "smtp-port"
  value        = var.secrets.smtp_port
  key_vault_id = azurerm_key_vault.main.id
  content_type = "text/plain"
  tags         = local.tags
  depends_on   = [azurerm_role_assignment.deployer_secrets_officer]
}

# SENSITIVE - Never move to ConfigMap
resource "azurerm_key_vault_secret" "smtp_user" {
  name         = "smtp-user"
  value        = var.secrets.smtp_user
  key_vault_id = azurerm_key_vault.main.id
  content_type = "text/plain"
  tags         = local.tags
  depends_on   = [azurerm_role_assignment.deployer_secrets_officer]
}

# SENSITIVE - Never move to ConfigMap
resource "azurerm_key_vault_secret" "smtp_pass" {
  name         = "smtp-pass"
  value        = var.secrets.smtp_pass
  key_vault_id = azurerm_key_vault.main.id
  content_type = "text/plain"
  tags         = local.tags
  depends_on   = [azurerm_role_assignment.deployer_secrets_officer]
}

# SENSITIVE - Never move to ConfigMap
resource "azurerm_key_vault_secret" "smtp_from" {
  name         = "smtp-from"
  value        = var.secrets.smtp_from
  key_vault_id = azurerm_key_vault.main.id
  content_type = "text/plain"
  tags         = local.tags
  depends_on   = [azurerm_role_assignment.deployer_secrets_officer]
}

# SENSITIVE - Never move to ConfigMap
resource "azurerm_key_vault_secret" "sendgrid_api_key" {
  name         = "sendgrid-api-key"
  value        = var.secrets.sendgrid_api_key
  key_vault_id = azurerm_key_vault.main.id
  content_type = "text/plain"
  tags         = local.tags
  depends_on   = [azurerm_role_assignment.deployer_secrets_officer]
}

# SENSITIVE - Never move to ConfigMap
resource "azurerm_key_vault_secret" "sendgrid_from" {
  name         = "sendgrid-from"
  value        = var.secrets.sendgrid_from
  key_vault_id = azurerm_key_vault.main.id
  content_type = "text/plain"
  tags         = local.tags
  depends_on   = [azurerm_role_assignment.deployer_secrets_officer]
}

# SENSITIVE - Never move to ConfigMap
resource "azurerm_key_vault_secret" "blob_storage_account" {
  name         = "blob-storage-account"
  value        = var.secrets.blob_storage_account
  key_vault_id = azurerm_key_vault.main.id
  content_type = "text/plain"
  tags         = local.tags
  depends_on   = [azurerm_role_assignment.deployer_secrets_officer]
}

# SENSITIVE - Never move to ConfigMap
resource "azurerm_key_vault_secret" "blob_storage_key" {
  name         = "blob-storage-key"
  value        = var.secrets.blob_storage_key
  key_vault_id = azurerm_key_vault.main.id
  content_type = "text/plain"
  tags         = local.tags
  depends_on   = [azurerm_role_assignment.deployer_secrets_officer]
}

# SENSITIVE - Never move to ConfigMap
resource "azurerm_key_vault_secret" "snyk_token" {
  name         = "snyk-token"
  value        = var.secrets.snyk_token
  key_vault_id = azurerm_key_vault.main.id
  content_type = "text/plain"
  tags         = local.tags
  depends_on   = [azurerm_role_assignment.deployer_secrets_officer]
}

# SENSITIVE - Never move to ConfigMap
resource "azurerm_key_vault_secret" "sonar_token" {
  name         = "sonar-token"
  value        = var.secrets.sonar_token
  key_vault_id = azurerm_key_vault.main.id
  content_type = "text/plain"
  tags         = local.tags
  depends_on   = [azurerm_role_assignment.deployer_secrets_officer]
}

# NON-SENSITIVE - Can be moved to ConfigMap later if needed
resource "azurerm_key_vault_secret" "frontend_url" {
  name         = "frontend-url"
  value        = "https://clahaanacademy.online"
  key_vault_id = azurerm_key_vault.main.id
  content_type = "text/plain"
  tags         = local.tags
  depends_on   = [azurerm_role_assignment.deployer_secrets_officer]
}

# NON-SENSITIVE - Can be moved to ConfigMap later if needed
resource "azurerm_key_vault_secret" "ai_service_url" {
  name         = "ai-service-url"
  value        = "http://ai-service.clahan-academy.svc.cluster.local:8000"
  key_vault_id = azurerm_key_vault.main.id
  content_type = "text/plain"
  tags         = local.tags
  depends_on   = [azurerm_role_assignment.deployer_secrets_officer]
}

# NON-SENSITIVE - Can be moved to ConfigMap later if needed
resource "azurerm_key_vault_secret" "ollama_url" {
  name         = "ollama-url"
  value        = "http://ollama.clahan-academy.svc.cluster.local:11434"
  key_vault_id = azurerm_key_vault.main.id
  content_type = "text/plain"
  tags         = local.tags
  depends_on   = [azurerm_role_assignment.deployer_secrets_officer]
}

# NON-SENSITIVE - Can be moved to ConfigMap later if needed
resource "azurerm_key_vault_secret" "judge0_url" {
  name         = "judge0-url"
  value        = "http://judge0-api.clahan-academy.svc.cluster.local:2358"
  key_vault_id = azurerm_key_vault.main.id
  content_type = "text/plain"
  tags         = local.tags
  depends_on   = [azurerm_role_assignment.deployer_secrets_officer]
}

# NON-SENSITIVE - Can be moved to ConfigMap later if needed
resource "azurerm_key_vault_secret" "node_env" {
  name         = "node-env"
  value        = "production"
  key_vault_id = azurerm_key_vault.main.id
  content_type = "text/plain"
  tags         = local.tags
  depends_on   = [azurerm_role_assignment.deployer_secrets_officer]
}

# Private endpoint ensures Key Vault is only accessible within VNet
resource "azurerm_private_endpoint" "keyvault" {
  name                = "pe-keyvault"
  location            = var.location
  resource_group_name = var.resource_group_name
  subnet_id           = var.subnet_privateendpoints_id

  private_service_connection {
    name                           = "pec-keyvault"
    private_connection_resource_id = azurerm_key_vault.main.id
    subresource_names              = ["vault"]
    is_manual_connection           = false
  }

  private_dns_zone_group {
    name                 = "keyvault-dns-group"
    private_dns_zone_ids = [var.private_dns_zone_keyvault_id]
  }

  tags = local.tags
}
