# terraform/modules/aks/main.tf
# AKS cluster (public control plane for now, easier to stabilize)
# AI workloads isolated using taints/tolerations on separate node pool

locals {
  tags = merge(var.tags, {
    module = "aks"
  })
}

# User assigned identity for AKS
resource "azurerm_user_assigned_identity" "aks" {
  name                = "mi-aks-clahan-academy"
  resource_group_name = var.resource_group_name
  location            = var.location
  tags                = local.tags
}

# AKS identity needs Network Contributor on VNet
resource "azurerm_role_assignment" "aks_vnet" {
  role_definition_name = "Network Contributor"
  principal_id         = azurerm_user_assigned_identity.aks.principal_id
  scope                = var.vnet_id

  lifecycle {
    ignore_changes = all
  }
}

# AKS cluster
resource "azurerm_kubernetes_cluster" "main" {
  name                       = var.cluster_name
  location                   = var.location
  resource_group_name        = var.resource_group_name
  kubernetes_version         = var.kubernetes_version
  dns_prefix                 = var.dns_prefix
  sku_tier                   = "Standard"
  private_cluster_enabled    = false

  depends_on = [
    azurerm_role_assignment.aks_vnet
  ]

  default_node_pool {
    name                        = "app"
    node_count                  = var.app_node_count
    vm_size                     = var.app_node_vm_size
    os_disk_size_gb             = 128
    vnet_subnet_id              = var.subnet_aks_id
    enable_auto_scaling         = true
    min_count                   = var.app_min_count
    max_count                   = var.app_max_count
    max_pods                    = 50
    temporary_name_for_rotation = "apptemp"

    node_labels = {
      pool        = "app"
      environment = "dev"
    }

    upgrade_settings {
      max_surge = "10%"
    }
  }

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.aks.id]
  }

  network_profile {
    network_plugin    = "azure"
    network_policy    = "calico"
    service_cidr      = "10.1.0.0/16"
    dns_service_ip    = "10.1.0.10"
    load_balancer_sku = "standard"
    outbound_type     = "loadBalancer"
  }

  oms_agent {
    log_analytics_workspace_id = var.log_analytics_workspace_id
  }

  key_vault_secrets_provider {
    secret_rotation_enabled  = true
    secret_rotation_interval = "2m"
  }

  ingress_application_gateway {
    gateway_name = "agw-clahan-academy"
    subnet_id    = var.subnet_appgw_id
  }

  workload_identity_enabled         = true
  oidc_issuer_enabled               = true
  azure_policy_enabled              = true
  role_based_access_control_enabled = true

  tags = local.tags
}

# Dedicated AI node pool
resource "azurerm_kubernetes_cluster_node_pool" "ai" {
  name                  = "ai"
  kubernetes_cluster_id = azurerm_kubernetes_cluster.main.id
  vm_size               = "Standard_D8s_v3"
  node_count            = 1
  vnet_subnet_id        = var.subnet_aks_id
  enable_auto_scaling   = false
  os_disk_size_gb       = 256
  max_pods              = 30

  node_labels = {
    pool             = "ai"
    allow-privileged = "true"
  }

  node_taints = [
    "dedicated=ai:NoSchedule"
  ]

  tags = local.tags
}

# Allow AKS kubelet to pull images from ACR
resource "azurerm_role_assignment" "aks_acr_pull" {
  role_definition_name             = "AcrPull"
  principal_id                     = azurerm_kubernetes_cluster.main.kubelet_identity[0].object_id
  scope                            = var.acr_id
  skip_service_principal_aad_check = true

  lifecycle {
    ignore_changes = all
  }
}

# Allow AGIC to manage Application Gateway
resource "azurerm_role_assignment" "agic_rg_contributor" {
  role_definition_name             = "Contributor"
  principal_id                     = azurerm_kubernetes_cluster.main.ingress_application_gateway[0].ingress_application_gateway_identity[0].object_id
  scope                            = var.resource_group_id
  skip_service_principal_aad_check = true

  lifecycle {
    ignore_changes = all
  }
}