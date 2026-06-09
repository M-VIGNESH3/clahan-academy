project_name                = "clahan"
environment                 = "dev"
owner                       = "vignesh"
admin_email                 = "admin@example.com"

primary_location            = "centralindia"
dr_location                 = "southeastasia"

postgres_sku                = "B_Standard_B2s"
postgres_storage_mb         = 32768

redis_sku                   = "Basic"
redis_family                = "C"
redis_capacity              = 0

appgw_capacity              = 1
enable_dr                   = false
enable_waf                  = false

container_apps_min_replicas = 0
container_apps_max_replicas = 1

smtp_host                   = "smtp.gmail.com"
smtp_port                   = "587"
