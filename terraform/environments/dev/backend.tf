# terraform/environments/dev/backend.tf

terraform {
  backend "azurerm" {
    resource_group_name  = "rg-clahan-tfstate"
    storage_account_name = "stclahantfstate"
    container_name       = "tfstate"
    key                  = "dev/terraform.tfstate"
  }
}
