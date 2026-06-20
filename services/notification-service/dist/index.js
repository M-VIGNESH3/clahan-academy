"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const nodemailer_1 = __importDefault(require("nodemailer"));
const bullmq_1 = require("bullmq");
const mail_1 = __importDefault(require("@sendgrid/mail"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception in notification-service:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection in notification-service at:', promise, 'reason:', reason);
});
const app = (0, express_1.default)();
const PORT = process.env.PORT || 4006;
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'notification-service' });
});
// Test SMTP connectivity diagnostic endpoint
app.get('/api/notifications/test-smtp', (req, res) => {
    transporter.verify((err, success) => {
        if (err) {
            res.status(500).json({
                success: false,
                message: 'SMTP Connection failed',
                error: err.message,
                smtpDetails: {
                    host: smtpHost,
                    port: smtpPort,
                    user: smtpUser,
                    passMasked: smtpPass ? '***' + smtpPass.slice(-4) : 'none'
                }
            });
        }
        else {
            res.json({
                success: true,
                message: 'SMTP connection established successfully! Ready to deliver verification codes.',
                smtpDetails: {
                    host: smtpHost,
                    port: smtpPort,
                    user: smtpUser
                }
            });
        }
    });
});
// SMTP Transporter configuration
const smtpHost = (process.env.SMTP_HOST || 'smtp.gmail.com').replace(/^"|"$/g, '');
const smtpPort = parseInt((process.env.SMTP_PORT || '587').replace(/^"|"$/g, ''));
const smtpUser = (process.env.SMTP_USER || 'aiexamplatform123@gmail.com').replace(/^"|"$/g, '');
const smtpPass = (process.env.SMTP_PASS || process.env.SMTP_PASSWORD || 'zmso iaml jdkh wpxn').replace(/^"|"$/g, '');
const smtpFrom = (process.env.SMTP_FROM || 'aiexamplatform123@gmail.com').replace(/^"|"$/g, '');
const transporter = nodemailer_1.default.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
        user: smtpUser,
        pass: smtpPass,
    },
});
// Verify connection configuration
transporter.verify((err, success) => {
    if (err) {
        console.error('SMTP Connection error:', err.message);
    }
    else {
        console.log('SMTP server is ready to deliver messages.');
    }
});
// SendGrid & SMTP Configuration
const sendGridKey = (process.env.SENDGRID_API_KEY || '').trim().replace(/^"|"$/g, '').trim();
const sendGridFrom = (process.env.SENDGRID_FROM || 'noreply@clahanacademy.com').trim().replace(/^"|"$/g, '').trim();
const isSendGridConfigured = sendGridKey && sendGridKey.startsWith('SG.') && sendGridKey !== 'your_sendgrid_api_key_here';
if (isSendGridConfigured) {
    mail_1.default.setApiKey(sendGridKey);
    console.log('SendGrid API key configured. Email deliveries will run via SendGrid API.');
}
else {
    console.log('SendGrid API key not configured or invalid placeholder. Falling back to SMTP/Console log.');
}
// Logs for auditing
const deliveryLogs = [];
app.get('/api/notifications/logs', (req, res) => {
    res.json({ logs: deliveryLogs });
});
// Email templates compiler
function compileEmail(event, payload) {
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
// BullMQ Worker setup
const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
let redisHost = 'redis';
let redisPort = 6379;
try {
    const parsed = new URL(redisUrl);
    redisHost = parsed.hostname;
    redisPort = parseInt(parsed.port) || 6379;
}
catch (e) {
    // fallback
}
const worker = new bullmq_1.Worker('notification_queue', async (job) => {
    const { name: event, data: payload } = job;
    console.log(`[Queue] Processing job [${job.id}]: [${event}] for ${payload.email}`);
    if (!payload || !payload.email) {
        throw new Error('Skipping notification job: missing payload email');
    }
    const { subject, html } = compileEmail(event, payload);
    let sentMethod = null;
    let errors = [];
    if (isSendGridConfigured) {
        try {
            await mail_1.default.send({
                to: payload.email,
                from: sendGridFrom,
                subject: subject,
                html: html,
            });
            sentMethod = 'SendGrid';
            console.log(`[SendGrid] Email dispatched successfully to ${payload.email}`);
        }
        catch (err) {
            console.warn(`[SendGrid] Failed to send email to ${payload.email}:`, err.message);
            errors.push(`SendGrid: ${err.message}`);
        }
    }
    if (!sentMethod) {
        if (isSendGridConfigured) {
            console.log(`Attempting SMTP fallback delivery for ${payload.email}...`);
        }
        let sentSmtp = false;
        let smtpErr = '';
        try {
            await transporter.sendMail({
                from: smtpFrom,
                to: payload.email,
                subject: subject,
                html: html,
            });
            sentSmtp = true;
            sentMethod = 'SMTP';
            console.log(`[SMTP] Email dispatched successfully to ${payload.email}`);
        }
        catch (err) {
            smtpErr = err.message;
            errors.push(`SMTP: ${err.message}`);
        }
        if (!sentSmtp) {
            // Fail-safe fallback to console logging
            console.log('\n--- [NOTIFICATION FALLBACK CONSOLE LOG] ---');
            console.log(`Event: ${event}`);
            console.log(`Recipient: ${payload.email}`);
            console.log(`Subject: ${subject}`);
            if (payload.otp) {
                console.log(`OTP Code: ${payload.otp}`);
            }
            if (payload.password) {
                console.log(`Temporary Password: ${payload.password}`);
            }
            console.log('-------------------------------------------\n');
            throw new Error(`Email delivery failed (SendGrid/SMTP). Errors: ${errors.join(' | ')}`);
        }
    }
    return { channel: sentMethod };
}, {
    connection: {
        host: redisHost,
        port: redisPort,
    },
    concurrency: 20, // Process up to 20 emails in parallel
});
worker.on('completed', (job, result) => {
    deliveryLogs.push({
        email: job.data.email,
        event: job.name,
        timestamp: new Date(),
        success: true,
        details: `Delivered via ${result?.channel || 'SMTP/SendGrid'}`
    });
    console.log(`[Queue] Job [${job.id}] completed successfully.`);
});
worker.on('failed', (job, err) => {
    console.error(`[Queue] Job [${job?.id}] failed: ${err.message}`);
    if (job) {
        let debugDetails = err.message;
        if (job.data.otp) {
            debugDetails += ` [DEBUG OTP: ${job.data.otp}]`;
        }
        if (job.data.password) {
            debugDetails += ` [DEBUG Password: ${job.data.password}]`;
        }
        deliveryLogs.push({
            email: job.data.email,
            event: job.name,
            timestamp: new Date(),
            success: false,
            details: debugDetails
        });
    }
});
app.listen(PORT, () => {
    console.log(`Notification Service running REST API on port ${PORT}`);
});
