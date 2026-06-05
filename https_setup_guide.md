# HTTPS (SSL/TLS) Setup Guide for Clahan Academy

This guide details three options to configure HTTPS (SSL/TLS) on your server with your domain `clahanacademy.com`. Enabling HTTPS is **mandatory** for browsers to allow camera/microphone access in the online examination proctored environment.

---

## Option A: Cloudflare Proxy (Recommended - Simplest & Safest)

If you manage your domain name through Cloudflare (which is completely free), you can enable HTTPS with a single click. Cloudflare handles the SSL certificates, renews them automatically, and provides DDoS protection.

### Step 1: Change Nameservers
1. Sign up for a free account at [Cloudflare](https://www.cloudflare.com/).
2. Add your domain `clahanacademy.com`.
3. Cloudflare will provide you with two nameservers. Log in to your domain registrar (e.g., GoDaddy, Namecheap, Hostinger) and replace the existing nameservers with Cloudflare's nameservers.

### Step 2: Configure DNS and Proxy
1. In the Cloudflare dashboard, go to **DNS > Records**.
2. Add an **A Record**:
   - **Name**: `@` (represents your root domain `clahanacademy.com`)
   - **IPv4 address**: Your server's public IP address
   - **Proxy status**: **Proxied** (Orange cloud icon enabled)
3. (Optional) Add a CNAME record for `www` pointing to `@` (with Proxy status: **Proxied**).

### Step 3: Enable SSL/TLS Encryption
1. Go to **SSL/TLS > Overview** in the Cloudflare sidebar.
2. Select **Flexible** mode. This encrypts traffic between the student's browser and Cloudflare.
3. Go to **SSL/TLS > Edge Certificates** and enable **Always Use HTTPS** to automatically redirect any HTTP traffic to secure HTTPS.

---

## Option B: Nginx Reverse Proxy with Certbot (Standard VPS Setup)

If you prefer self-hosting certificates directly on your server, you can set up Nginx as a reverse proxy on the host operating system, and use Certbot (Let's Encrypt) to provision certificates.

### Step 1: Install Nginx and Certbot
On an Ubuntu/Debian server, run:
```bash
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx -y
```

### Step 2: Configure Nginx Host Site
Create a new configuration file for your site:
```bash
sudo nano /etc/nginx/sites-available/clahanacademy.com
```

Paste the following configuration (redirecting host traffic to your running Docker frontend container):
```nginx
server {
    listen 80;
    server_name clahanacademy.com www.clahanacademy.com;

    # Maximum upload size for assets (CSV, profiles)
    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:5173; # Proxies to clahan-frontend-service
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the configuration and reload Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/clahanacademy.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 3: Obtain SSL Certificate
Run Certbot to automatically obtain and configure the certificates:
```bash
sudo certbot --nginx -d clahanacademy.com -d www.clahanacademy.com
```
- Enter your email address.
- Agree to the Terms of Service.
- Choose whether to automatically redirect HTTP traffic to HTTPS (Select **Redirect**).

Certbot will automatically install a systemd timer to renew the certificate every 90 days.

---

## Option C: Automatic HTTPS via Caddy (Inside Docker Compose)

Caddy is a modern web server that handles automatic HTTPS certificates internally. You can swap out the ports in your setup to route through a Caddy container.

### Step 1: Update `docker-compose.yml`
Expose host ports `80` and `443` directly to a lightweight Caddy container instead of routing them to `frontend-service` directly.

Add Caddy to your services list:
```yaml
  caddy:
    image: caddy:2-alpine
    container_name: clahan-caddy
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
*(Make sure to add `caddy_data` and `caddy_config` under the `volumes:` block at the bottom of the file).*

### Step 2: Create a `Caddyfile`
In the root directory of your project, create a file named `Caddyfile`:

```caddy
clahanacademy.com, www.clahanacademy.com {
    reverse_proxy frontend-service:5173
}
```

When you run `docker-compose up -d`, Caddy will detect the domain names, contact Let's Encrypt to retrieve SSL certificates, and keep them renewed automatically.

---

## Next Steps: Update Application Configuration

Once HTTPS is working for your domain:
1. Open your `docker-compose.yml` file.
2. Locate the `notification-service` environment variables.
3. Change the `FRONTEND_URL` variable to use your HTTPS domain:
   ```yaml
   FRONTEND_URL: https://clahanacademy.com
   ```
4. Restart the containers to apply the change:
   ```bash
   docker compose down && docker compose up -d
   ```
