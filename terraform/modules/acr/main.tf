# terraform/modules/acr/main.tf

terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.100"
    }
  }
}

locals {
  tags = merge(var.tags, {
    module = "acr"
  })
}

# Azure Container Registry - stores all application Docker images
resource "azurerm_container_registry" "main" {
  name                          = "acrclahanacademy"
  resource_group_name           = var.resource_group_name
  location                      = var.location
  sku                           = "Standard"
  admin_enabled                 = false
  public_network_access_enabled = false
  zone_redundancy_enabled       = false

  tags = local.tags
}

# Private endpoint - ACR only accessible within VNet
resource "azurerm_private_endpoint" "acr" {
  name                = "pe-acr"
  location            = var.location
  resource_group_name = var.resource_group_name
  subnet_id           = var.subnet_privateendpoints_id

  private_service_connection {
    name                           = "pec-acr"
    private_connection_resource_id = azurerm_container_registry.main.id
    subresource_names              = ["registry"]
    is_manual_connection           = false
  }

  private_dns_zone_group {
    name                 = "acr-dns-group"
    private_dns_zone_ids = [var.private_dns_zone_acr_id]
  }

  tags = local.tags
}
