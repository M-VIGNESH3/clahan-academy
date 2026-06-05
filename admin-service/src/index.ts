import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Pool, types } from 'pg';
types.setTypeParser(1114, (str) => new Date(str.replace(' ', 'T') + 'Z'));
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import { createClient } from 'redis';

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 4002;

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_access_token_key';

// Database Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@postgres:5432/clahan_academy?sslmode=disable',
});
const query = (text: string, params?: any[]) => pool.query(text, params);

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

async function queueNotification(event: string, payload: any) {
  try {
    if (redisClient.isOpen) {
      await redisClient.rPush('email_notification_queue', JSON.stringify({ event, payload }));
    } else {
      console.log(`[Notification Fallback] Event: ${event}, Payload:`, payload);
    }
  } catch (err) {
    console.error('Queue notification error:', err);
  }
}

// Security Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
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

// --- Students ---
app.get('/api/admin/students', authenticateAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT u.id, u.email, u.full_name, u.phone, u.roll_number, u.year, u.status, u.email_verified, u.created_at,
             c.name as college_name, d.name as department_name, u.college_id, u.department_id
      FROM users u
      LEFT JOIN colleges c ON u.college_id = c.id
      LEFT JOIN departments d ON u.department_id = d.id
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
    const { email, fullName, phone, rollNumber, collegeId, departmentId, year } = req.body;
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
        college_id, department_id, year, status, email_verified
      ) VALUES ($1, $2, 'student', $3, $4, $5, $6, $7, $8, 'active', TRUE) RETURNING *`,
      [email, hashedPassword, fullName, phone || null, rollNumber, collegeId, departmentId, year]
    );

    // Queue notification email
    await queueNotification('CREDENTIAL_EMAIL', {
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

    // Parse lines manually (handling possible double quotes/escapes basic way or split)
    const lines = csvContent.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
    if (lines.length <= 1) {
      return res.status(400).json({ error: 'No student data rows found' });
    }

    const header = lines[0].split(',').map((h: string) => h.trim().toLowerCase());
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

    for (const row of dataRows) {
      const parts = row.split(',').map((p: string) => p.trim());
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
            college_id, department_id, year, status, email_verified
          ) VALUES ($1, $2, 'student', $3, $4, $5, $6, $7, $8, 'active', TRUE)`,
          [email, hashedPassword, fullName, phone || null, rollNumber, collegeId, departmentId, year]
        );

        // Queue credentials email
        await queueNotification('CREDENTIAL_EMAIL', {
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

    const check = await query('UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING email, full_name', [hashedPassword, id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const student = check.rows[0];

    // Notify student
    await queueNotification('CREDENTIAL_EMAIL', {
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

    const check = await query('UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING email, full_name', [hashedPassword, id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    const student = check.rows[0];

    await queueNotification('CREDENTIAL_EMAIL', {
      email: student.email,
      fullName: student.full_name,
      password: plainPassword
    });

    res.json({ message: 'Credentials resend successful. New credentials generated.', generatedPassword: plainPassword });
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

// --- Metrics & Analytics ---
app.get('/api/admin/dashboard/metrics', authenticateAdmin, async (req, res) => {
  try {
    const totalStudents = await query("SELECT count(*) FROM users WHERE role = 'student'");
    const totalExams = await query("SELECT count(*) FROM exams");
    const liveExams = await query("SELECT count(*) FROM exams WHERE is_published = TRUE AND schedule_date <= CURRENT_TIMESTAMP");
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

app.listen(PORT, () => {
  console.log(`Admin Service listening on port ${PORT}`);
});
