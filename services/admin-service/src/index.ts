import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Pool, types } from 'pg';
types.setTypeParser(1114, (str) => new Date(str.replace(' ', 'T') + 'Z'));
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import { createClient } from 'redis';
import { Queue } from 'bullmq';

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 4002;

const JWT_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'super_secret_access_token_key';

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception in admin-service:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection in admin-service at:', promise, 'reason:', reason);
});

// Database Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@postgres:5432/clahan_academy?sslmode=disable',
  max: 50,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
pool.on('error', (err) => {
  console.error('Unexpected error on idle pg client in admin-service:', err);
});
const query = (text: string, params?: any[]) => pool.query(text, params);

// Migrate database on startup
(async () => {
  try {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS raw_password VARCHAR(255)');
    console.log('Successfully ran database migrations in admin-service');
  } catch (err: any) {
    console.error('Error running migrations in admin-service:', err.message);
  }
})();

// Redis client for sending notification events
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379',
});
redisClient.on('error', (err) => console.error('Redis Client Error', err));
(async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    console.warn('Redis offline in Admin Service, notifications will log to console.');
  }
})();

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

async function queueNotification(event: string, payload: any) {
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
    console.error('Queue notification error in BullMQ:', err.message);
    console.log(`[Notification Fallback] Event: ${event}, Payload:`, payload);
  }
}

async function queueNotificationsBulk(event: string, payloads: any[]) {
  try {
    if (payloads.length > 0) {
      await notificationQueue.addBulk(
        payloads.map(payload => ({
          name: event,
          data: payload,
          opts: {
            attempts: 5,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
            removeOnComplete: true,
            removeOnFail: false,
          }
        }))
      );
      console.log(`[Queue] Successfully added bulk ${event} jobs (Count: ${payloads.length}) to BullMQ`);
    }
  } catch (err: any) {
    console.error('Queue bulk notification error in BullMQ:', err.message);
    console.log(`[Notification Fallback] Bulk Event: ${event}, Count: ${payloads.length}`);
  }
}

// Security Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Disable caching for all API responses
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || '10000'),
  validate: { trustProxy: false },
});
app.use(limiter);

// JWT Middleware
interface AuthenticatedRequest extends express.Request {
  user?: {
    id: string;
    email: string;
    role: 'admin' | 'student';
  };
}

function authenticateAdmin(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Auth token required' });

  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err || decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Requires admin privileges' });
    }
    req.user = decoded;
    next();
  });
}

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'admin-service' });
});

// --- Colleges ---
app.get('/api/admin/colleges', authenticateAdmin, async (req, res) => {
  try {
    const result = await query('SELECT * FROM colleges ORDER BY name ASC');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/colleges', authenticateAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'College name is required' });

    const result = await query(
      'INSERT INTO colleges (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *',
      [name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/colleges/:id', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    
    // Delete exams associated with college
    await client.query('DELETE FROM exams WHERE college_id = $1', [id]);
    
    // Delete batches associated with college
    await client.query('DELETE FROM batches WHERE college_id = $1', [id]);
    
    // Delete trainers associated with college
    await client.query('DELETE FROM trainers WHERE college_id = $1', [id]);
    
    // Delete departments associated with college
    await client.query('DELETE FROM departments WHERE college_id = $1', [id]);
    
    // Set college_id, department_id, batch_id to NULL for students of this college
    await client.query('UPDATE users SET college_id = NULL, department_id = NULL, batch_id = NULL WHERE college_id = $1', [id]);
    
    // Finally delete the college itself
    await client.query('DELETE FROM colleges WHERE id = $1', [id]);
    
    await client.query('COMMIT');
    res.json({ message: 'College and all associated data deleted successfully' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// --- Departments ---
app.get('/api/admin/departments', authenticateAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT d.*, c.name as college_name 
      FROM departments d 
      LEFT JOIN colleges c ON d.college_id = c.id 
      ORDER BY c.name ASC, d.name ASC
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/departments', authenticateAdmin, async (req, res) => {
  try {
    const { collegeId, name } = req.body;
    if (!collegeId || !name) return res.status(400).json({ error: 'College ID and department name are required' });

    const result = await query(
      'INSERT INTO departments (college_id, name) VALUES ($1, $2) ON CONFLICT (college_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING *',
      [collegeId, name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/departments/:id', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    await client.query('DELETE FROM exams WHERE department_id = $1', [id]);
    await client.query('UPDATE users SET department_id = NULL WHERE department_id = $1', [id]);
    await client.query('DELETE FROM departments WHERE id = $1', [id]);
    await client.query('COMMIT');
    res.json({ message: 'Department and associated data deleted successfully' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// --- Batches ---
app.get('/api/admin/batches', authenticateAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT b.*, c.name as college_name 
      FROM batches b 
      LEFT JOIN colleges c ON b.college_id = c.id 
      ORDER BY c.name ASC, b.name ASC
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/colleges/:collegeId/batches', authenticateAdmin, async (req, res) => {
  try {
    const { collegeId } = req.params;
    const result = await query('SELECT * FROM batches WHERE college_id = $1 ORDER BY name ASC', [collegeId]);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/colleges/:collegeId/batches', authenticateAdmin, async (req, res) => {
  try {
    const { collegeId } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Batch name is required' });

    const result = await query(
      'INSERT INTO batches (college_id, name) VALUES ($1, $2) ON CONFLICT (college_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING *',
      [collegeId, name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/batches/:id', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    await client.query('UPDATE exams SET batch_id = NULL WHERE batch_id = $1', [id]);
    await client.query('UPDATE users SET batch_id = NULL WHERE batch_id = $1', [id]);
    await client.query('UPDATE trainers SET batch_id = NULL WHERE batch_id = $1', [id]);
    await client.query('DELETE FROM batches WHERE id = $1', [id]);
    await client.query('COMMIT');
    res.json({ message: 'Batch and references deleted successfully' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// --- Students ---
app.get('/api/admin/students', authenticateAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT u.id, u.email, u.full_name, u.phone, u.roll_number, u.year, u.status, u.email_verified, u.created_at,
             c.name as college_name, d.name as department_name, b.name as batch_name, u.college_id, u.department_id, u.batch_id,
             u.trainer_id, t.name as trainer_name, u.raw_password
      FROM users u
      LEFT JOIN colleges c ON u.college_id = c.id
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN batches b ON u.batch_id = b.id
      LEFT JOIN trainers t ON u.trainer_id = t.id
      WHERE u.role = 'student'
      ORDER BY u.created_at DESC
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Manual Student Creation
app.post('/api/admin/students', authenticateAdmin, async (req, res) => {
  try {
    const { email, fullName, phone, rollNumber, collegeId, departmentId, batchId, year } = req.body;
    if (!email || !fullName || !rollNumber || !collegeId || !departmentId || !year) {
      return res.status(400).json({ error: 'Required fields missing' });
    }

    const exists = await query('SELECT id FROM users WHERE email = $1 OR roll_number = $2', [email, rollNumber]);
    if (exists.rows.length > 0) {
      return res.status(400).json({ error: 'Email or Roll number already registered' });
    }

    // Auto-generate safe password
    const plainPassword = 'Clahan@' + Math.floor(1000 + Math.random() * 9000).toString();
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const result = await query(
      `INSERT INTO users (
        email, password_hash, role, full_name, phone, roll_number,
        college_id, department_id, batch_id, year, status, email_verified, raw_password
      ) VALUES ($1, $2, 'student', $3, $4, $5, $6, $7, $8, $9, 'active', TRUE, $10) RETURNING *`,
      [email, hashedPassword, fullName, phone || null, rollNumber, collegeId, departmentId, batchId || null, year, plainPassword]
    );

    // Queue notification email
    queueNotification('CREDENTIAL_EMAIL', {
      email,
      fullName,
      password: plainPassword
    });

    res.status(201).json({
      student: result.rows[0],
      generatedPassword: plainPassword
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Template Download (CSV format)
app.get('/api/admin/students/template', (req, res) => {
  const csvTemplate = 'Full Name,Email,Phone,Roll Number,College,Department,Year\nJohn Doe,john@example.com,9876543210,CSE101,ABC Engineering College,CSE,3rd Year\nJane Smith,jane@example.com,9876543211,ECE101,ABC Engineering College,ECE,4th Year';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=students_template.csv');
  res.status(200).send(csvTemplate);
});

// CSV/Excel Student Bulk Import
app.post('/api/admin/students/import', authenticateAdmin, async (req, res) => {
  try {
    const { csvContent } = req.body;
    if (!csvContent) {
      return res.status(400).json({ error: 'CSV data is required' });
    }
    let sanitizedContent = csvContent;
    if (sanitizedContent.startsWith('\ufeff')) {
      sanitizedContent = sanitizedContent.slice(1);
    }

    const lines = sanitizedContent.split(/\r?\n/).map((l: string) => l.trim()).filter((l: string) => l.length > 0);
    if (lines.length <= 1) {
      return res.status(400).json({ error: 'No student data rows found' });
    }

    let delimiter = ',';
    if (lines[0].includes(';')) {
      delimiter = ';';
    }

    const header = lines[0].split(delimiter).map((h: string) => h.trim().toLowerCase());
    const dataRows = lines.slice(1);

    const importSummary = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Cache colleges & departments to avoid constant DB calls
    const colMap: Record<string, string> = {};
    const deptMap: Record<string, string> = {}; // key: "collegeId:deptName"

    const cols = await query('SELECT * FROM colleges');
    for (const c of cols.rows) {
      colMap[c.name.toLowerCase()] = c.id;
    }
    const depts = await query('SELECT * FROM departments');
    for (const d of depts.rows) {
      deptMap[`${d.college_id}:${d.name.toLowerCase()}`] = d.id;
    }

    const notificationPayloads: any[] = [];

    for (const row of dataRows) {
      const parts = row.split(delimiter).map((p: string) => p.trim());
      if (parts.length < 7) {
        importSummary.failed++;
        importSummary.errors.push(`Row has missing fields: ${row}`);
        continue;
      }

      const fullName = parts[0];
      const email = parts[1];
      const phone = parts[2];
      const rollNumber = parts[3];
      const colName = parts[4];
      const deptName = parts[5];
      const year = parts[6];

      if (!fullName || !email || !rollNumber || !colName || !deptName || !year) {
        importSummary.failed++;
        importSummary.errors.push(`Required columns empty in row: ${row}`);
        continue;
      }

      try {
        // Resolve College ID
        let collegeId = colMap[colName.toLowerCase()];
        if (!collegeId) {
          const newCol = await query('INSERT INTO colleges (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id', [colName]);
          collegeId = newCol.rows[0].id;
          colMap[colName.toLowerCase()] = collegeId;
        }

        // Resolve Department ID
        let departmentId = deptMap[`${collegeId}:${deptName.toLowerCase()}`];
        if (!departmentId) {
          const newDept = await query('INSERT INTO departments (college_id, name) VALUES ($1, $2) ON CONFLICT (college_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id', [collegeId, deptName]);
          departmentId = newDept.rows[0].id;
          deptMap[`${collegeId}:${deptName.toLowerCase()}`] = departmentId;
        }

        // Check if student exists
        const check = await query('SELECT id FROM users WHERE email = $1 OR roll_number = $2', [email, rollNumber]);
        if (check.rows.length > 0) {
          importSummary.failed++;
          importSummary.errors.push(`User already exists (email: ${email} or roll: ${rollNumber})`);
          continue;
        }

        // Auto-generate credentials
        const plainPassword = 'Clahan@' + Math.floor(1000 + Math.random() * 9000).toString();
        const hashedPassword = await bcrypt.hash(plainPassword, 10);

        await query(
          `INSERT INTO users (
            email, password_hash, role, full_name, phone, roll_number,
            college_id, department_id, year, status, email_verified, raw_password
          ) VALUES ($1, $2, 'student', $3, $4, $5, $6, $7, $8, 'active', TRUE, $9)`,
          [email, hashedPassword, fullName, phone || null, rollNumber, collegeId, departmentId, year, plainPassword]
        );

        // Queue credentials email
        notificationPayloads.push({
          email,
          fullName,
          password: plainPassword
        });

        importSummary.success++;
      } catch (err: any) {
        importSummary.failed++;
        importSummary.errors.push(`Database error for row [${row}]: ${err.message}`);
      }
    }

    if (notificationPayloads.length > 0) {
      queueNotificationsBulk('CREDENTIAL_EMAIL', notificationPayloads);
    }

    res.json({ message: 'Import completed', summary: importSummary });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Reset Password / View Password / Resend credentials
app.post('/api/admin/students/:id/reset-password', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const plainPassword = 'Clahan@' + Math.floor(1000 + Math.random() * 9000).toString();
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const check = await query('UPDATE users SET password_hash = $1, raw_password = $2 WHERE id = $3 RETURNING email, full_name', [hashedPassword, plainPassword, id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const student = check.rows[0];

    // Notify student
    queueNotification('CREDENTIAL_EMAIL', {
      email: student.email,
      fullName: student.full_name,
      password: plainPassword
    });

    res.json({ message: 'Password reset successful', generatedPassword: plainPassword });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/students/:id/resend-credentials', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const plainPassword = 'Clahan@' + Math.floor(1000 + Math.random() * 9000).toString();
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const check = await query('UPDATE users SET password_hash = $1, raw_password = $2 WHERE id = $3 RETURNING email, full_name', [hashedPassword, plainPassword, id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    const student = check.rows[0];

    queueNotification('CREDENTIAL_EMAIL', {
      email: student.email,
      fullName: student.full_name,
      password: plainPassword
    });

    res.json({ message: 'Credentials resend successful. New credentials generated.', generatedPassword: plainPassword });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Set password for all students
app.post('/api/admin/students/set-password-all', authenticateAdmin, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await query(
      `UPDATE users 
       SET password_hash = $1, raw_password = $2 
       WHERE role = 'student' 
       RETURNING id, email, full_name`,
      [hashedPassword, password]
    );
    res.json({ 
      message: `Successfully set password for all ${result.rows.length} students.`, 
      updatedCount: result.rows.length 
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/students/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM users WHERE id = $1 AND role = \'student\'', [id]);
    res.json({ message: 'Student deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/students/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, email, phone, rollNumber, collegeId, departmentId, batchId, year, status, trainerId } = req.body;
    
    const check = await query('SELECT id, batch_id, trainer_id FROM users WHERE id = $1 AND role = \'student\'', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const hasBatchId = 'batchId' in req.body;
    const hasTrainerId = 'trainerId' in req.body;

    const result = await query(
      `UPDATE users
       SET full_name = COALESCE($1, full_name),
           email = COALESCE($2, email),
           phone = COALESCE($3, phone),
           roll_number = COALESCE($4, roll_number),
           college_id = COALESCE($5, college_id),
           department_id = COALESCE($6, department_id),
           batch_id = $7,
           year = COALESCE($8, year),
           status = COALESCE($9, status),
           trainer_id = $10
       WHERE id = $11 RETURNING *`,
      [
        fullName,
        email,
        phone,
        rollNumber,
        collegeId,
        departmentId,
        hasBatchId ? (batchId || null) : check.rows[0].batch_id,
        year,
        status,
        hasTrainerId ? (trainerId || null) : check.rows[0].trainer_id,
        id
      ]
    );

    res.json({ message: 'Student updated successfully', student: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Metrics & Analytics ---
app.get('/api/admin/dashboard/metrics', authenticateAdmin, async (req, res) => {
  try {
    const totalStudents = await query("SELECT count(*) FROM users WHERE role = 'student'");
    const totalExams = await query("SELECT count(*) FROM exams");
    const liveExams = await query("SELECT count(*) FROM exams WHERE is_published = TRUE AND schedule_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')");
    const completedExams = await query(`
      SELECT count(distinct exam_id) FROM exam_attempts WHERE status = 'completed'
    `);
    
    const scores = await query("SELECT score, percentage, passed FROM exam_attempts WHERE status = 'completed'");
    let averageScore = 0;
    let passCount = 0;
    let failCount = 0;

    if (scores.rows.length > 0) {
      const sum = scores.rows.reduce((acc, row) => acc + parseFloat(row.percentage), 0);
      averageScore = sum / scores.rows.length;
      passCount = scores.rows.filter(r => r.passed).length;
      failCount = scores.rows.length - passCount;
    }

    const totalAttempts = scores.rows.length;
    const passPercentage = totalAttempts > 0 ? (passCount / totalAttempts) * 100 : 0;
    const failPercentage = totalAttempts > 0 ? (failCount / totalAttempts) * 100 : 0;

    res.json({
      totalStudents: parseInt(totalStudents.rows[0].count),
      totalExams: parseInt(totalExams.rows[0].count),
      liveExams: parseInt(liveExams.rows[0].count),
      completedExams: parseInt(completedExams.rows[0].count),
      averageScore: parseFloat(averageScore.toFixed(2)),
      passPercentage: parseFloat(passPercentage.toFixed(2)),
      failPercentage: parseFloat(failPercentage.toFixed(2))
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/analytics', authenticateAdmin, async (req, res) => {
  try {
    const scores = await query("SELECT percentage, passed FROM exam_attempts WHERE status = 'completed'");
    let passCount = 0;
    let failCount = 0;
    let avgScore = 0;

    if (scores.rows.length > 0) {
      passCount = scores.rows.filter(r => r.passed).length;
      failCount = scores.rows.length - passCount;
      avgScore = scores.rows.reduce((acc, r) => acc + parseFloat(r.percentage), 0) / scores.rows.length;
    }

    // Top scorers
    const topScorers = await query(`
      SELECT u.full_name, u.roll_number, d.name as department_name, e.name as exam_name, ea.percentage
      FROM exam_attempts ea
      JOIN users u ON ea.student_id = u.id
      JOIN exams e ON ea.exam_id = e.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE ea.status = 'completed'
      ORDER BY ea.percentage DESC
      LIMIT 5
    `);

    // Department performance
    const deptPerformance = await query(`
      SELECT d.name as department_name, AVG(ea.percentage) as avg_score,
             COUNT(ea.id) as total_attempts,
             SUM(CASE WHEN ea.passed = TRUE THEN 1 ELSE 0 END) as passed_count
      FROM exam_attempts ea
      JOIN users u ON ea.student_id = u.id
      JOIN departments d ON u.department_id = d.id
      WHERE ea.status = 'completed'
      GROUP BY d.name
    `);

    // Exam performance
    const examPerformance = await query(`
      SELECT e.name as exam_name, AVG(ea.percentage) as avg_score,
             COUNT(ea.id) as total_attempts
      FROM exam_attempts ea
      JOIN exams e ON ea.exam_id = e.id
      WHERE ea.status = 'completed'
      GROUP BY e.name
    `);

    res.json({
      passPercent: scores.rows.length > 0 ? (passCount / scores.rows.length) * 100 : 0,
      failPercent: scores.rows.length > 0 ? (failCount / scores.rows.length) * 100 : 0,
      averageScore: avgScore,
      topScorers: topScorers.rows,
      departmentPerformance: deptPerformance.rows,
      examPerformance: examPerformance.rows
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Settings ---
app.get('/api/admin/settings', authenticateAdmin, async (req, res) => {
  try {
    const result = await query('SELECT * FROM settings');
    const settingsMap: Record<string, any> = {};
    for (const row of result.rows) {
      settingsMap[row.key] = row.value;
    }
    res.json(settingsMap);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/settings', authenticateAdmin, async (req, res) => {
  try {
    const settings = req.body; // Map of key-value pairs
    for (const key of Object.keys(settings)) {
      await query(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
        [key, JSON.stringify(settings[key])]
      );
    }
    res.json({ message: 'Settings saved successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Trainers CRUD ---
app.get('/api/admin/trainers', authenticateAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT t.*, c.name as college_name, b.name as batch_name 
      FROM trainers t 
      LEFT JOIN colleges c ON t.college_id = c.id 
      LEFT JOIN batches b ON t.batch_id = b.id 
      ORDER BY t.created_at DESC
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/trainers', authenticateAdmin, async (req, res) => {
  try {
    const { name, email, phone, specialization, collegeId, batchId } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }
    const result = await query(
      `INSERT INTO trainers (name, email, phone, specialization, college_id, batch_id) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [name, email, phone || null, specialization || null, collegeId || null, batchId || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'A trainer with this email already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/trainers/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, specialization, collegeId, batchId } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }
    const result = await query(
      `UPDATE trainers 
       SET name = $1, email = $2, phone = $3, specialization = $4, college_id = $5, batch_id = $6 
       WHERE id = $7 
       RETURNING *`,
      [name, email, phone || null, specialization || null, collegeId || null, batchId || null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Trainer not found' });
    res.json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'A trainer with this email already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/trainers/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM trainers WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Trainer not found' });
    res.json({ message: 'Trainer deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// Health check endpoints for Kubernetes liveness and readiness probes
app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'admin-service' });
});

app.get('/ready', (_req, res) => {
  res.status(200).json({ status: 'ready', service: 'admin-service' });
});
app.listen(PORT, () => {
  console.log(`Admin Service listening on port ${PORT}`);
});
