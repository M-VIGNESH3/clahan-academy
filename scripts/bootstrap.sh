#!/bin/bash
set -euo pipefail

# Start timer
START_TIME=$(date +%s)

# Color variables at top
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Helper functions
info()    { echo -e "${CYAN}Ã¢â€žÂ¹Ã¯Â¸Â  $1${NC}"; }
success() { echo -e "${GREEN}Ã¢Å“â€¦ $1${NC}"; }
warn()    { echo -e "${YELLOW}Ã¢Å¡Â Ã¯Â¸Â  $1${NC}"; }
error()   { echo -e "${RED}Ã¢ÂÅ’ $1${NC}"; }

print_banner() {
  local num=$1
  local title=$2
  echo ""
  echo "Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â"
  echo "  SECTION $num: $title"
  echo "Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â"
}

# EXACT VALUES TO USE (hardcode these in the script)
SUBSCRIPTION_ID="34c41824-bb7a-4316-af37-2597f35b730e"
TENANT_ID="67e6de35-58f8-4419-b1c4-1e5d7c49e04b"
GITHUB_USER="M-VIGNESH3"
GITHUB_REPO="clahan-academy"
LOCATION="westcentralus"
TF_RESOURCE_GROUP="rg-clahan-tfstate"
TF_STORAGE_ACCOUNT="stclahantfstate"
TF_CONTAINER="tfstate"
SP_NAME="sp-github-clahan-ci"

# SECTION 1 Ã¢â‚¬â€ Prerequisites check
print_banner "1" "Prerequisites check"

check_tool() {
  local tool=$1
  local url=$2
  local version=""
  
  if ! command -v "$tool" &> /dev/null; then
    error "$tool not found. Install from $url"
    exit 1
  fi

  case "$tool" in
    az)
      version=$(az --version 2>/dev/null | head -n 1 | sed 's/azure-cli //')
      ;;
    terraform)
      version=$(terraform version 2>/dev/null | head -n 1)
      ;;
    git)
      version=$(git --version 2>/dev/null | head -n 1)
      ;;
    helm)
      version=$(helm version --short 2>/dev/null || helm version 2>/dev/null | head -n 1)
      ;;
    *)
      version="found"
      ;;
  esac
  
  success "$tool found: $version"
}

check_tool "az" "https://docs.microsoft.com/cli/azure/install-azure-cli"
check_tool "terraform" "https://developer.hashicorp.com/terraform/downloads"
check_tool "git" "https://git-scm.com/downloads"
check_tool "helm" "https://helm.sh/docs/intro/install/"

# SECTION 2 Ã¢â‚¬â€ Azure login and subscription check
print_banner "2" "Azure login and subscription check"

if ! az account show &>/dev/null; then
  info "Ã°Å¸â€Â Not logged in. Opening browser..."
  az login
fi

info "Setting subscription to $SUBSCRIPTION_ID..."
az account set --subscription "$SUBSCRIPTION_ID"

SUB_NAME=$(az account show --query name -o tsv)
info "Ã°Å¸â€œÅ’ Using subscription: $SUB_NAME ($SUBSCRIPTION_ID)"

read -p "Is this correct? (y/n): " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  error "Please set correct subscription ID in this script"
  exit 1
fi

# SECTION 3 Ã¢â‚¬â€ Create Terraform state storage
print_banner "3" "Create Terraform state storage"

# Step 3.1: Create resource group
if az group show --name "$TF_RESOURCE_GROUP" &>/dev/null; then
  echo -e "${YELLOW}Ã¢ÂÂ­Ã¯Â¸Â  Resource group $TF_RESOURCE_GROUP already exists, skipping${NC}"
else
  az group create \
    --name "$TF_RESOURCE_GROUP" \
    --location "$LOCATION" \
    --tags project=clahan-academy purpose=terraform-state
  success "Resource group created: $TF_RESOURCE_GROUP"
fi

# Step 3.2: Create storage account
if az storage account show --name "$TF_STORAGE_ACCOUNT" --resource-group "$TF_RESOURCE_GROUP" &>/dev/null; then
  echo -e "${YELLOW}Ã¢ÂÂ­Ã¯Â¸Â  Storage account $TF_STORAGE_ACCOUNT already exists, skipping${NC}"
else
  az storage account create \
    --name "$TF_STORAGE_ACCOUNT" \
    --resource-group "$TF_RESOURCE_GROUP" \
    --location "$LOCATION" \
    --sku Standard_LRS \
    --kind StorageV2 \
    --min-tls-version TLS1_2 \
    --allow-blob-public-access false \
    --tags project=clahan-academy purpose=terraform-state
  success "Storage account created: $TF_STORAGE_ACCOUNT"
fi

# Step 3.3: Create blob container
if az storage container show --name "$TF_CONTAINER" --account-name "$TF_STORAGE_ACCOUNT" &>/dev/null; then
  echo -e "${YELLOW}Ã¢ÂÂ­Ã¯Â¸Â  Container $TF_CONTAINER already exists, skipping${NC}"
else
  az storage container create \
    --name "$TF_CONTAINER" \
    --account-name "$TF_STORAGE_ACCOUNT" \
    --public-access off
  success "Blob container created: $TF_CONTAINER"
fi

# SECTION 4 Ã¢â‚¬â€ Create GitHub Actions Service Principal
print_banner "4" "Create GitHub Actions Service Principal"

# Step 4.1: Check if app registration exists
APP_ID=$(az ad app list --display-name "$SP_NAME" --query "[0].appId" -o tsv 2>/dev/null || echo "")

if [ -z "$APP_ID" ] || [ "$APP_ID" = "null" ]; then
  APP_ID=$(az ad app create --display-name "$SP_NAME" --query appId -o tsv)
  success "App registration created: $SP_NAME ($APP_ID)"
else
  echo -e "${YELLOW}Ã¢ÂÂ­Ã¯Â¸Â  App registration $SP_NAME already exists ($APP_ID)${NC}"
fi

# Step 4.2: Create service principal if not exists
SP_OBJECT_ID=$(az ad sp show --id "$APP_ID" --query id -o tsv 2>/dev/null || echo "")

if [ -z "$SP_OBJECT_ID" ] || [ "$SP_OBJECT_ID" = "null" ]; then
  az ad sp create --id "$APP_ID" >/dev/null
  SP_OBJECT_ID=$(az ad sp show --id "$APP_ID" --query id -o tsv)
  success "Service principal created"
else
  echo -e "${YELLOW}Ã¢ÂÂ­Ã¯Â¸Â  Service principal already exists${NC}"
fi

# Step 4.3: Assign Contributor role on subscription
ROLE_EXISTS=$(az role assignment list --assignee "$APP_ID" --role "Contributor" --scope "/subscriptions/$SUBSCRIPTION_ID" --query "[0].id" -o tsv 2>/dev/null || echo "")

if [ -z "$ROLE_EXISTS" ] || [ "$ROLE_EXISTS" = "null" ]; then
  az role assignment create \
    --role "Contributor" \
    --assignee "$APP_ID" \
    --scope "/subscriptions/$SUBSCRIPTION_ID" >/dev/null
  success "Contributor role assigned"
else
  echo -e "${YELLOW}Ã¢ÂÂ­Ã¯Â¸Â  Contributor role already assigned${NC}"
fi

# Step 4.4: Create federated credentials (3 total)
create_federated_credential() {
  local cred_name=$1
  local subject=$2
  
  if az ad app federated-credential show --id "$APP_ID" --federated-credential-id "$cred_name" &>/dev/null; then
    echo -e "${YELLOW}Ã¢ÂÂ­Ã¯Â¸Â  Federated credential $cred_name already exists, skipping${NC}"
  else
    local params="{\"name\":\"$cred_name\",\"issuer\":\"https://token.actions.githubusercontent.com\",\"subject\":\"$subject\",\"description\":\"Federated credential for $cred_name\",\"audiences\":[\"api://AzureADTokenExchange\"]}"
    az ad app federated-credential create --id "$APP_ID" --parameters "$params" >/dev/null
    success "Federated credential $cred_name created"
  fi
}

create_federated_credential "github-main" "repo:M-VIGNESH3/clahan-academy:ref:refs/heads/main"
create_federated_credential "github-pr" "repo:M-VIGNESH3/clahan-academy:pull_request"
create_federated_credential "github-feature" "repo:M-VIGNESH3/clahan-academy:ref:refs/heads/feature/*"

# SECTION 5 Ã¢â‚¬â€ Get deployer object ID
print_banner "5" "Get deployer object ID"
DEPLOYER_OBJECT_ID=$(az ad signed-in-user show --query id -o tsv)
info "Ã°Å¸â€˜Â¤ Deployer Object ID: $DEPLOYER_OBJECT_ID"

# SECTION 6 Ã¢â‚¬â€ Save output to file
print_banner "6" "Save output to file"

cat << EOF > .bootstrap-output.txt
============================================
BOOTSTRAP OUTPUT Ã¢â‚¬â€ DO NOT COMMIT THIS FILE
============================================
Generated: $(date)

--- Terraform State Backend ---
Resource Group:    rg-clahan-tfstate
Storage Account:   stclahantfstate
Container:         tfstate
State Key:         dev/terraform.tfstate

--- GitHub Actions Service Principal ---
Display Name:      sp-github-clahan-ci
Client ID:         $APP_ID
SP Object ID:      $SP_OBJECT_ID
Tenant ID:         67e6de35-58f8-4419-b1c4-1e5d7c49e04b
Subscription ID:   34c41824-bb7a-4316-af37-2597f35b730e

--- Deployer ---
Object ID:         $DEPLOYER_OBJECT_ID

============================================
COPY THESE TO: terraform/environments/dev/terraform.tfvars
============================================
subscription_id      = "34c41824-bb7a-4316-af37-2597f35b730e"
tenant_id            = "67e6de35-58f8-4419-b1c4-1e5d7c49e04b"
github_app_client_id = "$APP_ID"
github_sp_object_id  = "$SP_OBJECT_ID"
deployer_object_id   = "$DEPLOYER_OBJECT_ID"
============================================

COPY THESE TO: GitHub Repo Ã¢â€ â€™ Settings Ã¢â€ â€™ Secrets Ã¢â€ â€™ Actions
============================================
AZURE_CLIENT_ID        = $APP_ID
AZURE_TENANT_ID        = 67e6de35-58f8-4419-b1c4-1e5d7c49e04b
AZURE_SUBSCRIPTION_ID  = 34c41824-bb7a-4316-af37-2597f35b730e
============================================
EOF

success "Output saved to .bootstrap-output.txt"

# SECTION 7 Ã¢â‚¬â€ Print next steps
print_banner "7" "Print next steps"

echo -e "${CYAN}Ã¢â€¢â€Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢â€”${NC}"
echo -e "${CYAN}Ã¢â€¢â€˜           BOOTSTRAP COMPLETE                 Ã¢â€¢â€˜${NC}"
echo -e "${CYAN}Ã¢â€¢Å¡Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â${NC}"
echo ""
echo -e "Next steps:"
echo ""
echo -e "1. Copy values from .bootstrap-output.txt to:"
echo -e "   ${YELLOW}terraform/environments/dev/terraform.tfvars${NC}"
echo ""
echo -e "2. Fill remaining secrets in terraform.tfvars:"
echo -e "   - ${YELLOW}db_password${NC} (create a strong password)"
echo -e "   - ${YELLOW}smtp_user${NC}, ${YELLOW}smtp_pass${NC}"
echo -e "   - ${YELLOW}snyk_token${NC}, ${YELLOW}sonar_token${NC}"
echo ""
echo -e "3. Add these GitHub Secrets (repo Ã¢â€ â€™ Settings Ã¢â€ â€™ Secrets):"
echo -e "   ${GREEN}AZURE_CLIENT_ID${NC}        = $APP_ID"
echo -e "   ${GREEN}AZURE_TENANT_ID${NC}        = 67e6de35-58f8-4419-b1c4-1e5d7c49e04b"
echo -e "   ${GREEN}AZURE_SUBSCRIPTION_ID${NC}  = 34c41824-bb7a-4316-af37-2597f35b730e"
echo ""
echo -e "4. Push code to GitHub"
echo ""
echo -e "5. Go to GitHub Actions Ã¢â€ â€™ terraform-apply Ã¢â€ â€™ Run workflow"
echo ""
echo -e "6. Approve Terraform apply when prompted"
echo ""

# End timer
END_TIME=$(date +%s)
ELAPSED_TIME=$((END_TIME - START_TIME))
info "Total time elapsed: ${ELAPSED_TIME} seconds"
