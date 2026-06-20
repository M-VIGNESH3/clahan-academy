# terraform/modules/redis/outputs.tf

output "redis_id" {
  description = "Resource ID of the Redis cache"
  value       = azurerm_redis_cache.main.id
}

output "redis_hostname" {
  description = "Hostname of the Redis cache"
  value       = azurerm_redis_cache.main.hostname
}

output "redis_ssl_port" {
  description = "SSL port of the Redis cache"
  value       = azurerm_redis_cache.main.ssl_port
}

output "redis_primary_key" {
  description = "Primary access key for Redis"
  value       = azurerm_redis_cache.main.primary_access_key
  sensitive   = true
}

output "redis_connection_string" {
  description = "Full SSL connection string for Redis"
  value       = local.redis_connection_string
  sensitive   = true
}
