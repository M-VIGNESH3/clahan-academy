terraform {
  backend "azurerm" {
    resource_group_name  = "rg-clahan-tfstate"
    storage_account_name = "stclahanv2tfstate"
    container_name       = "tfstate"
    key                  = "dev/terraform.tfstate"
  }
}