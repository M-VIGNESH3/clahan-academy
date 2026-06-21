# terraform/modules/aks/outputs.tf

output "cluster_id" {
  value = azurerm_kubernetes_cluster.main.id
}
output "cluster_name" {
  value = azurerm_kubernetes_cluster.main.name
}
output "cluster_fqdn" {
  value = azurerm_kubernetes_cluster.main.fqdn
}
output "cluster_private_fqdn" {
  value = try(azurerm_kubernetes_cluster.main.private_fqdn, null)
}
output "kube_config_raw" {
  value     = azurerm_kubernetes_cluster.main.kube_config_raw
  sensitive = true
}
output "oidc_issuer_url" {
  value = azurerm_kubernetes_cluster.main.oidc_issuer_url
}
output "kubelet_identity_object_id" {
  value = azurerm_kubernetes_cluster.main.kubelet_identity[0].object_id
}
output "kubelet_identity_client_id" {
  value = azurerm_kubernetes_cluster.main.kubelet_identity[0].client_id
}
output "cluster_identity_principal_id" {
  value = azurerm_user_assigned_identity.aks.principal_id
}
output "key_vault_secrets_provider_client_id" {
  value = azurerm_kubernetes_cluster.main.key_vault_secrets_provider[0].secret_identity[0].client_id
}
output "key_vault_secrets_provider_object_id" {
  value = azurerm_kubernetes_cluster.main.key_vault_secrets_provider[0].secret_identity[0].object_id
}
output "node_resource_group" {
  value = azurerm_kubernetes_cluster.main.node_resource_group
}
output "aks_identity_id" {
  value = azurerm_user_assigned_identity.aks.id
}
output "aks_identity_principal_id" {
  value = azurerm_user_assigned_identity.aks.principal_id
}