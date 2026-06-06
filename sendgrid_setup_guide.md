# Twilio SendGrid Setup Guide

This guide details the steps to set up a Twilio SendGrid account, verify your sending identity, generate a secure API Key, and configure it for the Clahan Academy assessment system.

---

## Step 1: Sign Up & Verify Sender Identity

1. **Create an Account**:
   * Navigate to [sendgrid.com](https://sendgrid.com/) and sign up for a free or transactional plan (the free tier includes 100 emails/day).
2. **Sender Authentication**:
   * Before SendGrid allows you to send emails, you must verify your identity. In the SendGrid dashboard, go to **Settings > Sender Authentication**.
   * Choose one of the two options:
     * **Single Sender Verification** (Easiest for testing): Verify a single email address (e.g., `noreply@yourdomain.com`). SendGrid sends a validation email to this address containing a confirmation link.
     * **Domain Authentication** (Recommended for production): Verify your entire DNS domain (e.g., adding MX/TXT records to your domain provider). This signs emails with DKIM/SPF, preventing them from landing in spam folders.

---

## Step 2: Generate a SendGrid API Key

1. Log into the SendGrid dashboard.
2. Go to **Settings > API Keys** on the left menu.
3. Click the **Create API Key** button in the top right.
4. Fill in the details:
   * **API Key Name**: `Clahan Academy Notification Service`
   * **API Key Permissions**: 
     * Select **Restricted Access** (Recommended for security).
     * Scroll down to **Mail Send** and slide it to **Full Access**. (Leave other settings disabled to prevent leak risks).
5. Click **Create & View**.
6. **Copy the generated key immediately** (starts with `SG.`). SendGrid will only display it once for security reasons.

---

## Step 3: Configure Environment Variables

You must supply the API key and verified sender email to the `notification-service`.

### Option A: Local Dev Configuration
If you run the microservices locally via `npm run dev`:
1. Create or open the `.env` file in the **`notification-service`** directory.
2. Add the following lines:
   ```env
   SENDGRID_API_KEY=SG.your_actual_api_key_here
   SENDGRID_FROM=your_verified_sender_email@domain.com
   ```
3. Restart the `notification-service` server.

### Option B: Docker Compose Configuration
If you deploy using `docker-compose.yml`:
1. Open a terminal on your host machine.
2. Set the environment variables on the host system:
   * **Windows (PowerShell)**:
     ```powershell
     $env:SENDGRID_API_KEY="SG.your_actual_api_key_here"
     $env:SENDGRID_FROM="your_verified_sender_email@domain.com"
     ```
   * **Windows (CMD)**:
     ```cmd
     set SENDGRID_API_KEY=SG.your_actual_api_key_here
     set SENDGRID_FROM=your_verified_sender_email@domain.com
     ```
   * **Linux/macOS**:
     ```bash
     export SENDGRID_API_KEY="SG.your_actual_api_key_here"
     export SENDGRID_FROM="your_verified_sender_email@domain.com"
     ```
3. Launch the container stack:
   ```bash
   docker-compose up --build -d
   ```
   Docker Compose will automatically inject these variables into the `notification-service` container as configured.

---

## Step 4: Verification & Logs

1. Register a new user on the frontend or trigger an OTP resend.
2. Check the logs of `notification-service`:
   * Successful delivery will log: `[SendGrid] Email dispatched successfully to student@domain.com`
   * Visit **`http://localhost:4006/api/notifications/logs`** to verify delivery receipts.
