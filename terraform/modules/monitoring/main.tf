# terraform/modules/monitoring/main.tf

locals {
  tags = merge(var.tags, {
    module = "monitoring"
  })
}

# Central log analytics workspace for all Azure resource logs
resource "azurerm_log_analytics_workspace" "main" {
  name                = "law-clahan-academy"
  location            = var.location
  resource_group_name = var.resource_group_name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = local.tags
}

# Application Insights for application performance monitoring
resource "azurerm_application_insights" "main" {
  name                = "appi-clahan-academy"
  location            = var.location
  resource_group_name = var.resource_group_name
  workspace_id        = azurerm_log_analytics_workspace.main.id
  application_type    = "web"
  retention_in_days   = 30
  tags                = local.tags
}

# Action group for sending alert notifications to admin
resource "azurerm_monitor_action_group" "alerts" {
  name                = "ag-clahan-alerts"
  resource_group_name = var.resource_group_name
  short_name          = "clahan"

  email_receiver {
    name                    = "admin-email"
    email_address           = var.admin_email
    use_common_alert_schema = true
  }

  tags = local.tags
}
