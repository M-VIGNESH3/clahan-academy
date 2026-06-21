// functions/ResourceHealthMonitor/index.ts

import { AzureFunction, Context } from "@azure/functions";
import * as nodemailer from "nodemailer";
import * as https from "https";
import * as http from "http";

interface HealthResult {
  service: string;
  url: string;
  status: "healthy" | "degraded" | "down";
  statusCode: number;
  responseTimeMs: number;
  error?: string;
}

/**
 * Checks a specific HTTP/HTTPS endpoint and measures the response time.
 */
function checkEndpoint(name: string, urlStr: string): Promise<HealthResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const client = urlStr.startsWith("https") ? https : http;
    const timeoutMs = 10000; // 10 seconds timeout

    let isResolved = false;

    const req = client.get(urlStr, (res) => {
      res.on("data", () => {
        // Consume response data to free up memory
      });

      res.on("end", () => {
        if (isResolved) return;
        isResolved = true;

        const responseTime = Date.now() - startTime;
        const statusCode = res.statusCode || 0;

        let status: "healthy" | "degraded" | "down" = "down";
        if (statusCode < 400) {
          status = responseTime >= 3000 ? "degraded" : "healthy";
        }

        resolve({
          service: name,
          url: urlStr,
          status,
          statusCode,
          responseTimeMs: responseTime
        });
      });
    });

    req.on("error", (err) => {
      if (isResolved) return;
      isResolved = true;
      resolve({
        service: name,
        url: urlStr,
        status: "down",
        statusCode: 0,
        responseTimeMs: Date.now() - startTime,
        error: err.message
      });
    });

    req.setTimeout(timeoutMs, () => {
      if (isResolved) return;
      isResolved = true;
      req.destroy();
      resolve({
        service: name,
        url: urlStr,
        status: "down",
        statusCode: 0,
        responseTimeMs: Date.now() - startTime,
        error: `Request timed out after ${timeoutMs}ms`
      });
    });
  });
}

/**
 * Sends an email alert notifying the administrator of service issues.
 */
async function sendAlertEmail(context: Context, results: HealthResult[], issues: HealthResult[]): Promise<void> {
  const host = process.env.SMTP_HOST;
  const portStr = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = process.env.ADMIN_EMAIL || "admin@clahaanacademy.online";

  if (!host || !portStr || !user || !pass) {
    context.log.error("SMTP credentials (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS) are missing. Cannot send alert email.");
    return;
  }

  const port = parseInt(portStr, 10);
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass
    }
  });

  const emailSubject = `⚠️ Clahan Academy Health Alert - ${issues.length} service(s) down`;

  let htmlBody = `
    <h2>Clahan Academy Health Report</h2>
    <p>A health check has detected that some application services are experiencing issues. Details below:</p>
    <table border="1" cellpadding="10" cellspacing="0" style="border-collapse: collapse; font-family: sans-serif; width: 100%;">
      <thead>
        <tr style="background-color: #f2f2f2;">
          <th>Service</th>
          <th>URL</th>
          <th>Status</th>
          <th>HTTP Code</th>
          <th>Response Time</th>
          <th>Notes / Errors</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const r of results) {
    let statusColor = "#28a745"; // Green
    if (r.status === "degraded") statusColor = "#ffc107"; // Yellow/Orange
    if (r.status === "down") statusColor = "#dc3545"; // Red

    htmlBody += `
      <tr>
        <td><strong>${r.service}</strong></td>
        <td><a href="${r.url}">${r.url}</a></td>
        <td style="color: white; background-color: ${statusColor}; font-weight: bold; text-align: center;">${r.status.toUpperCase()}</td>
        <td style="text-align: center;">${r.statusCode || "N/A"}</td>
        <td style="text-align: center;">${r.responseTimeMs} ms</td>
        <td style="color: #6c757d;">${r.error || "None"}</td>
      </tr>
    `;
  }

  htmlBody += `
      </tbody>
    </table>
    <br/>
    <p>Visit the management dashboard or jump VM to check service logs.</p>
    <hr/>
    <p style="font-size: 0.8em; color: #888;">This alert was generated automatically by the Clahan Academy ResourceHealthMonitor Azure Function.</p>
  `;

  try {
    await transporter.sendMail({
      from: `"Clahan Health Monitor" <${user}>`,
      to,
      subject: emailSubject,
      html: htmlBody
    });
    context.log(`Alert email sent successfully to ${to}`);
  } catch (err: any) {
    context.log.error(`Failed to send alert email: ${err.message}`);
  }
}

/**
 * Main timer triggered function entry point.
 */
const timerTrigger: AzureFunction = async function (context: Context, timer: any): Promise<void> {
  context.log("Executing Clahan Academy ResourceHealthMonitor...");

  const endpoints = [
    { name: "Auth Service", url: "https://clahaanacademy.online/api/auth/health" },
    { name: "Exam Service", url: "https://clahaanacademy.online/api/exams/health" },
    { name: "Student Service", url: "https://clahaanacademy.online/api/student/health" },
    { name: "Proctoring Service", url: "https://clahaanacademy.online/api/proctor/health" }
  ];

  try {
    const checks = endpoints.map((ep) => checkEndpoint(ep.name, ep.url));
    const results = await Promise.all(checks);

    const issues = results.filter((r) => r.status === "down" || r.status === "degraded");

    context.log("=== HEALTH MONITOR REPORT ===");
    for (const r of results) {
      context.log(`Service: ${r.service} | Status: ${r.status} | Code: ${r.statusCode} | Time: ${r.responseTimeMs}ms | Error: ${r.error || "none"}`);
    }

    if (issues.length > 0) {
      context.log(`Issues detected on ${issues.length} service(s). Triggering alerts...`);
      await sendAlertEmail(context, results, issues);
    } else {
      context.log("All services healthy. No alert required.");
    }
  } catch (err: any) {
    context.log.error(`Error during health monitor execution: ${err.message}`);
  }
};

export default timerTrigger;
