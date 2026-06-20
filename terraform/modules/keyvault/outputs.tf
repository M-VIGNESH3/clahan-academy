# terraform/modules/keyvault/outputs.tf

output "key_vault_id" {
  description = "Resource ID of the Key Vault"
  value       = azurerm_key_vault.main.id
}

output "key_vault_uri" {
  description = "URI of the Key Vault"
  value       = azurerm_key_vault.main.vault_uri
}

output "key_vault_name" {
  description = "Name of the Key Vault"
  value       = azurerm_key_vault.main.name
}

output "jwt_access_secret" {
  description = "Auto-generated JWT access secret"
  value       = random_password.jwt_access.result
  sensitive   = true
}

output "jwt_refresh_secret" {
  description = "Auto-generated JWT refresh secret"
  value       = random_password.jwt_refresh.result
  sensitive   = true
}

output "secret_names" {
  description = "Map of logical name to Key Vault secret name"
  value = {
    database             = "db-connection-string"
    judge0_database      = "judge0-db-connection-string"
    redis                = "redis-connection-string"
    jwt_access           = "jwt-access-secret"
    jwt_refresh          = "jwt-refresh-secret"
    smtp_host            = "smtp-host"
    smtp_port            = "smtp-port"
    smtp_user            = "smtp-user"
    smtp_pass            = "smtp-pass"
    smtp_from            = "smtp-from"
    sendgrid_api_key     = "sendgrid-api-key"
    sendgrid_from        = "sendgrid-from"
    blob_storage_account = "blob-storage-account"
    blob_storage_key     = "blob-storage-key"
    snyk_token           = "snyk-token"
    sonar_token          = "sonar-token"
    frontend_url         = "frontend-url"
    ai_service_url       = "ai-service-url"
    ollama_url           = "ollama-url"
    judge0_url           = "judge0-url"
    node_env             = "node-env"
  }
}
