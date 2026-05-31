import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import nodemailer from 'nodemailer';
import { createClient } from 'redis';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4006;

app.use(helmet());
app.use(cors());
app.use(express.json());

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'notification-service' });
});

// SMTP Transporter configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || 'aiexamplatform123@gmail.com',
    pass: process.env.SMTP_PASS || 'zmso iaml jdkh wpxn',
  },
});

// Verify connection configuration
transporter.verify((err, success) => {
  if (err) {
    console.error('SMTP Connection error:', err.message);
  } else {
    console.log('SMTP server is ready to deliver messages.');
  }
});

// Redis Queue Setup
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379',
});

// Logs for auditing
const deliveryLogs: Array<{ email: string; event: string; timestamp: Date; success: boolean; details?: string }> = [];

app.get('/api/notifications/logs', (req, res) => {
  res.json({ logs: deliveryLogs });
});

// Email templates compiler
function compileEmail(event: string, payload: any): { subject: string; html: string } {
  const brandColor = '#4f46e5'; // Premium Indigo
  const footerHtml = `
    <div style="margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 15px; font-size: 12px; color: #6b7280; text-align: center;">
      <p>This is an automated notification from Clahan Academy. Please do not reply to this email.</p>
      <p>&copy; ${new Date().getFullYear()} Clahan Academy. All rights reserved.</p>
    </div>
  `;

  let subject = '';
  let bodyContent = '';

  switch (event) {
    case 'STUDENT_REGISTRATION':
      subject = 'Verify Your Email - Clahan Academy';
      bodyContent = `
        <h2 style="color: ${brandColor}; margin-bottom: 20px;">Welcome to Clahan Academy!</h2>
        <p>Dear <strong>${payload.fullName}</strong>,</p>
        <p>Thank you for registering. Please use the following One-Time Password (OTP) to verify your email address and activate your account:</p>
        <div style="background-color: #f3f4f6; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: ${brandColor}; border: 1px solid #e5e7eb;">
          ${payload.otp}
        </div>
        <p>This OTP is valid for 10 minutes. If you did not register for a Clahan Academy account, please ignore this email.</p>
      `;
      break;

    case 'OTP_VERIFICATION':
      subject = 'Email Successfully Verified - Clahan Academy';
      bodyContent = `
        <h2 style="color: ${brandColor}; margin-bottom: 20px;">Verification Successful</h2>
        <p>Hello,</p>
        <p>Your email address <strong>${payload.email}</strong> has been successfully verified.</p>
        <p>You can now log in to the student portal, customize your profile, and attend scheduled assessments.</p>
        <p style="margin-top: 20px;"><a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}" style="background-color: ${brandColor}; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">Go to Student Portal</a></p>
      `;
      break;

    case 'PASSWORD_RESET':
      subject = 'Password Reset Request - Clahan Academy';
      bodyContent = `
        <h2 style="color: ${brandColor}; margin-bottom: 20px;">Password Reset Request</h2>
        <p>Dear <strong>${payload.fullName}</strong>,</p>
        <p>We received a request to reset your password. Use the OTP below to set a new password:</p>
        <div style="background-color: #f3f4f6; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: ${brandColor}; border: 1px solid #e5e7eb;">
          ${payload.otp}
        </div>
        <p>This OTP is valid for 10 minutes. If you did not request a password reset, please secure your account credentials immediately.</p>
      `;
      break;

    case 'CREDENTIAL_EMAIL':
      subject = 'Your Account Credentials - Clahan Academy';
      bodyContent = `
        <h2 style="color: ${brandColor}; margin-bottom: 20px;">Your Account Credentials</h2>
        <p>Dear <strong>${payload.fullName}</strong>,</p>
        <p>An administrator has created an account for you on Clahan Academy.</p>
        <p>Here are your temporary login credentials:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; background-color: #f9fafb; width: 120px;">Email:</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb;">${payload.email}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; background-color: #f9fafb;">Password:</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb; font-family: monospace; font-size: 16px; font-weight: bold; color: #b91c1c;">${payload.password}</td>
          </tr>
        </table>
        <p>Please log in and update your password immediately for security purposes.</p>
        <p style="margin-top: 25px;"><a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}" style="background-color: ${brandColor}; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">Log In Now</a></p>
      `;
      break;

    case 'EXAM_PUBLISHED':
      subject = `New Exam Published: ${payload.examName}`;
      bodyContent = `
        <h2 style="color: ${brandColor}; margin-bottom: 20px;">New Exam Scheduled</h2>
        <p>Dear <strong>${payload.fullName}</strong>,</p>
        <p>A new exam <strong>"${payload.examName}"</strong> has been published and is scheduled for you.</p>
        <p><strong>Scheduled Time:</strong> ${new Date(payload.scheduleDate).toLocaleString()}</p>
        <p>Please review the rules and ensure your web-camera and microphone are properly configured before opening the exam environment.</p>
      `;
      break;

    case 'RESULT_PUBLISHED':
      subject = `Exam Result: ${payload.examName}`;
      const statusColor = payload.passed ? '#059669' : '#dc2626';
      bodyContent = `
        <h2 style="color: ${brandColor}; margin-bottom: 20px;">Your Exam Performance Report</h2>
        <p>Dear <strong>${payload.fullName}</strong>,</p>
        <p>Your assessment results for <strong>"${payload.examName}"</strong> are now available.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; background-color: #f9fafb;">Score Obtained:</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb;">${payload.score} / ${payload.maxScore}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; background-color: #f9fafb;">Percentage:</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">${payload.percentage}%</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; background-color: #f9fafb;">Result:</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; color: ${statusColor};">${payload.passed ? 'PASSED' : 'FAILED'}</td>
          </tr>
        </table>
        <div style="background-color: #eff6ff; border-left: 4px solid #2563eb; padding: 15px; border-radius: 4px; margin: 20px 0;">
          <h4 style="margin: 0 0 5px 0; color: #1e40af;">AI Evaluation & Feedback</h4>
          <p style="margin: 0; font-style: italic; color: #1e3a8a; font-size: 14px;">"${payload.feedback}"</p>
        </div>
      `;
      break;

    default:
      subject = 'Alert - Clahan Academy';
      bodyContent = `<p>You have a new update. Please log into the portal to check details.</p>`;
      break;
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 0;">
        <div style="max-width: 600px; margin: 40px auto; background-color: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 40px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <div style="text-align: center; border-bottom: 2px solid ${brandColor}; padding-bottom: 20px; margin-bottom: 30px;">
            <h1 style="color: ${brandColor}; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.025em;">CLAHAN ACADEMY</h1>
          </div>
          <div style="color: #374151; font-size: 16px; line-height: 1.6;">
            ${bodyContent}
          </div>
          ${footerHtml}
        </div>
      </body>
    </html>
  `;

  return { subject, html };
}

// Queue Worker
async function startWorker() {
  console.log('Notification Worker starting up...');
  try {
    await redisClient.connect();
    console.log('Worker linked with Redis Queue successfully.');
  } catch (err: any) {
    console.error('Queue connection error, worker will retry in 5s:', err.message);
    setTimeout(startWorker, 5000);
    return;
  }

  const queueKey = 'email_notification_queue';

  while (true) {
    try {
      // Blocking pop from the right side of the list
      const result = await redisClient.brPop(queueKey, 0); // 0 means wait indefinitely
      if (!result) continue;

      const jobData = JSON.parse(result.element);
      const { event, payload } = jobData;
      console.log(`Processing notification job: [${event}] for ${payload.email}`);

      const { subject, html } = compileEmail(event, payload);

      let attempts = 0;
      let sent = false;
      let lastErr = '';

      while (attempts < 3 && !sent) {
        try {
          await transporter.sendMail({
            from: process.env.SMTP_FROM || 'aiexamplatform123@gmail.com',
            to: payload.email,
            subject: subject,
            html: html,
          });
          sent = true;
          console.log(`Email dispatched successfully on attempt ${attempts + 1}`);
          deliveryLogs.push({ email: payload.email, event, timestamp: new Date(), success: true });
        } catch (err: any) {
          attempts++;
          lastErr = err.message;
          console.warn(`Attempt ${attempts} failed to send email: ${err.message}. Retrying...`);
          await new Promise((resolve) => setTimeout(resolve, 2000 * attempts)); // backoff delay
        }
      }

      if (!sent) {
        console.error(`Email delivery failed permanently after 3 attempts: ${lastErr}`);
        deliveryLogs.push({ email: payload.email, event, timestamp: new Date(), success: false, details: lastErr });
      }

    } catch (err: any) {
      console.error('Worker loop encountered error:', err.message);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

app.listen(PORT, () => {
  console.log(`Notification Service running REST API on port ${PORT}`);
  startWorker();
});
