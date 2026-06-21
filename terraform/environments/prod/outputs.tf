# terraform/environments/prod/outputs.tf

# Important outputs for capstone evaluation

output "aks_cluster_name" {
  description = "Name of the AKS cluster"
  value       = module.aks.cluster_name
}

output "aks_cluster_endpoint" {
  description = "Private endpoint of the AKS cluster"
  value       = module.aks.cluster_private_fqdn
}

output "aks_get_credentials_command" {
  description = "Command to get AKS credentials"
  value       = "az aks get-credentials --resource-group rg-clahan-prod --name aks-clahan-prod"
}

output "acr_login_server" {
  description = "ACR login server URL"
  value       = module.acr.acr_login_server
}

output "key_vault_uri" {
  description = "Key Vault URI"
  value       = module.keyvault.key_vault_uri
}

output "key_vault_name" {
  description = "Key Vault name"
  value       = module.keyvault.key_vault_name
}

output "postgres_fqdn" {
  description = "PostgreSQL server FQDN"
  value       = module.postgres.server_fqdn
}

output "redis_hostname" {
  description = "Redis cache hostname"
  value       = module.redis.redis_hostname
}

output "log_analytics_workspace_id" {
  description = "Log Analytics workspace ID"
  value       = module.monitoring.log_analytics_workspace_id
}

output "app_insights_name" {
  description = "Application Insights resource name"
  value       = module.monitoring.app_insights_name
}

output "function_app_name" {
  description = "Azure Function App name"
  value       = module.functions.function_app_name
}

output "jump_vm_name" {
  description = "Jump VM name for Bastion access"
  value       = module.jumpvm.vm_name
}

output "jump_vm_private_ip" {
  description = "Jump VM private IP address"
  value       = module.jumpvm.vm_private_ip
}

output "application_url" {
  description = "Application URL"
  value       = "https://clahaanacademy.online"
}

output "identity_client_ids" {
  description = "Managed identity client IDs per service (for Helm values)"
  value       = module.identity.identity_client_ids
}

output "oidc_issuer_url" {
  description = "AKS OIDC issuer URL for workload identity"
  value       = module.aks.oidc_issuer_url
}

output "environment" {
  description = "Current environment"
  value       = "production"
}

output "estimated_monthly_cost" {
  description = "Estimated monthly cost for PRODUCTION"
  value = {
    aks_app_nodes   = "~$560 USD (Standard_D8s_v3 x2)"
    aks_ai_node     = "~$280 USD (Standard_D8s_v3 x1)"
    postgres        = "~$180 USD (GP_Standard_D4s_v3)"
    redis           = "~$100 USD (Standard C2)"
    app_gateway     = "~$35 USD (WAF v2)"
    bastion         = "~$140 USD (Basic)"
    jump_vm         = "~$30 USD (Standard_B2s)"
    storage         = "~$10 USD"
    key_vault       = "~$5 USD"
    functions       = "~$0 USD (Consumption)"
    monitoring      = "~$10 USD"
    total_estimate  = "~$1350 USD per month"
    note            = "Production HA setup with geo-redundant DB"
  }
}
