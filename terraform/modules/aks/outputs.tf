# terraform/modules/aks/outputs.tf

output "cluster_id" {
  description = "ID of the AKS cluster"
  value       = azurerm_kubernetes_cluster.main.id
}

output "cluster_name" {
  description = "Name of the AKS cluster"
  value       = azurerm_kubernetes_cluster.main.name
}

output "cluster_fqdn" {
  description = "FQDN of the AKS cluster"
  value       = azurerm_kubernetes_cluster.main.fqdn
}

output "cluster_private_fqdn" {
  description = "Private FQDN of the AKS cluster (null for public cluster)"
  value       = try(azurerm_kubernetes_cluster.main.private_fqdn, null)
}

output "kube_config_raw" {
  description = "Raw kubeconfig for cluster access"
  value       = azurerm_kubernetes_cluster.main.kube_config_raw
  sensitive   = true
}

output "oidc_issuer_url" {
  description = "OIDC issuer URL for workload identity"
  value       = azurerm_kubernetes_cluster.main.oidc_issuer_url
}

output "kubelet_identity_object_id" {
  description = "Object ID of kubelet managed identity"
  value       = azurerm_kubernetes_cluster.main.kubelet_identity[0].object_id
}

output "kubelet_identity_client_id" {
  description = "Client ID of kubelet managed identity"
  value       = azurerm_kubernetes_cluster.main.kubelet_identity[0].client_id
}

output "cluster_identity_principal_id" {
  description = "Principal ID of AKS user assigned identity"
  value       = azurerm_user_assigned_identity.aks.principal_id
}

output "agic_identity_object_id" {
  description = "Object ID of AGIC managed identity"
  value       = azurerm_kubernetes_cluster.main.ingress_application_gateway[0].ingress_application_gateway_identity[0].object_id
}

output "key_vault_secrets_provider_client_id" {
  description = "Client ID of Key Vault secrets provider identity"
  value       = azurerm_kubernetes_cluster.main.key_vault_secrets_provider[0].secret_identity[0].client_id
}

output "key_vault_secrets_provider_object_id" {
  description = "Object ID of Key Vault secrets provider identity"
  value       = azurerm_kubernetes_cluster.main.key_vault_secrets_provider[0].secret_identity[0].object_id
}

output "node_resource_group" {
  description = "Name of the auto-generated node resource group"
  value       = azurerm_kubernetes_cluster.main.node_resource_group
}

output "ingress_application_gateway_id" {
  description = "ID of the Application Gateway created by AGIC"
  value       = azurerm_kubernetes_cluster.main.ingress_application_gateway[0].effective_gateway_id
}

output "aks_identity_principal_id" {
  description = "Principal ID of the AKS user assigned identity"
  value       = azurerm_user_assigned_identity.aks.principal_id
}

output "aks_identity_id" {
  description = "Resource ID of the AKS user assigned identity"
  value       = azurerm_user_assigned_identity.aks.id
}