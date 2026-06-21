# terraform/modules/jumpvm/main.tf
# Jump VM for secure management access via Azure Bastion

locals {
  tags = merge(var.tags, {
    module = "jumpvm"
  })

  cloud_init_script = <<-EOF
    #!/bin/bash
    set -e
    apt-get update -y
    apt-get upgrade -y
    curl -sL https://aka.ms/InstallAzureCLIDeb | bash
    az aks install-cli
    curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
    curl -sSL -o /usr/local/bin/argocd \
      https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
    chmod +x /usr/local/bin/argocd
    apt-get install -y gnupg software-properties-common
    wget -O- https://apt.releases.hashicorp.com/gpg | \
      gpg --dearmor | \
      tee /usr/share/keyrings/hashicorp-archive-keyring.gpg
    echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] \
      https://apt.releases.hashicorp.com $(lsb_release -cs) main" | \
      tee /etc/apt/sources.list.d/hashicorp.list
    apt-get update && apt-get install -y terraform
    apt-get install -y postgresql-client redis-tools
    echo "Jump VM setup complete" >> /var/log/jumpvm-setup.log
  EOF
}

resource "random_password" "vm_admin" {
  length           = 24
  special          = true
  override_special = "!#$%&*-_=+?"
  min_lower        = 4
  min_upper        = 4
  min_numeric      = 4
  min_special      = 2
}

resource "azurerm_network_interface" "main" {
  name                = "nic-vm-clahan-mgmt"
  location            = var.location
  resource_group_name = var.resource_group_name

  ip_configuration {
    name                          = "internal"
    subnet_id                     = var.subnet_mgmt_id
    private_ip_address_allocation = "Dynamic"
  }

  tags = local.tags
}

resource "azurerm_linux_virtual_machine" "main" {
  name                            = "vm-clahan-mgmt"
  resource_group_name             = var.resource_group_name
  location                        = var.location
  size                            = "Standard_D2s_v3"
  admin_username                  = "clahanadmin"
  admin_password                  = random_password.vm_admin.result
  disable_password_authentication = false

  network_interface_ids = [azurerm_network_interface.main.id]

  os_disk {
    name                 = "osdisk-vm-clahan-mgmt"
    caching              = "ReadWrite"
    storage_account_type = "Standard_LRS"
    disk_size_gb         = 64
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-jammy"
    sku       = "22_04-lts-gen2"
    version   = "latest"
  }

  identity {
    type = "SystemAssigned"
  }

  custom_data = base64encode(local.cloud_init_script)
  tags        = local.tags
}

resource "azurerm_role_assignment" "vm_aks_admin" {
  role_definition_name = "Azure Kubernetes Service Cluster Admin Role"
  principal_id         = azurerm_linux_virtual_machine.main.identity[0].principal_id
  scope                = var.aks_cluster_id

  lifecycle {
    ignore_changes = all
  }
}

resource "azurerm_role_assignment" "vm_keyvault_reader" {
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_linux_virtual_machine.main.identity[0].principal_id
  scope                = var.key_vault_id

  lifecycle {
    ignore_changes = all
  }
}

resource "azurerm_key_vault_secret" "vm_admin_password" {
  name         = "jumpvm-admin-password"
  value        = random_password.vm_admin.result
  key_vault_id = var.key_vault_id
  content_type = "text/plain"
  tags         = local.tags

  depends_on = [azurerm_role_assignment.vm_keyvault_reader]
}