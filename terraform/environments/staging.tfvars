project_name                = "clahan"
environment                 = "staging"
owner                       = "vignesh"
admin_email                 = "admin@example.com"

primary_location            = "centralindia"
dr_location                 = "southeastasia"

postgres_sku                = "GP_Standard_D2s_v3"
postgres_storage_mb         = 65536

redis_sku                   = "Standard"
redis_family                = "C"
redis_capacity              = 1

appgw_capacity              = 2
enable_dr                   = true
enable_waf                  = true

container_apps_min_replicas = 1
container_apps_max_replicas = 2

smtp_host                   = "smtp.gmail.com"
smtp_port                   = "587"
