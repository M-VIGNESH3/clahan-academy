# terraform/environments/dev/terraform.tfvars

# ================================================================
# Clahan Academy V2 - Dev Environment Variables
# ================================================================
# SECURITY: This file is gitignored. Never commit real values.
# Copy values from .bootstrap-output.txt after running bootstrap.sh
# ================================================================

# Azure Identity (from bootstrap output)
subscription_id      = "34c41824-bb7a-4316-af37-2597f35b730e"
tenant_id            = "67e6de35-58f8-4419-b1c4-1e5d7c49e04b"
github_app_client_id = "PLACEHOLDER_FROM_BOOTSTRAP_OUTPUT"
github_sp_object_id  = "PLACEHOLDER_FROM_BOOTSTRAP_OUTPUT"
deployer_object_id   = "PLACEHOLDER_FROM_BOOTSTRAP_OUTPUT"

# GitHub
github_token = "PLACEHOLDER_YOUR_GITHUB_PAT"

# Admin
admin_email = "admin@clahaanacademy.online"

# SMTP Email Configuration
smtp_host = "smtp.gmail.com"
smtp_port = "587"
smtp_user = "aiexamplatform123@gmail.com"
smtp_pass = "PLACEHOLDER_YOUR_APP_PASSWORD"
smtp_from = "aiexamplatform123@gmail.com"

# SendGrid (optional - leave empty if not using)
sendgrid_api_key = ""
sendgrid_from    = ""

# Security Scanning Tokens
snyk_token  = "PLACEHOLDER_YOUR_SNYK_TOKEN"
sonar_token = "PLACEHOLDER_YOUR_SONAR_TOKEN"
