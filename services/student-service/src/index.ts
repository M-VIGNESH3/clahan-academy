import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Pool, types } from 'pg';
types.setTypeParser(1114, (str) => new Date(str.replace(' ', 'T') + 'Z'));
import * as jwt from 'jsonwebtoken';

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 4003;

const JWT_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'super_secret_access_token_key';

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception in student-service:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection in student-service at:', promise, 'reason:', reason);
});

// Database Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@postgres:5432/clahan_academy?sslmode=disable',
  max: 50,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
pool.on('error', (err) => {
  console.error('Unexpected error on idle pg client in student-service:', err);
});
const query = (text: string, params?: any[]) => pool.query(text, params);

// Security Middlewares
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
    college_id?: string;
    department_id?: string;
    year?: string;
  };
}

function authenticateStudent(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Auth token required' });

  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err || decoded.role !== 'student') {
      return res.status(403).json({ error: 'Requires student role access' });
    }
    req.user = decoded;
    next();
  });
}

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'student-service' });
});

// Profile Management
app.get('/api/student/profile', authenticateStudent, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.full_name, u.phone, u.roll_number, u.year, u.status,
              u.github_profile, u.linkedin_profile, u.profile_photo_url, u.email_verified, u.created_at,
              c.name as college_name, d.name as department_name, u.batch_id, b.name as batch_name
       FROM users u
       LEFT JOIN colleges c ON u.college_id = c.id
       LEFT JOIN departments d ON u.department_id = d.id
       LEFT JOIN batches b ON u.batch_id = b.id
       WHERE u.id = $1`,
      [req.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student profile not found' });
    }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/student/profile', authenticateStudent, async (req: AuthenticatedRequest, res) => {
  try {
    const { phone, githubProfile, linkedinProfile, profilePhotoUrl, batchId, trainerId } = req.body;
    
    const result = await query(
      `UPDATE users
       SET phone = COALESCE($1, phone),
           github_profile = COALESCE($2, github_profile),
           linkedin_profile = COALESCE($3, linkedin_profile),
           profile_photo_url = COALESCE($4, profile_photo_url),
           batch_id = CASE WHEN $5 = TRUE THEN $6 ELSE batch_id END,
           trainer_id = CASE WHEN $7 = TRUE THEN $8 ELSE trainer_id END
       WHERE id = $9 RETURNING *`,
      [
        phone !== undefined ? phone : null,
        githubProfile !== undefined ? githubProfile : null,
        linkedinProfile !== undefined ? linkedinProfile : null,
        profilePhotoUrl !== undefined ? profilePhotoUrl : null,
        batchId !== undefined,
        batchId === '' ? null : (batchId || null),
        trainerId !== undefined,
        trainerId === '' ? null : (trainerId || null),
        req.user!.id
      ]
    );

    res.json({ message: 'Profile updated successfully', profile: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/student/batches', authenticateStudent, async (req: AuthenticatedRequest, res) => {
  try {
    const userRes = await query('SELECT college_id FROM users WHERE id = $1', [req.user!.id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Student profile not found' });
    }
    const { college_id: collegeId } = userRes.rows[0];

    const result = await query(
      `SELECT id, name FROM batches WHERE college_id = $1 ORDER BY name ASC`,
      [collegeId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Student Dashboard Summary
app.get('/api/student/dashboard/summary', authenticateStudent, async (req: AuthenticatedRequest, res) => {
  try {
    const studentId = req.user!.id;
    
    // Fetch latest user details from DB to avoid stale token issues
    const userRes = await query('SELECT college_id, department_id, year, batch_id, trainer_id FROM users WHERE id = $1', [studentId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Student profile not found' });
    }
    const { college_id: collegeId, department_id: departmentId, year, batch_id: batchId, trainer_id: trainerId } = userRes.rows[0];

    // Upcoming Exams (exams matched to college, dept, year and schedule date is future)
    const upcoming = await query(
      `SELECT e.*, c.name as college_name, d.name as department_name,
              (SELECT name FROM batches b WHERE b.id = e.batch_id) as batch_name
       FROM exams e
       LEFT JOIN colleges c ON e.college_id = c.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE e.college_id = $1 AND e.is_published = TRUE AND e.schedule_date > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
         AND (
           (e.batch_id IS NOT NULL AND e.batch_id = $4)
           OR
           (e.batch_id IS NULL AND (e.department_id = $2 OR $2 = ANY(COALESCE(e.department_ids, '{}'))) AND e.year = $3)
         )
         AND (e.trainer_id IS NULL OR e.trainer_id = $5)
       ORDER BY e.schedule_date ASC`,
      [collegeId, departmentId, year, batchId, trainerId || null]
    );

    // Active Exams (scheduled in the past/present, still open, or simply published with allowed attempts left)
    // We fetch all eligible published exams, and check the attempts the student has made.
    const active = await query(
      `SELECT e.*, 
              (SELECT COUNT(*) FROM exam_attempts ea WHERE ea.exam_id = e.id AND ea.student_id = $5) as attempts_made,
              (SELECT name FROM batches b WHERE b.id = e.batch_id) as batch_name
       FROM exams e
       WHERE e.college_id = $1 AND e.is_published = TRUE 
         AND e.schedule_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
         AND (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') <= e.schedule_date + (GREATEST(COALESCE(e.window_open_minutes, 10), COALESCE(e.duration_minutes, 60)) * INTERVAL '1 minute')
         AND (
           (e.batch_id IS NOT NULL AND e.batch_id = $4)
           OR
           (e.batch_id IS NULL AND (e.department_id = $2 OR $2 = ANY(COALESCE(e.department_ids, '{}'))) AND e.year = $3)
         )
         AND (e.trainer_id IS NULL OR e.trainer_id = $6)
       ORDER BY e.schedule_date DESC`,
      [collegeId, departmentId, year, batchId, studentId, trainerId || null]
    );

    // Filter active exams where attempts_made < allowed_attempts
    const activeExams = active.rows.filter(row => parseInt(row.attempts_made) < parseInt(row.allowed_attempts));

    // Completed & Terminated Exams & Results
    const completed = await query(
      `SELECT ea.*, e.name as exam_name, e.exam_type, e.cutoff_percentage, e.duration_minutes,
              e.schedule_date, e.window_open_minutes
       FROM exam_attempts ea
       JOIN exams e ON ea.exam_id = e.id
       WHERE ea.student_id = $1 AND ea.status IN ('completed', 'terminated')
       ORDER BY ea.created_at DESC`,
      [studentId]
    );

    const completedExams = completed.rows.map(row => {
      const scheduleDate = new Date(row.schedule_date);
      const windowOpenMins = row.window_open_minutes !== null && row.window_open_minutes !== undefined ? row.window_open_minutes : 10;
      const durationMins = row.duration_minutes !== null && row.duration_minutes !== undefined ? row.duration_minutes : 60;
      const examEndTime = new Date(scheduleDate.getTime() + (windowOpenMins + durationMins) * 60 * 1000);
      const now = new Date();
      const resultsReleased = now >= examEndTime || row.status === 'completed' || row.status === 'terminated';

      if (!resultsReleased) {
        return {
          id: row.id,
          exam_id: row.exam_id,
          student_id: row.student_id,
          status: row.status,
          created_at: row.created_at,
          exam_name: row.exam_name,
          exam_type: row.exam_type,
          cutoff_percentage: row.cutoff_percentage,
          duration_minutes: row.duration_minutes,
          schedule_date: row.schedule_date,
          window_open_minutes: row.window_open_minutes,
          results_released: false,
          score: null,
          percentage: null,
          passed: null,
          feedback: 'Results will be shown after all students complete the exam.'
        };
      }
      return {
        ...row,
        results_released: true
      };
    });

    res.json({
      upcomingExams: upcoming.rows,
      activeExams: activeExams,
      completedExams: completedExams,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Notifications
app.get('/api/student/notifications', authenticateStudent, async (req: AuthenticatedRequest, res) => {
  try {
    const studentId = req.user!.id;
    
    // Fetch latest user details from DB to avoid stale token issues
    const userRes = await query('SELECT college_id, department_id, year, batch_id, trainer_id FROM users WHERE id = $1', [studentId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Student profile not found' });
    }
    const { college_id: collegeId, department_id: departmentId, year, batch_id: batchId, trainer_id: trainerId } = userRes.rows[0];

    // Let's dynamically generate a list of relevant in-app announcements
    const publishedExams = await query(
      `SELECT id, name, schedule_date FROM exams 
       WHERE college_id = $1 AND is_published = TRUE
         AND (
           (batch_id IS NOT NULL AND batch_id = $4)
           OR
           (batch_id IS NULL AND (department_id = $2 OR $2 = ANY(COALESCE(department_ids, '{}'))) AND year = $3)
         )
         AND (trainer_id IS NULL OR trainer_id = $5)
       ORDER BY schedule_date DESC LIMIT 20`,
      [collegeId, departmentId, year, batchId, trainerId || null]
    );

    const notifications: any[] = [];

    // Exam published notifications
    publishedExams.rows.forEach(exam => {
      notifications.push({
        id: `exam-${exam.id}`,
        title: 'New Exam Scheduled',
        message: `Exam "${exam.name}" has been published and scheduled for ${new Date(exam.schedule_date).toLocaleString()}.`,
        createdAt: exam.schedule_date,
        type: 'exam_published'
      });
    });

    // Result available notifications
    const completedAttempts = await query(
      `SELECT ea.id, ea.score, ea.percentage, ea.passed, ea.created_at as attempt_date,
              e.name as exam_name
       FROM exam_attempts ea
       JOIN exams e ON ea.exam_id = e.id
       WHERE ea.student_id = $1 AND ea.status IN ('completed', 'terminated')
       ORDER BY ea.created_at DESC LIMIT 10`,
      [studentId]
    );

    completedAttempts.rows.forEach(attempt => {
      const resultText = attempt.passed ? 'Passed' : 'Failed';
      notifications.push({
        id: `result-${attempt.id}`,
        title: `Result Available: ${attempt.exam_name}`,
        message: `Your result for "${attempt.exam_name}" is available. Score: ${attempt.percentage}% â€” ${resultText}.`,
        createdAt: attempt.attempt_date,
        type: 'result_published'
      });
    });

    // Sort all notifications by date (newest first)
    notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json(notifications.slice(0, 20));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/student/trainers', authenticateStudent, async (req: AuthenticatedRequest, res) => {
  try {
    const studentId = req.user?.id;
    // Get student's college_id
    const userResult = await query('SELECT college_id FROM users WHERE id = $1', [studentId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Student profile not found' });
    }
    const { college_id } = userResult.rows[0];
    const result = await query(
      `SELECT t.id, t.name, t.email, t.phone, t.specialization, t.batch_id, b.name as batch_name
       FROM trainers t
       LEFT JOIN batches b ON t.batch_id = b.id
       WHERE t.college_id = $1
       ORDER BY t.name ASC`,
      [college_id]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// Health check endpoints for Kubernetes liveness and readiness probes
app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'student-service' });
});

app.get('/ready', (_req, res) => {
  res.status(200).json({ status: 'ready', service: 'student-service' });
});
app.listen(PORT, () => {
  console.log(`Student Service listening on port ${PORT}`);
});
