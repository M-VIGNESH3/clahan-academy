# terraform/modules/monitoring/main.tf

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

# Alert when AKS node CPU exceeds 80%
resource "azurerm_monitor_metric_alert" "aks_cpu" {
  count               = var.aks_cluster_id != "" ? 1 : 0
  name                = "alert-aks-high-cpu"
  resource_group_name = var.resource_group_name
  scopes              = [var.aks_cluster_id]
  description         = "AKS node CPU usage is above 80%"
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"
  enabled             = true

  criteria {
    metric_namespace = "Microsoft.ContainerService/managedClusters"
    metric_name      = "node_cpu_usage_percentage"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 80
  }

  action {
    action_group_id = azurerm_monitor_action_group.alerts.id
  }

  tags = local.tags
}

# Alert when AKS node memory exceeds 85%
resource "azurerm_monitor_metric_alert" "aks_memory" {
  count               = var.aks_cluster_id != "" ? 1 : 0
  name                = "alert-aks-high-memory"
  resource_group_name = var.resource_group_name
  scopes              = [var.aks_cluster_id]
  description         = "AKS node memory usage is above 85%"
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"
  enabled             = true

  criteria {
    metric_namespace = "Microsoft.ContainerService/managedClusters"
    metric_name      = "node_memory_rss_percentage"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 85
  }

  action {
    action_group_id = azurerm_monitor_action_group.alerts.id
  }

  tags = local.tags
}

# Alert when Redis CPU exceeds 80%
resource "azurerm_monitor_metric_alert" "redis_cpu" {
  count               = var.redis_id != "" ? 1 : 0
  name                = "alert-redis-high-cpu"
  resource_group_name = var.resource_group_name
  scopes              = [var.redis_id]
  description         = "Redis CPU usage is above 80%"
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"
  enabled             = true

  criteria {
    metric_namespace = "Microsoft.Cache/Redis"
    metric_name      = "percentProcessorTime"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 80
  }

  action {
    action_group_id = azurerm_monitor_action_group.alerts.id
  }

  tags = local.tags
}

# Alert when PostgreSQL CPU exceeds 80%
resource "azurerm_monitor_metric_alert" "postgres_cpu" {
  count               = var.postgres_server_id != "" ? 1 : 0
  name                = "alert-postgres-high-cpu"
  resource_group_name = var.resource_group_name
  scopes              = [var.postgres_server_id]
  description         = "PostgreSQL CPU usage is above 80%"
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"
  enabled             = true

  criteria {
    metric_namespace = "Microsoft.DBforPostgreSQL/flexibleServers"
    metric_name      = "cpu_percent"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 80
  }

  action {
    action_group_id = azurerm_monitor_action_group.alerts.id
  }

  tags = local.tags
}
