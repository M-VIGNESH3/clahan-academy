# Setup Guide: Launching a New VM with HTTPS

This guide walks you through setting up your application on a brand new Virtual Machine (VM) and configuring **HTTPS (SSL/TLS)**. HTTPS is required for modern web browsers to allow camera, audio, and screen sharing permissions in the online exam environment.

---

## Prerequisites
1. A fresh Virtual Machine (Ubuntu 22.04 LTS or 24.04 LTS recommended) with a public IP address.
2. A registered domain name (e.g., `smartpg.online`) pointed to your VM's public IP address via an **A Record** in your DNS settings.
3. Open ports **80** (HTTP) and **443** (HTTPS) in your VM's firewall/security group settings.

---

## Step 1: Install Docker and Docker Compose
On your new VM, run the following commands to install Docker:

```bash
# Update package list and install requirements
sudo apt update
sudo apt install -y curl apt-transport-https ca-certificates gnupg lsb-release

# Add Docker's official GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Set up the stable repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine and Compose
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Verify installation
sudo docker --version
sudo docker compose version
```

---

## Step 2: Choose Your HTTPS Configuration Option

Choose **either** Option A (easiest, inside Docker) or Option B (standard reverse proxy) below:

### Option A: Automatic HTTPS via Caddy (Inside Docker Compose)
Caddy automatically handles Let's Encrypt certificates, renewal, and routing inside the Docker container. No host setup is required.

#### 1. Modify `docker-compose.yml`
* Under the `frontend-service` section, update the `ports` mapping to only expose the port internally:
  ```yaml
    frontend-service:
      build:
        context: ./frontend-service
        dockerfile: Dockerfile
      container_name: clahan-frontend-service
      ports:
        - "5173"  # Removed the host IP/Port binding
  ```

* Add the `caddy` service under your `services` list:
  ```yaml
    caddy:
      image: caddy:2-alpine
      container_name: clahan-caddy
      restart: always
      ports:
        - "80:80"
        - "443:443"
      volumes:
        - ./Caddyfile:/etc/caddy/Caddyfile
        - caddy_data:/data
        - caddy_config:/config
      depends_on:
        - frontend-service
  ```

* Define the Caddy volumes under the `volumes:` block at the very bottom:
  ```yaml
  volumes:
    pgdata:
    redisdata:
    caddy_data:
    caddy_config:
  ```

#### 2. Create the `Caddyfile`
In the root directory of your project (where `docker-compose.yml` resides), create a file named `Caddyfile` with the following content:

```caddy
smartpg.online, www.smartpg.online {
    reverse_proxy frontend-service:5173
}
```
*(Replace `smartpg.online` with your active domain name).*

---

### Option B: Nginx on the VM Host Operating System
This option keeps your `docker-compose.yml` configuration untouched (where `frontend-service` binds to `127.0.0.1:5173`), and sets up a reverse proxy with SSL certificate management on the host system.

#### 1. Install Nginx and Certbot
On the host operating system of your VM, run:
```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

#### 2. Configure the Nginx Site
Create a configuration file for your domain:
```bash
sudo nano /etc/nginx/sites-available/smartpg.online
```

Paste the following configuration:
```nginx
server {
    listen 80;
    server_name smartpg.online www.smartpg.online;

    client_max_body_size 50M;

    # Main Frontend & APIs
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

    # Prometheus Proxy
    location /prometheus/ {
        proxy_pass http://127.0.0.1:9090/prometheus/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Grafana Proxy
    location /grafana/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the configuration and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/smartpg.online /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 3. Provision Let's Encrypt SSL Certificates
Run Certbot to request certificates and automatically configure HTTPS redirects:
```bash
sudo certbot --nginx -d smartpg.online -d www.smartpg.online
```
Follow the prompts (enter your email, accept the license, and opt to redirect all HTTP traffic to HTTPS).

---

## Step 3: Start the Application Containers

From the root directory containing your source code and `docker-compose.yml`, run:

```bash
# Build and launch all services in background mode
docker compose up -d --build
```

Verify that all containers are healthy:
```bash
docker compose ps
```

You can now visit `https://smartpg.online` (or your domain name) in your browser!
