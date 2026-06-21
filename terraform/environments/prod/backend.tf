# terraform/environments/prod/backend.tf

terraform {
  backend "azurerm" {
    resource_group_name  = "rg-clahan-tfstate"
    storage_account_name = "stclahantfstate"
    container_name       = "tfstate"
    key                  = "prod/terraform.tfstate"
  }
}
