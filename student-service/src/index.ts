import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Pool } from 'pg';
import * as jwt from 'jsonwebtoken';

const app = express();
const PORT = process.env.PORT || 4003;

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_access_token_key';

// Database Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@postgres:5432/clahan_academy?sslmode=disable',
});
const query = (text: string, params?: any[]) => pool.query(text, params);

// Security Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json());

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
              c.name as college_name, d.name as department_name
       FROM users u
       LEFT JOIN colleges c ON u.college_id = c.id
       LEFT JOIN departments d ON u.department_id = d.id
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
    const { phone, githubProfile, linkedinProfile, profilePhotoUrl } = req.body;
    
    const result = await query(
      `UPDATE users
       SET phone = COALESCE($1, phone),
           github_profile = COALESCE($2, github_profile),
           linkedin_profile = COALESCE($3, linkedin_profile),
           profile_photo_url = COALESCE($4, profile_photo_url)
       WHERE id = $5 RETURNING *`,
      [phone || null, githubProfile || null, linkedinProfile || null, profilePhotoUrl || null, req.user!.id]
    );

    res.json({ message: 'Profile updated successfully', profile: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Student Dashboard Summary
app.get('/api/student/dashboard/summary', authenticateStudent, async (req: AuthenticatedRequest, res) => {
  try {
    const studentId = req.user!.id;
    const collegeId = req.user!.college_id;
    const departmentId = req.user!.department_id;
    const year = req.user!.year;

    // Upcoming Exams (exams matched to college, dept, year and schedule date is future)
    const upcoming = await query(
      `SELECT e.*, c.name as college_name, d.name as department_name 
       FROM exams e
       LEFT JOIN colleges c ON e.college_id = c.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE e.college_id = $1 AND e.department_id = $2 AND e.year = $3
         AND e.is_published = TRUE AND e.schedule_date > CURRENT_TIMESTAMP
       ORDER BY e.schedule_date ASC`,
      [collegeId, departmentId, year]
    );

    // Active Exams (scheduled in the past/present, still open, or simply published with allowed attempts left)
    // We fetch all eligible published exams, and check the attempts the student has made.
    const active = await query(
      `SELECT e.*, 
              (SELECT COUNT(*) FROM exam_attempts ea WHERE ea.exam_id = e.id AND ea.student_id = $4) as attempts_made
       FROM exams e
       WHERE e.college_id = $1 AND e.department_id = $2 AND e.year = $3
         AND e.is_published = TRUE 
         AND e.schedule_date <= CURRENT_TIMESTAMP
         AND CURRENT_TIMESTAMP <= e.schedule_date + (COALESCE(e.window_open_minutes, 10) * INTERVAL '1 minute')
       ORDER BY e.schedule_date DESC`,
      [collegeId, departmentId, year, studentId]
    );

    // Filter active exams where attempts_made < allowed_attempts
    const activeExams = active.rows.filter(row => parseInt(row.attempts_made) < parseInt(row.allowed_attempts));

    // Completed Exams & Results
    const completed = await query(
      `SELECT ea.*, e.name as exam_name, e.exam_type, e.cutoff_percentage, e.duration_minutes
       FROM exam_attempts ea
       JOIN exams e ON ea.exam_id = e.id
       WHERE ea.student_id = $1 AND ea.status = 'completed'
       ORDER BY ea.created_at DESC`,
      [studentId]
    );

    res.json({
      upcomingExams: upcoming.rows,
      activeExams: activeExams,
      completedExams: completed.rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Notifications
app.get('/api/student/notifications', authenticateStudent, async (req: AuthenticatedRequest, res) => {
  try {
    // Return standard notifications (could be stored in PostgreSQL or returned dynamically)
    // For Clahan Academy V2, we query standard notifications for the student's college/department.
    const collegeId = req.user!.college_id;
    const departmentId = req.user!.department_id;
    const year = req.user!.year;

    // Let's dynamically generate a list of relevant in-app announcements
    const publishedExams = await query(
      `SELECT id, name, schedule_date FROM exams 
       WHERE college_id = $1 AND department_id = $2 AND year = $3 AND is_published = TRUE
       ORDER BY schedule_date DESC LIMIT 10`,
      [collegeId, departmentId, year]
    );

    const notifications = publishedExams.rows.map(exam => ({
      id: exam.id,
      title: 'New Exam Scheduled',
      message: `Exam "${exam.name}" has been published and scheduled for ${new Date(exam.schedule_date).toLocaleString()}.`,
      createdAt: exam.schedule_date,
      type: 'exam_published'
    }));

    res.json(notifications);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Student Service listening on port ${PORT}`);
});
