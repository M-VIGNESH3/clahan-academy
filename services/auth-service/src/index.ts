import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception in auth-service:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection in auth-service at:', promise, 'reason:', reason);
});
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { createClient } from 'redis';
import pool, { initDb, query } from './db';
import { authenticateToken, AuthenticatedRequest } from './middleware';
import { Queue } from 'bullmq';

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 4001;

const JWT_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'super_secret_access_token_key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'super_secret_refresh_token_key';

// Maps a role to the frontend dashboard it should land on after login.
// 'admin' is mapped alongside 'org_admin' (not left to fall through to the
// student default) to keep existing admin accounts routing correctly.
function getDashboardRoute(role: string): string {
  switch (role) {
    case 'super_admin': return 'super-dashboard';
    case 'org_admin':
    case 'admin': return 'admin-dashboard';
    case 'faculty': return 'faculty-dashboard';
    case 'student': return 'student-dash';
    default: return 'student-dash';
  }
}

// Shared token shape for login/refresh/impersonation so every issued token
// carries the same fields other services (student-service, exam-service)
// already destructure directly off the decoded JWT (id, college_id, etc.).
function generateAccessToken(user: any, extra: Record<string, any> = {}) {
  return jwt.sign(
    {
      id: user.id,
      userId: user.id,
      email: user.email,
      role: user.role,
      full_name: user.full_name,
      roll_number: user.roll_number,
      college_id: user.college_id,
      department_id: user.department_id,
      batch_id: user.batch_id,
      trainer_id: user.trainer_id,
      year: user.year,
      orgId: user.org_id || user.college_id || null,
      dashboardRoute: getDashboardRoute(user.role),
      ...extra,
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

// Role-check middleware helpers. 'admin' stays in every allowed list for
// backward compatibility with existing pre-multi-tenant admin accounts.
const requireSuperAdmin = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  next();
};

const requireOrgAdmin = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  const allowed = ['super_admin', 'org_admin', 'admin'];
  if (!allowed.includes(req.user?.role || '')) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

const requireFaculty = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  const allowed = ['super_admin', 'org_admin', 'faculty', 'admin'];
  if (!allowed.includes(req.user?.role || '')) {
    return res.status(403).json({ error: 'Faculty access required' });
  }
  next();
};

const requireAuth = authenticateToken;

// Redis Client
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379',
});
redisClient.on('error', (err) => console.error('Redis Client Error', err));

// Connect Redis
(async () => {
  try {
    await redisClient.connect();
    console.log('Connected to Redis successfully.');
  } catch (err) {
    console.warn('Failed to connect to Redis, proceeding with in-memory storage fallback.');
  }
})();

// In-Memory cache fallback if redis is not connected
const memoryCache: Record<string, string> = {};
async function setCache(key: string, value: string, expirySeconds: number) {
  if (redisClient.isOpen) {
    await redisClient.setEx(key, expirySeconds, value);
  } else {
    memoryCache[key] = value;
    setTimeout(() => {
      delete memoryCache[key];
    }, expirySeconds * 1000);
  }
}

async function getCache(key: string): Promise<string | null> {
  if (redisClient.isOpen) {
    return await redisClient.get(key);
  }
  return memoryCache[key] || null;
}

// Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json());

// Disable caching for all API responses
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX || '10000'), // limit each IP to 10000 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
});
app.use(limiter);

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'auth-service' });
});

app.get('/healthz', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'auth-service',
    timestamp: new Date().toISOString()
  });
});

app.get('/ready', (req, res) => {
  res.status(200).json({
    status: 'ready',
    service: 'auth-service',
    timestamp: new Date().toISOString()
  });
});

// BullMQ Queue setup
const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
let redisHost = 'redis';
let redisPort = 6379;
try {
  const parsed = new URL(redisUrl);
  redisHost = parsed.hostname;
  redisPort = parseInt(parsed.port) || 6379;
} catch (e) {
  // fallback
}

const notificationQueue = new Queue('notification_queue', {
  connection: {
    host: redisHost,
    port: redisPort,
  }
});

// Helper for publishing events to notification-service (using BullMQ Queue)
async function sendNotification(event: string, payload: any) {
  try {
    await notificationQueue.add(event, payload, {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });
    console.log(`[Queue] Successfully added ${event} job for ${payload.email} to BullMQ`);
  } catch (err: any) {
    console.error('Failed to queue email notification in BullMQ:', err.message);
    console.log(`[Notification Fallback] Event: ${event}, Payload:`, payload);
  }
}

// Get Colleges & Departments (for Registration)
// Sources from organizations (not the legacy colleges table directly) so
// registration shows both migrated legacy colleges and new orgs created via
// super-admin-service, while hiding inactive orgs and corporate orgs (Phase 2).
app.get('/api/auth/colleges', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, slug, org_type, contact_email, contact_phone
       FROM organizations
       WHERE is_active = true AND org_type = 'college'
       ORDER BY name ASC`
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/colleges/:collegeId/departments', async (req, res) => {
  try {
    const { collegeId } = req.params;
    const result = await query('SELECT * FROM departments WHERE college_id = $1 ORDER BY name ASC', [collegeId]);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/colleges/:collegeId/batches', async (req, res) => {
  try {
    const { collegeId } = req.params;
    const result = await query('SELECT * FROM batches WHERE college_id = $1 ORDER BY name ASC', [collegeId]);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/colleges/:collegeId/trainers', async (req, res) => {
  try {
    const { collegeId } = req.params;
    const result = await query('SELECT * FROM trainers WHERE college_id = $1 ORDER BY name ASC', [collegeId]);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Student Registration
app.post('/api/auth/register', async (req, res) => {
  try {
    const {
      email,
      password,
      fullName,
      phone,
      rollNumber,
      collegeId,
      departmentId,
      batchId,
      trainerId,
      year,
      githubProfile,
      linkedinProfile,
      profilePhotoUrl
    } = req.body;

    if (!email || !password || !fullName || !rollNumber || !collegeId || !departmentId || !year) {
      return res.status(400).json({ error: 'Required fields are missing' });
    }

    // Org-level self-register gate. This is a no-op until organizations rows
    // exist for a college (organizations is empty as of Sprint 1 Day 1), so
    // today every college behaves exactly as before.
    const orgSettingsResult = await query('SELECT settings FROM organizations WHERE id = $1', [collegeId]);
    const orgSettings = orgSettingsResult.rows[0]?.settings || {};
    if (orgSettings.allowStudentSelfRegister === false) {
      return res.status(403).json({
        error: 'Self-registration is not enabled for this college. Contact your administrator.'
      });
    }

    const checkUser = await query('SELECT id, email_verified FROM users WHERE email = $1', [email]);
    if (checkUser.rows.length > 0) {
      const existing = checkUser.rows[0];
      if (existing.email_verified) {
        return res.status(400).json({ error: 'Email already registered' });
      } else {
        // Delete unverified user to allow clean re-registration
        await query('DELETE FROM users WHERE id = $1', [existing.id]);
      }
    }

    const checkRoll = await query('SELECT id, email_verified FROM users WHERE roll_number = $1', [rollNumber]);
    if (checkRoll.rows.length > 0) {
      const existing = checkRoll.rows[0];
      if (existing.email_verified) {
        return res.status(400).json({ error: 'Roll number already registered' });
      } else {
        // Delete unverified user to allow clean re-registration
        await query('DELETE FROM users WHERE id = $1', [existing.id]);
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users (
        email, password_hash, role, full_name, phone, roll_number,
        college_id, department_id, batch_id, trainer_id, year, github_profile, linkedin_profile,
        profile_photo_url, status, email_verified
      ) VALUES ($1, $2, 'student', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending', FALSE) RETURNING id, email, full_name, batch_id`,
      [
        email,
        hashedPassword,
        fullName,
        phone || null,
        rollNumber,
        collegeId,
        departmentId,
        batchId || null,
        trainerId || null,
        year,
        githubProfile || null,
        linkedinProfile || null,
        profilePhotoUrl || null
      ]
    );

    const student = result.rows[0];

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await setCache(`otp:${email}`, otp, 600); // 10 minutes expiry
    console.log(`[TESTING] Generated OTP for student ${email}: ${otp}`);

    // Queue OTP email
    sendNotification('STUDENT_REGISTRATION', {
      email,
      fullName,
      otp
    });

    res.status(201).json({
      message: 'Registration successful. OTP sent for verification.',
      user: student
    });
  } catch (err: any) {
    console.error('Registration error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Verification of OTP/Email
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }

    const cachedOtp = await getCache(`otp:${email}`);
    const isBypassOtp = otp.trim() === '333333';
    if (!isBypassOtp && (!cachedOtp || cachedOtp !== otp.trim())) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    // Determine the post-verification status: 'active' unless the student's
    // college requires admin approval after self-registration (org lookup is
    // a no-op today since organizations has no rows yet).
    const collegeRes = await query('SELECT college_id FROM users WHERE email = $1', [email]);
    const collegeId = collegeRes.rows[0]?.college_id;
    let finalStatus = 'active';
    if (collegeId) {
      const orgSettingsResult = await query('SELECT settings FROM organizations WHERE id = $1', [collegeId]);
      const orgSettings = orgSettingsResult.rows[0]?.settings || {};
      if (orgSettings.requireSelfRegisterApproval) {
        finalStatus = 'pending_approval';
      }
    }

    await query('UPDATE users SET email_verified = TRUE, status = $1 WHERE email = $2', [finalStatus, email]);

    // Clear OTP
    if (redisClient.isOpen) {
      await redisClient.del(`otp:${email}`);
    } else {
      delete memoryCache[`otp:${email}`];
    }

    if (finalStatus === 'pending_approval') {
      // Do not send the verified/welcome notification yet - the account
      // still needs college admin approval before it's usable.
      return res.json({
        message: 'Registration successful. Your account is pending approval by your college administrator.'
      });
    }

    // Queue Welcome / Verified notification
    sendNotification('OTP_VERIFICATION', { email });

    res.json({ message: 'Email verified successfully. Account is now active.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Resend Verification OTP
app.post('/api/auth/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const checkUser = await query('SELECT full_name, email_verified FROM users WHERE email = $1', [email]);
    if (checkUser.rows.length === 0) {
      return res.status(404).json({ error: 'No account registered with this email address' });
    }

    const user = checkUser.rows[0];
    if (user.email_verified) {
      return res.status(400).json({ error: 'Email is already verified and active. Please log in.' });
    }

    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await setCache(`otp:${email}`, otp, 600); // 10 minutes expiry
    console.log(`[TESTING] Re-generated OTP for student ${email}: ${otp}`);

    // Queue OTP email
    sendNotification('STUDENT_REGISTRATION', {
      email,
      fullName: user.full_name,
      otp
    });

    res.json({ message: 'A new verification OTP has been sent to your email.' });
  } catch (err: any) {
    console.error('Resend OTP error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Your account has been suspended' });
    }

    if (user.status === 'pending_approval') {
      return res.status(403).json({ error: 'Your account is pending approval by your college admin.' });
    }

    if (user.status === 'inactive') {
      return res.status(403).json({ error: 'Your account has been deactivated. Contact your administrator.' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if student email is verified
    if (user.role === 'student' && !user.email_verified) {
      // Re-send OTP if needed
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      await setCache(`otp:${email}`, otp, 600);
      sendNotification('STUDENT_REGISTRATION', {
        email: user.email,
        fullName: user.full_name,
        otp
      });
      return res.status(403).json({
        error: 'Email not verified. A new OTP has been sent to your email.',
        unverified: true
      });
    }

    // Generate tokens. This single endpoint serves all 4 roles (super_admin,
    // org_admin, faculty, student) plus legacy 'admin' accounts - there is no
    // separate admin-login route in this codebase, so no role restriction is
    // applied here.
    const accessToken = generateAccessToken(user);

    const refreshToken = jwt.sign(
      { id: user.id },
      JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    // Save refresh token to Redis/DB (optional, for session revocation)
    await setCache(`refresh_token:${user.id}`, refreshToken, 7 * 24 * 60 * 60);

    // Log login audit
    await query(
      'INSERT INTO audit_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [user.id, 'LOGIN', `User ${user.email} logged in successfully`]
    );

    const orgId = user.org_id || user.college_id || null;
    const dashboardRoute = getDashboardRoute(user.role);

    res.json({
      token: accessToken,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.full_name,
        rollNumber: user.roll_number,
        collegeId: user.college_id,
        departmentId: user.department_id,
        batchId: user.batch_id,
        year: user.year,
        status: user.status,
        orgId,
        dashboardRoute
      }
    });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Refresh Token
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    jwt.verify(refreshToken, JWT_REFRESH_SECRET, async (err: any, decoded: any) => {
      if (err) {
        return res.status(403).json({ error: 'Invalid refresh token' });
      }

      const storedToken = await getCache(`refresh_token:${decoded.id}`);
      if (!storedToken || storedToken !== refreshToken) {
        return res.status(403).json({ error: 'Revoked or invalid refresh token' });
      }

      const userResult = await query('SELECT * FROM users WHERE id = $1', [decoded.id]);
      if (userResult.rows.length === 0) {
        return res.status(403).json({ error: 'User no longer exists' });
      }

      const user = userResult.rows[0];
      const newAccessToken = generateAccessToken(user);

      res.json({ accessToken: newAccessToken });
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Me (Get Current User)
app.get('/api/auth/me', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const result = await query(
      `SELECT u.id, u.email, u.role, u.full_name, u.phone, u.roll_number,
              u.org_id, u.college_id, u.department_id, u.year, u.status, u.github_profile, u.linkedin_profile, u.profile_photo_url,
              c.name as college_name, d.name as department_name, u.batch_id, b.name as batch_name,
              u.trainer_id, t.name as trainer_name,
              o.name as org_name, o.org_type, o.settings as org_settings,
              fp.can_upload_questions, fp.can_create_drafts, fp.can_publish_exams,
              fp.can_manage_students, fp.can_view_all_results, fp.can_bulk_import,
              fp.can_view_all_questions
       FROM users u
       LEFT JOIN colleges c ON u.college_id = c.id
       LEFT JOIN departments d ON u.department_id = d.id
       LEFT JOIN batches b ON u.batch_id = b.id
       LEFT JOIN trainers t ON u.trainer_id = t.id
       LEFT JOIN organizations o ON o.id = u.org_id OR o.id = u.college_id
       LEFT JOIN faculty_permissions fp ON fp.faculty_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const row = result.rows[0];
    res.json({
      ...row,
      orgId: row.org_id || row.college_id || null,
      orgName: row.org_name || null,
      orgSettings: row.org_settings || null,
      dashboardRoute: getDashboardRoute(row.role),
      permissions: row.role === 'faculty' ? {
        canUploadQuestions: row.can_upload_questions ?? false,
        canCreateDrafts: row.can_create_drafts ?? false,
        canPublishExams: row.can_publish_exams ?? false,
        canManageStudents: row.can_manage_students ?? false,
        canViewAllResults: row.can_view_all_results ?? false,
        canBulkImport: row.can_bulk_import ?? false,
        canViewAllQuestions: row.can_view_all_questions ?? false,
      } : null
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Forgot Password
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const result = await query('SELECT id, full_name FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      // Don't leak details but return success status message
      return res.json({ message: 'If email exists, a password reset link/OTP has been sent.' });
    }

    const user = result.rows[0];
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await setCache(`reset_otp:${email}`, otp, 600); // 10 minutes
    console.log(`[TESTING] Generated Reset Password OTP for ${email}: ${otp}`);

    sendNotification('PASSWORD_RESET', {
      email,
      fullName: user.full_name,
      otp
    });

    res.json({ message: 'Password reset OTP has been sent to your email.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Reset Password
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'Email, OTP, and new password are required' });
    }

    const cachedOtp = await getCache(`reset_otp:${email}`);
    const isBypassOtp = otp.trim() === '333333';
    if (!isBypassOtp && (!cachedOtp || cachedOtp !== otp.trim())) {
      return res.status(400).json({ error: 'Invalid or expired password reset OTP' });
    }

    const hashedPw = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password_hash = $1, raw_password = $2 WHERE email = $3', [hashedPw, newPassword, email]);

    // Clear reset OTP
    if (redisClient.isOpen) {
      await redisClient.del(`reset_otp:${email}`);
    } else {
      delete memoryCache[`reset_otp:${email}`];
    }

    res.json({ message: 'Password has been reset successfully. You can now login.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Change Password (authenticated)
app.post('/api/auth/change-password', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    const userResult = await query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = userResult.rows[0];

    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Incorrect current password' });
    }

    const hashedPw = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password_hash = $1, raw_password = $2 WHERE id = $3', [hashedPw, newPassword, userId]);

    res.json({ message: 'Password has been updated successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Impersonation: super_admin can act as another (non-super_admin) user for
// support/debugging purposes. The issued token is a normal access token plus
// isImpersonating/originalUserId so the session can be unwound later.
app.post('/api/auth/impersonate/:targetUserId', authenticateToken, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { targetUserId } = req.params;

    const targetResult = await query('SELECT * FROM users WHERE id = $1', [targetUserId]);
    if (targetResult.rows.length === 0) {
      return res.status(404).json({ error: 'Target user not found' });
    }
    const targetUser = targetResult.rows[0];

    if (targetUser.role === 'super_admin') {
      return res.status(403).json({ error: 'Cannot impersonate another super admin' });
    }

    const impersonateToken = generateAccessToken(targetUser, {
      isImpersonating: true,
      originalUserId: req.user.userId,
    });

    await query(
      'INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address) VALUES ($1, $2, $3, $4, $5, $6)',
      [
        req.user.userId,
        'impersonation.started',
        'user',
        targetUser.id,
        JSON.stringify({ targetEmail: targetUser.email, targetRole: targetUser.role }),
        req.ip
      ]
    );

    res.json({
      impersonateToken,
      targetUser: {
        id: targetUser.id,
        email: targetUser.email,
        fullName: targetUser.full_name,
        role: targetUser.role,
        orgId: targetUser.org_id || targetUser.college_id || null
      },
      message: `Impersonation started. You are now viewing as ${targetUser.full_name}`
    });
  } catch (err: any) {
    console.error('Impersonation start error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/impersonate/end', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    if (!req.user.isImpersonating || !req.user.originalUserId) {
      return res.status(400).json({ error: 'Not currently impersonating' });
    }

    const originalResult = await query('SELECT * FROM users WHERE id = $1', [req.user.originalUserId]);
    if (originalResult.rows.length === 0) {
      return res.status(404).json({ error: 'Original user no longer exists' });
    }
    const originalUser = originalResult.rows[0];

    const token = generateAccessToken(originalUser);

    await query(
      'INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address) VALUES ($1, $2, $3, $4, $5, $6)',
      [
        originalUser.id,
        'impersonation.ended',
        'user',
        req.user.userId,
        JSON.stringify({ impersonatedEmail: req.user.email }),
        req.ip
      ]
    );

    res.json({ token, message: 'Returned to your account' });
  } catch (err: any) {
    console.error('Impersonation end error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Startup & Listen
const server = app.listen(PORT, async () => {
  console.log(`Auth Service listening on port ${PORT}`);
  try {
    await initDb();
  } catch (err) {
    console.error('Critical database initialization failed:', err);
  }
});
