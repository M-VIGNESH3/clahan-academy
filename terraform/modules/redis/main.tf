# terraform/modules/redis/main.tf
# Azure Cache for Redis - used for BullMQ job queue and session caching

locals {
  tags = merge(var.tags, {
    module = "redis"
  })

  redis_connection_string = "rediss://:${azurerm_redis_cache.main.primary_access_key}@${azurerm_redis_cache.main.hostname}:6380"
}

resource "azurerm_redis_cache" "main" {
  name                = "redis-clahan-academy"
  location            = var.location
  resource_group_name = var.resource_group_name
  capacity            = var.redis_capacity
  family              = "C"
  sku_name            = "Standard"
  minimum_tls_version = "1.2"
  enable_non_ssl_port = false

  redis_configuration {
    enable_authentication           = true
    maxmemory_policy                = "allkeys-lru"
    maxmemory_reserved              = 50
    maxfragmentationmemory_reserved = 50
  }

  patch_schedule {
    day_of_week    = "Sunday"
    start_hour_utc = 2
  }

  tags = local.tags
}

resource "azurerm_key_vault_secret" "redis_connection_string" {
  name         = "redis-connection-string"
  value        = local.redis_connection_string
  key_vault_id = var.key_vault_id
  content_type = "text/plain"
  tags         = local.tags
}

resource "azurerm_key_vault_secret" "redis_primary_key" {
  name         = "redis-primary-key"
  value        = azurerm_redis_cache.main.primary_access_key
  key_vault_id = var.key_vault_id
  content_type = "text/plain"
  tags         = local.tags
}