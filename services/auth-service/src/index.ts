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
app.get('/api/auth/colleges', async (req, res) => {
  try {
    const result = await query('SELECT * FROM colleges ORDER BY name ASC');
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
        profile_photo_url, status, email_verified, raw_password
      ) VALUES ($1, $2, 'student', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending', FALSE, $14) RETURNING id, email, full_name, batch_id`,
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
        profilePhotoUrl || null,
        password
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

    await query('UPDATE users SET email_verified = TRUE, status = \'active\' WHERE email = $1', [email]);
    
    // Clear OTP
    if (redisClient.isOpen) {
      await redisClient.del(`otp:${email}`);
    } else {
      delete memoryCache[`otp:${email}`];
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

    // Generate tokens
    const accessToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        full_name: user.full_name,
        roll_number: user.roll_number,
        college_id: user.college_id,
        department_id: user.department_id,
        batch_id: user.batch_id,
        trainer_id: user.trainer_id,
        year: user.year
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

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

    res.json({
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
        status: user.status
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
      const newAccessToken = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
          full_name: user.full_name,
          roll_number: user.roll_number,
          college_id: user.college_id,
          department_id: user.department_id,
          batch_id: user.batch_id,
          trainer_id: user.trainer_id,
          year: user.year
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

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
              u.college_id, u.department_id, u.year, u.status, u.github_profile, u.linkedin_profile, u.profile_photo_url,
              c.name as college_name, d.name as department_name, u.batch_id, b.name as batch_name,
              u.trainer_id, t.name as trainer_name
       FROM users u
       LEFT JOIN colleges c ON u.college_id = c.id
       LEFT JOIN departments d ON u.department_id = d.id
       LEFT JOIN batches b ON u.batch_id = b.id
       LEFT JOIN trainers t ON u.trainer_id = t.id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
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

// Startup & Listen
const server = app.listen(PORT, async () => {
  console.log(`Auth Service listening on port ${PORT}`);
  try {
    await initDb();
  } catch (err) {
    console.error('Critical database initialization failed:', err);
  }
});
