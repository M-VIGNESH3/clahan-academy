# terraform/modules/redis/main.tf

locals {
  tags = merge(var.tags, {
    module = "redis"
  })
}

# Azure Cache for Redis - used for BullMQ job queue and session caching
resource "azurerm_redis_cache" "main" {
  name                = "redis-clahan-academy"
  location            = var.location
  resource_group_name = var.resource_group_name
  capacity            = var.redis_capacity
  family              = "C"
  sku_name            = "Standard"
  enable_non_ssl_port = false
  minimum_tls_version = "1.2"

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

# Private endpoint - Redis only accessible within VNet
resource "azurerm_private_endpoint" "redis" {
  name                = "pe-redis"
  location            = var.location
  resource_group_name = var.resource_group_name
  subnet_id           = var.subnet_privateendpoints_id

  private_service_connection {
    name                           = "pec-redis"
    private_connection_resource_id = azurerm_redis_cache.main.id
    subresource_names              = ["redisCache"]
    is_manual_connection           = false
  }

  private_dns_zone_group {
    name                 = "redis-dns-group"
    private_dns_zone_ids = [var.private_dns_zone_redis_id]
  }

  tags = local.tags
}

locals {
  redis_connection_string = "rediss://:${azurerm_redis_cache.main.primary_access_key}@${azurerm_redis_cache.main.hostname}:6380"
}

# Store Redis SSL connection string in Key Vault
resource "azurerm_key_vault_secret" "redis_connection_string" {
  name         = "redis-connection-string"
  value        = local.redis_connection_string
  key_vault_id = var.key_vault_id
  content_type = "text/plain"
  tags         = local.tags
}

# Store Redis access key in Key Vault for emergency access
resource "azurerm_key_vault_secret" "redis_primary_key" {
  name         = "redis-primary-key"
  value        = azurerm_redis_cache.main.primary_access_key
  key_vault_id = var.key_vault_id
  content_type = "text/plain"
  tags         = local.tags
}
