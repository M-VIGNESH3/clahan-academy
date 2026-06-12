# Setup & Deployment Guide: Launching a New VM from Scratch

This document details the step-by-step pipeline to provision a brand-new Virtual Machine (VM / EC2 instance running Ubuntu 22.04 LTS or 24.04 LTS) and deploy the entire containerized Clahan Academy stack.

---

## 1. Network & Port Requirements

Ensure the following inbound rules are allowed in your cloud security groups or VM firewall:

| Port | Protocol | Purpose | Access Level |
| :--- | :--- | :--- | :--- |
| **22** | TCP | SSH Administration | Restricted (your IP) |
| **80** | TCP | HTTP web access & SSL handshake | Public |
| **443** | TCP | HTTPS secure web access | Public |

---

## 2. Step-by-Step System Provisioning

### Step A: Install Docker & Docker Compose
On your fresh Ubuntu VM, execute the following commands to install the container runtime engine:

```bash
# Update local package definitions and install utility tools
sudo apt update
sudo apt install -y curl apt-transport-https ca-certificates gnupg lsb-release

# Add Docker's official GPG encryption key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Register the stable Docker repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine and the modern Docker Compose plugin
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add your user to the docker group (avoids typing 'sudo' for every docker command)
sudo usermod -aG docker $USER
newgrp docker
```

---

### Step B: Configure Host Cgroups (Critical for Compiler Sandbox)
On modern Linux systems running systemd version 255+ and Linux Kernel 6.x+, the host defaults to isolated cgroup namespaces. The sandboxed compiler runtime (Judge0) requires direct cgroup sharing to register and enforce compile memory/CPU limits. Without this config, code evaluation submissions will result in `Internal Error`.

1. Create or edit the Docker daemon configuration file:
   ```bash
   sudo nano /etc/docker/daemon.json
   ```

2. Add the host cgroup namespace sharing directive:
   ```json
   {
     "default-cgroupns-mode": "host"
   }
   ```

3. Save the file and reload the Docker system service:
   ```bash
   sudo systemctl restart docker
   ```

---

### Step C: Prep Workspace and Dummy Configuration Files
1. Clone the codebase and move into the project root directory:
   ```bash
   git clone <your-repository-git-url> /home/ubuntu/clahan-academy
   cd /home/ubuntu/clahan-academy
   ```

2. Create an empty `judge0.conf` configuration placeholder. This file is mounted inside the compiler container volume, and Docker will crash if the file does not exist on the host system:
   ```bash
   touch judge0.conf
   ```

---

## 3. Environment Variables Configuration

Open `docker-compose.yml` or create a `.env` file in the root directory. Replace placeholders with active credentials:

### A. Core SMTP Configurations (Node.js APIs)
Used by `auth-service` and `notification-service` to deliver verification OTP emails:
* **`SMTP_HOST`**: `smtp.gmail.com`
* **`SMTP_PORT`**: `587` (TLS) or `465` (SSL)
* **`SMTP_USER`**: `your-system-email@gmail.com`
* **`SMTP_PASS`**: `your-16-character-gmail-app-password`

### B. Twilio SendGrid API Integration
To fall back or switch notification channels to SendGrid, configure:
* **`SENDGRID_API_KEY`**: `SG.your_sendgrid_api_key_here`
* **`SENDGRID_FROM`**: `noreply@YOUR_DOMAIN.com`

---

## 4. Launching the Docker Stack

Build the custom Node.js/Python images and run all services in detached background mode:

```bash
docker compose up -d --build
```

Verify the health state of all containers:
```bash
docker compose ps
```

### Pull the AI LLM Model (Ollama)
The Ollama container boots up empty. Run the following command on the host to pull and register the lightweight local LLM model (`phi3`):
```bash
docker exec -it clahan-ollama ollama run phi3
```
*Press `Ctrl + D` once the download is complete to close the interactive terminal.*

---

## 5. Nginx Reverse Proxy & HTTPS Certificate Configuration

HTTPS is required by browsers to access student cameras, microphones, and screens.

### Step A: Install Nginx and Let's Encrypt Certbot
```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

### Step B: Create Domain Server Configurations
Create a server block configuration for your domain:
```bash
sudo nano /etc/nginx/sites-available/YOUR_DOMAIN.com
```

Paste the configuration structure below, replacing `YOUR_DOMAIN.com` with your active domain name:

```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN.com www.YOUR_DOMAIN.com;

    # Set maximum payload size to support base64 proctor webcam image uploads
    client_max_body_size 50M;

    # 1. Main Application Reverse Proxy
    location / {
        proxy_pass http://127.0.0.1:5173; # Proxy to clahan-frontend-service
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 2. Prometheus Dashboard Reverse Proxy
    location /prometheus/ {
        proxy_pass http://127.0.0.1:9090/prometheus/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 3. Grafana Analytics Reverse Proxy
    location /grafana/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Step C: Enable and Test Nginx
```bash
# Link to active sites configuration
sudo ln -s /etc/nginx/sites-available/YOUR_DOMAIN.com /etc/nginx/sites-enabled/

# Verify configuration logic syntax
sudo nginx -t

# Reload server configurations
sudo systemctl reload nginx
```

### Step D: Register SSL/TLS Certificate
Request a Let's Encrypt SSL certificate. Certbot will automatically edit your Nginx configuration to support HTTPS on port 443 and enforce HTTP-to-HTTPS redirection:
```bash
sudo certbot --nginx -d YOUR_DOMAIN.com -d www.YOUR_DOMAIN.com
```

---

## 6. System Monitoring Dashboard Verification

Verify that your system telemetry pipelines are active:
* **Prometheus Targets**: Visit `https://YOUR_DOMAIN.com/prometheus/` to review target endpoints (APIs and node exports).
* **Grafana Dashboards**: Visit `https://YOUR_DOMAIN.com/grafana/` to view real-time system resources and traffic charts.
