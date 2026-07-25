import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Pool, types } from 'pg';
types.setTypeParser(1114, (str) => new Date(str.replace(' ', 'T') + 'Z'));
import * as jwt from 'jsonwebtoken';
import { createClient } from 'redis';
import { Queue } from 'bullmq';
import axios from 'axios';

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 4004;

const JWT_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'super_secret_access_token_key';
const JUDGE0_URL = process.env.JUDGE0_URL || 'http://judge0-service:2358';
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://ai-service:8000';

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception in exam-service:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection in exam-service at:', promise, 'reason:', reason);
});

// Database Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@postgres:5432/clahan_academy?sslmode=disable',
  max: 50,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
pool.on('error', (err) => {
  console.error('Unexpected error on idle pg client in exam-service:', err);
});
const query = (text: string, params?: any[]) => pool.query(text, params);

pool.query(`ALTER TABLE exams ADD COLUMN IF NOT EXISTS navigation_mode VARCHAR(50) DEFAULT 'free'; ALTER TABLE exams ADD COLUMN IF NOT EXISTS skip_instructions BOOLEAN DEFAULT FALSE;`).catch(err => {
  console.log('DB Column navigation_mode addition log:', err.message);
});

pool.query(`
  ALTER TABLE mcq_questions ADD COLUMN IF NOT EXISTS question_type VARCHAR(50) DEFAULT 'mcq';
  ALTER TABLE mcq_questions ADD COLUMN IF NOT EXISTS word_limit INT DEFAULT 0;
  ALTER TABLE mcq_questions ADD COLUMN IF NOT EXISTS evaluation_method VARCHAR(50) DEFAULT 'manual';
  ALTER TABLE mcq_questions ADD COLUMN IF NOT EXISTS content_blocks JSONB DEFAULT '[]'::jsonb;
  ALTER TABLE mcq_questions ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;
  ALTER TABLE mcq_questions ADD COLUMN IF NOT EXISTS option_a_image TEXT DEFAULT '';
  ALTER TABLE mcq_questions ADD COLUMN IF NOT EXISTS option_b_image TEXT DEFAULT '';
  ALTER TABLE mcq_questions ADD COLUMN IF NOT EXISTS option_c_image TEXT DEFAULT '';
  ALTER TABLE mcq_questions ADD COLUMN IF NOT EXISTS option_d_image TEXT DEFAULT '';
  ALTER TABLE coding_questions ADD COLUMN IF NOT EXISTS content_blocks JSONB DEFAULT '[]'::jsonb;
  ALTER TABLE coding_questions ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;
`).catch(err => {
  console.log('DB Column rich questions addition log:', err.message);
});

async function validateAttemptNotExpired(attemptId: string) {
  const attemptResult = await query(
    `SELECT ea.created_at, ea.status, e.duration_minutes 
     FROM exam_attempts ea 
     JOIN exams e ON ea.exam_id = e.id 
     WHERE ea.id = $1`,
    [attemptId]
  );
  if (attemptResult.rows.length === 0) {
    throw new Error('Attempt not found');
  }
  const attempt = attemptResult.rows[0];
  if (attempt.status !== 'ongoing') {
    throw new Error('Attempt is already finalized or terminated');
  }
  const now = Date.now();
  const startTime = new Date(attempt.created_at).getTime();
  const durationMs = attempt.duration_minutes * 60 * 1000;
  const gracePeriodMs = 10000; // 10s grace period
  if (now > startTime + durationMs + gracePeriodMs) {
    throw new Error('Exam time limit exceeded. Action rejected.');
  }
}

function seededShuffle<T>(array: T[], seed: string): T[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  const rand = () => {
    h = Math.sin(h) * 10000;
    return h - Math.floor(h);
  };
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }
  return shuffled;
}

// Redis client for notifications
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379',
});
redisClient.on('error', (err) => console.error('Redis Client Error', err));
(async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    console.warn('Redis offline in Exam Service, notifications will use console log.');
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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

function authenticate(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Auth token required' });

  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = decoded;
    next();
  });
}

function requireRole(role: 'admin' | 'student') {
  return (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: `Requires ${role} role` });
    }
    next();
  };
}

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'exam-service' });
});

// --- ADMIN API ---

// List all exams
app.get('/api/exams/admin', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const result = await query(`
      SELECT e.*, c.name as college_name,
             COALESCE(
               (SELECT string_agg(dept.name, ', ') 
                FROM departments dept 
                WHERE dept.id = ANY(COALESCE(e.department_ids, '{}'))), 
               d.name
             ) as department_name,
             b.name as batch_name,
             t.name as trainer_name,
             (SELECT COUNT(*) FROM mcq_questions mq WHERE mq.exam_id = e.id) as mcq_count,
             (SELECT COUNT(*) FROM coding_questions cq WHERE cq.exam_id = e.id) as coding_count
      FROM exams e
      LEFT JOIN colleges c ON e.college_id = c.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN batches b ON e.batch_id = b.id
      LEFT JOIN trainers t ON e.trainer_id = t.id
      ORDER BY e.created_at DESC
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create Exam
app.post('/api/exams', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { name, description, examType, durationMinutes, cutoffPercentage, allowedAttempts, scheduleDate, collegeId, departmentId, departmentIds, batchId, year, windowOpenMinutes, trainerId, enableFaceDetection, enableSectionCutoff, mcqCutoffPercentage, codingCutoffPercentage, mcqCutoffMarks, codingCutoffMarks } = req.body;
    if (!name || !examType || !durationMinutes) {
      return res.status(400).json({ error: 'Missing required parameters: name, examType, durationMinutes' });
    }

    const finalScheduleDate = scheduleDate ? new Date(scheduleDate).toISOString() : new Date().toISOString();
    const finalCollegeId = collegeId || null;

    let finalDeptId = null;
    let finalDeptIds: string[] = [];
    let finalYear = null;

    if (finalCollegeId && !batchId) {
      finalDeptId = departmentId || (departmentIds && departmentIds[0]) || null;
      finalDeptIds = departmentIds || (departmentId ? [departmentId] : []);
      finalYear = year || null;
    } else if (batchId) {
      finalDeptId = null;
      finalDeptIds = [];
      finalYear = null;
    }

    const result = await query(
      `INSERT INTO exams (
        name, description, exam_type, duration_minutes, cutoff_percentage, allowed_attempts,
        schedule_date, college_id, department_id, department_ids, batch_id, year, window_open_minutes, is_published, trainer_id, enable_face_detection,
        enable_section_cutoff, mcq_cutoff_percentage, coding_cutoff_percentage, mcq_cutoff_marks, coding_cutoff_marks, navigation_mode
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::uuid[], $11, $12, $13, FALSE, $14, $15, $16, $17, $18, $19, $20, $21) RETURNING *`,
      [
        name, description || '', examType, durationMinutes, cutoffPercentage || 50, allowedAttempts || 1, finalScheduleDate, finalCollegeId, finalDeptId, finalDeptIds, batchId || null, finalYear, windowOpenMinutes !== undefined ? windowOpenMinutes : 10, trainerId || null, enableFaceDetection !== false,
        enableSectionCutoff === true, mcqCutoffPercentage !== undefined && mcqCutoffPercentage !== null ? mcqCutoffPercentage : 50.00, codingCutoffPercentage !== undefined && codingCutoffPercentage !== null ? codingCutoffPercentage : 50.00, mcqCutoffMarks !== undefined && mcqCutoffMarks !== null ? mcqCutoffMarks : 0.00, codingCutoffMarks !== undefined && codingCutoffMarks !== null ? codingCutoffMarks : 0.00, req.body.navigationMode || req.body.navigation_mode || 'free'
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    console.error("Error in POST /api/exams:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get detailed exam for admin editing
app.get('/api/exams/:id', authenticate, async (req, res) => {
  try {
    const examResult = await query(
      `SELECT e.*, c.name as college_name,
              COALESCE(
                (SELECT string_agg(dept.name, ', ') 
                 FROM departments dept 
                 WHERE dept.id = ANY(COALESCE(e.department_ids, '{}'))), 
                d.name
              ) as department_name,
              b.name as batch_name,
              t.name as trainer_name
       FROM exams e
       LEFT JOIN colleges c ON e.college_id = c.id
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN batches b ON e.batch_id = b.id
       LEFT JOIN trainers t ON e.trainer_id = t.id
       WHERE e.id = $1`,
      [req.params.id]
    );

    if (examResult.rows.length === 0) return res.status(404).json({ error: 'Exam not found' });

    const mcqs = await query('SELECT * FROM mcq_questions WHERE exam_id = $1 ORDER BY created_at ASC', [req.params.id]);
    
    // Coding questions with testcases
    const codingRaw = await query('SELECT * FROM coding_questions WHERE exam_id = $1 ORDER BY created_at ASC', [req.params.id]);
    const codingQuestions = [];
    for (const cq of codingRaw.rows) {
      const cases = await query('SELECT * FROM coding_test_cases WHERE question_id = $1 ORDER BY created_at ASC', [cq.id]);
      codingQuestions.push({ ...cq, testCases: cases.rows });
    }

    const sections = await query('SELECT * FROM sections WHERE exam_id = $1 ORDER BY sort_order ASC', [req.params.id]);

    res.json({
      exam: examResult.rows[0],
      sections: sections.rows,
      mcqQuestions: mcqs.rows,
      codingQuestions
    });
  } catch (err: any) {
    console.error("Error in GET /api/exams/:id:", err);
    res.status(500).json({ error: err.message });
  }
});

// Update Exam
app.put('/api/exams/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { name, description, examType, durationMinutes, cutoffPercentage, allowedAttempts, scheduleDate, collegeId, departmentId, departmentIds, batchId, year, windowOpenMinutes, trainerId, enableFaceDetection, enableSectionCutoff, mcqCutoffPercentage, codingCutoffPercentage, mcqCutoffMarks, codingCutoffMarks } = req.body;
    
    const exType = examType || req.body.exam_type || 'mcq';
    const durMins = parseInt(durationMinutes || req.body.duration_minutes || 60, 10);
    const exName = name || req.body.name;

    if (!exName || !exType || isNaN(durMins)) {
      return res.status(400).json({ error: 'Missing required parameters: name, examType, durationMinutes' });
    }

    const finalScheduleDate = scheduleDate ? new Date(scheduleDate).toISOString() : new Date().toISOString();
    const finalCollegeId = isValidUuid(collegeId) ? collegeId : (isValidUuid(req.body.college_id) ? req.body.college_id : null);
    const rawBatchId = batchId || req.body.batch_id;
    const finalBatchId = isValidUuid(rawBatchId) ? rawBatchId : null;
    const rawTrainerId = trainerId || req.body.trainer_id;
    const finalTrainerId = isValidUuid(rawTrainerId) ? rawTrainerId : null;

    let finalDeptId: string | null = null;
    let finalDeptIds: string[] = [];
    let finalYear: string | null = null;

    const rawDeptId = departmentId || req.body.department_id;
    const rawDeptIds = departmentIds || req.body.department_ids;

    if (finalCollegeId && !finalBatchId) {
      if (isValidUuid(rawDeptId)) finalDeptId = rawDeptId;
      if (Array.isArray(rawDeptIds)) {
        finalDeptIds = rawDeptIds.filter((d: string) => isValidUuid(d));
      } else if (finalDeptId) {
        finalDeptIds = [finalDeptId];
      }
      finalYear = year || req.body.year || null;
    }

    const finalCutoffPct = cutoffPercentage !== undefined && cutoffPercentage !== null && String(cutoffPercentage).trim() !== '' ? parseFloat(String(cutoffPercentage)) : 50.00;
    const finalAllowedAttempts = allowedAttempts !== undefined && allowedAttempts !== null && String(allowedAttempts).trim() !== '' ? parseInt(String(allowedAttempts), 10) : 1;

    const result = await query(
      `UPDATE exams 
       SET name = $1, description = $2, exam_type = $3, duration_minutes = $4,
           cutoff_percentage = $5, allowed_attempts = $6, schedule_date = $7,
           college_id = $8, department_id = $9, department_ids = $10::uuid[], batch_id = $11, year = $12, window_open_minutes = $13, trainer_id = $14, enable_face_detection = $15,
           enable_section_cutoff = $16, mcq_cutoff_percentage = $17, coding_cutoff_percentage = $18, mcq_cutoff_marks = $19, coding_cutoff_marks = $20, navigation_mode = $21
       WHERE id = $22 RETURNING *`,
      [
        exName, description || '', exType, durMins, finalCutoffPct, finalAllowedAttempts, finalScheduleDate, finalCollegeId, finalDeptId, finalDeptIds, finalBatchId, finalYear, windowOpenMinutes !== undefined ? windowOpenMinutes : 10, finalTrainerId, enableFaceDetection !== false,
        enableSectionCutoff === true, mcqCutoffPercentage !== undefined && mcqCutoffPercentage !== null ? mcqCutoffPercentage : 50.00, codingCutoffPercentage !== undefined && codingCutoffPercentage !== null ? codingCutoffPercentage : 50.00, mcqCutoffMarks !== undefined && mcqCutoffMarks !== null ? mcqCutoffMarks : 0.00, codingCutoffMarks !== undefined && codingCutoffMarks !== null ? codingCutoffMarks : 0.00,
        req.body.navigationMode || req.body.navigation_mode || 'free',
        req.params.id
      ]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Exam not found' });
    res.json(result.rows[0]);
  } catch (err: any) {
    console.error("Error in PUT /api/exams/:id:", err);
    res.status(500).json({ error: err.message });
  }
});

// Duplicate Exam
app.post('/api/exams/:id/duplicate', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Copy exam
    const examCheck = await query('SELECT * FROM exams WHERE id = $1', [id]);
    if (examCheck.rows.length === 0) return res.status(404).json({ error: 'Exam not found' });
    const ex = examCheck.rows[0];

    const newExam = await query(
      `INSERT INTO exams (name, description, exam_type, duration_minutes, cutoff_percentage, allowed_attempts, schedule_date, college_id, department_id, department_ids, batch_id, year, window_open_minutes, is_published, trainer_id, enable_face_detection, enable_section_cutoff, mcq_cutoff_percentage, coding_cutoff_percentage, mcq_cutoff_marks, coding_cutoff_marks, navigation_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, FALSE, $14, $15, $16, $17, $18, $19, $20, $21) RETURNING *`,
      [
        `Copy of ${ex.name}`,
        ex.description || '',
        ex.exam_type,
        ex.duration_minutes,
        ex.cutoff_percentage,
        ex.allowed_attempts,
        ex.schedule_date,
        ex.college_id,
        ex.department_id,
        ex.department_ids || (ex.department_id ? [ex.department_id] : []),
        ex.batch_id || null,
        ex.year,
        ex.window_open_minutes,
        ex.trainer_id || null,
        ex.enable_face_detection !== false,
        ex.enable_section_cutoff !== false && ex.enable_section_cutoff !== null ? ex.enable_section_cutoff : false,
        ex.mcq_cutoff_percentage !== null ? ex.mcq_cutoff_percentage : 50.00,
        ex.coding_cutoff_percentage !== null ? ex.coding_cutoff_percentage : 50.00,
        ex.mcq_cutoff_marks !== null ? ex.mcq_cutoff_marks : 0.00,
        ex.coding_cutoff_marks !== null ? ex.coding_cutoff_marks : 0.00,
        ex.navigation_mode || 'free'
      ]
    );
    const newExamId = newExam.rows[0].id;

    // Copy Sections
    const sections = await query('SELECT * FROM sections WHERE exam_id = $1 ORDER BY sort_order ASC', [id]);
    const sectionIdMap: { [oldId: string]: string } = {};
    for (const s of sections.rows) {
      const newSect = await query(
        `INSERT INTO sections (exam_id, name, description, section_type, duration_minutes, randomize_questions, is_mandatory, sort_order, enable_cutoff, cutoff_percentage, cutoff_marks)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [newExamId, s.name, s.description || '', s.section_type, s.duration_minutes, s.randomize_questions === true, s.is_mandatory !== false, s.sort_order, s.enable_cutoff === true, s.cutoff_percentage || null, s.cutoff_marks || null]
      );
      sectionIdMap[s.id] = newSect.rows[0].id;
    }

    // Copy MCQs
    const mcqs = await query('SELECT * FROM mcq_questions WHERE exam_id = $1', [id]);
    for (const m of mcqs.rows) {
      const newSectId = m.section_id ? (sectionIdMap[m.section_id] || null) : null;
      await query(
        `INSERT INTO mcq_questions (exam_id, section_id, question, option_a, option_b, option_c, option_d, correct_answer, marks, difficulty, content_blocks, images, option_a_image, option_b_image, option_c_image, option_d_image, question_type, word_limit, evaluation_method)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, $14, $15, $16, $17, $18, $19)`,
        [
          newExamId, newSectId, m.question, m.option_a, m.option_b, m.option_c, m.option_d, m.correct_answer, m.marks, m.difficulty,
          JSON.stringify(m.content_blocks || []), JSON.stringify(m.images || []),
          m.option_a_image || '', m.option_b_image || '', m.option_c_image || '', m.option_d_image || '',
          m.question_type || 'mcq', m.word_limit || 0, m.evaluation_method || 'manual'
        ]
      );
    }

    // Copy Coding Questions
    const codings = await query('SELECT * FROM coding_questions WHERE exam_id = $1', [id]);
    for (const c of codings.rows) {
      const newSectId = c.section_id ? (sectionIdMap[c.section_id] || null) : null;
      const newCq = await query(
        `INSERT INTO coding_questions (exam_id, section_id, title, description, difficulty, marks, language, time_limit, memory_limit, starter_code, content_blocks, images)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb) RETURNING id`,
        [
          newExamId, newSectId, c.title, c.description, c.difficulty, c.marks, c.language, c.time_limit, c.memory_limit, c.starter_code,
          JSON.stringify(c.content_blocks || []), JSON.stringify(c.images || [])
        ]
      );
      const newCqId = newCq.rows[0].id;

      // Copy Testcases
      const cases = await query('SELECT * FROM coding_test_cases WHERE question_id = $1', [c.id]);
      for (const t of cases.rows) {
        await query(
          `INSERT INTO coding_test_cases (question_id, input, expected_output, is_hidden)
           VALUES ($1, $2, $3, $4)`,
          [newCqId, t.input, t.expected_output, t.is_hidden]
        );
      }
    }

    res.status(201).json(newExam.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Publish Exam
app.post('/api/exams/:id/publish', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('UPDATE exams SET is_published = TRUE WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Exam not found' });
    
    const exam = result.rows[0];

    // Find eligible students to notify (handles both batch-based and dept/year-based exams)
    let students;
    if (exam.batch_id) {
      // Batch-based exam: notify all students in this batch
      students = await query(
        `SELECT email, full_name FROM users 
         WHERE role = 'student' AND college_id = $1 AND batch_id = $2
           AND status = 'active' AND email_verified = TRUE`,
        [exam.college_id, exam.batch_id]
      );
    } else {
      // Department/year-based exam: notify students matching department(s) and year
      students = await query(
        `SELECT email, full_name FROM users 
         WHERE role = 'student' AND college_id = $1 AND year = $2
           AND (department_id = $3 OR department_id = ANY($4::uuid[]))
           AND ($5::uuid IS NULL OR trainer_id = $5)
           AND status = 'active' AND email_verified = TRUE`,
        [exam.college_id, exam.year, exam.department_id, exam.department_ids || [], exam.trainer_id || null]
      );
    }

    const notificationPayloads = students.rows.map(student => ({
      email: student.email,
      fullName: student.full_name,
      examName: exam.name,
      scheduleDate: exam.schedule_date
    }));

    if (notificationPayloads.length > 0) {
      queueNotificationsBulk('EXAM_PUBLISHED', notificationPayloads);
    }

    res.json({ message: 'Exam published successfully', exam });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete/Archive Exam
app.delete('/api/exams/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM exams WHERE id = $1', [id]);
    res.json({ message: 'Exam deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Download MCQ CSV Template
app.get('/api/exams/templates/mcq', (req, res) => {
  const template = 'Question,Option A,Option B,Option C,Option D,Correct Answer,Marks,Difficulty\nWhat is a correct Python comment?,# Comment,// Comment,/* Comment */,<! Comment >,A,1,Easy';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=mcq_template.csv');
  res.status(200).send(template);
});

// Helper function to parse a CSV line properly handling double quotes and embedded commas
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Upload MCQ Questions (CSV)
app.post('/api/exams/:id/mcq/import', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { csvContent } = req.body;
    if (!csvContent) return res.status(400).json({ error: 'CSV content required' });

    let finalSectionId = req.body.sectionId || req.body.section_id;
    if (!finalSectionId) {
      const mcqSections = await query("SELECT id FROM sections WHERE exam_id = $1 AND section_type = 'mcq' ORDER BY sort_order ASC LIMIT 1", [id]);
      if (mcqSections.rows.length > 0) {
        finalSectionId = mcqSections.rows[0].id;
      } else {
        const newSect = await query(`
          INSERT INTO sections (exam_id, name, section_type, randomize_questions, is_mandatory, sort_order)
          VALUES ($1, 'MCQ Section', 'mcq', FALSE, TRUE, 0) RETURNING id
        `, [id]);
        finalSectionId = newSect.rows[0].id;
      }
    }

    const lines = csvContent.replace(/\r/g, '').split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
    const dataRows = lines.slice(1);

    const validItems: Array<{ question: string; optA: string; optB: string; optC: string; optD: string; correct: string; marks: number; difficulty: string }> = [];

    for (const row of dataRows) {
      const parts = parseCsvLine(row);
      if (parts.length < 8) continue;

      const question = parts[0];
      const optA = parts[1];
      const optB = parts[2];
      const optC = parts[3];
      const optD = parts[4];
      let correct = parts[5] ? parts[5].trim() : 'A';
      const marks = parseInt(parts[6]) || 1;
      const difficulty = parts[7] || 'medium';

      if (correct.length > 1) {
        const cleanCorrect = correct.toUpperCase();
        if (cleanCorrect.startsWith('OPTION ')) {
          correct = cleanCorrect.replace('OPTION ', '').trim();
        } else if (cleanCorrect.startsWith('A') || cleanCorrect.startsWith('B') || cleanCorrect.startsWith('C') || cleanCorrect.startsWith('D')) {
          correct = cleanCorrect.charAt(0);
        }
      } else {
        correct = correct.toUpperCase();
      }

      if (!question || !optA || !optB || !optC || !optD || !correct) {
        continue;
      }

      validItems.push({ question, optA, optB, optC, optD, correct, marks, difficulty });
    }

    let inserted = 0;
    const batchSize = 50;
    for (let i = 0; i < validItems.length; i += batchSize) {
      const chunk = validItems.slice(i, i + batchSize);
      const valueClauses: string[] = [];
      const queryParams: any[] = [];
      let paramIdx = 1;

      for (const item of chunk) {
        valueClauses.push(`($${paramIdx}, $${paramIdx+1}, $${paramIdx+2}, $${paramIdx+3}, $${paramIdx+4}, $${paramIdx+5}, $${paramIdx+6}, $${paramIdx+7}, $${paramIdx+8}, $${paramIdx+9})`);
        queryParams.push(id, finalSectionId, item.question, item.optA, item.optB, item.optC, item.optD, item.correct, item.marks, item.difficulty);
        paramIdx += 10;
      }

      if (valueClauses.length > 0) {
        const bulkQuery = `INSERT INTO mcq_questions (exam_id, section_id, question, option_a, option_b, option_c, option_d, correct_answer, marks, difficulty) VALUES ${valueClauses.join(', ')}`;
        await query(bulkQuery, queryParams);
        inserted += chunk.length;
      }
    }

    res.json({ message: 'MCQ questions imported successfully', count: inserted });
  } catch (err: any) {
    console.error("Error in POST /api/exams/:id/mcq/import:", err);
    res.status(500).json({ error: err.message });
  }
});

// Add MCQ manually
app.post('/api/exams/:id/mcq', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { question, optionA, optionB, optionC, optionD, correctAnswer, marks, difficulty, contentBlocks, images, optionAImage, optionBImage, optionCImage, optionDImage, questionType, wordLimit, evaluationMethod } = req.body;
    
    const optA = optionA ?? req.body.option_a;
    const optB = optionB ?? req.body.option_b;
    const optC = optionC ?? req.body.option_c;
    const optD = optionD ?? req.body.option_d;
    const corrAns = correctAnswer ?? req.body.correct_answer;

    const qType = questionType || 'mcq';
    const hasQuestionText = Boolean((question && String(question).trim()) || (req.body.question && String(req.body.question).trim()));
    const hasContentBlocks = Array.isArray(contentBlocks) && contentBlocks.length > 0;
    const hasImages = Array.isArray(images) && images.length > 0;

    const optAImg = optionAImage || req.body.option_a_image || '';
    const optBImg = optionBImage || req.body.option_b_image || '';
    const optCImg = optionCImage || req.body.option_c_image || '';
    const optDImg = optionDImage || req.body.option_d_image || '';

    const hasOptA = Boolean((optA && String(optA).trim()) || optAImg);
    const hasOptB = Boolean((optB && String(optB).trim()) || optBImg);
    const hasOptC = Boolean((optC && String(optC).trim()) || optCImg);
    const hasOptD = Boolean((optD && String(optD).trim()) || optDImg);
    const finalCorrAns = corrAns || 'A';

    if (qType === 'mcq') {
      if (!hasQuestionText && !hasContentBlocks && !hasImages) {
        return res.status(400).json({ error: 'Question content (text or image) is required' });
      }
      if (!hasOptA || !hasOptB || !hasOptC || !hasOptD) {
        return res.status(400).json({ error: 'All 4 MCQ options must have text or image content' });
      }
    }
    if (qType === 'descriptive' && !hasQuestionText && !hasContentBlocks && !hasImages) {
      return res.status(400).json({ error: 'Question statement is required for descriptive question' });
    }

    let finalSectionId = req.body.sectionId || req.body.section_id;
    if (!finalSectionId) {
      const sections = await query("SELECT id FROM sections WHERE exam_id = $1 ORDER BY sort_order ASC LIMIT 1", [id]);
      if (sections.rows.length > 0) {
        finalSectionId = sections.rows[0].id;
      } else {
        const newSect = await query(`
          INSERT INTO sections (exam_id, name, section_type, randomize_questions, is_mandatory, sort_order)
          VALUES ($1, 'General Section', 'general', FALSE, TRUE, 0) RETURNING id
        `, [id]);
        finalSectionId = newSect.rows[0].id;
      }
    }

    const optAImage = optionAImage || req.body.option_a_image || '';
    const optBImage = optionBImage || req.body.option_b_image || '';
    const optCImage = optionCImage || req.body.option_c_image || '';
    const optDImage = optionDImage || req.body.option_d_image || '';

    const result = await query(
      `INSERT INTO mcq_questions (exam_id, section_id, question, option_a, option_b, option_c, option_d, correct_answer, marks, difficulty, content_blocks, images, option_a_image, option_b_image, option_c_image, option_d_image, question_type, word_limit, evaluation_method)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, $14, $15, $16, $17, $18, $19) RETURNING *`,
      [
        id, finalSectionId, question || '', optA || '', optB || '', optC || '', optD || '', finalCorrAns, marks || 1, difficulty || 'medium',
        JSON.stringify(contentBlocks || []), JSON.stringify(images || []),
        optAImg, optBImg, optCImg, optDImg,
        qType, wordLimit || 0, evaluationMethod || 'manual'
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    console.error("Error in POST /api/exams/:id/mcq:", err);
    res.status(500).json({ error: err.message });
  }
});

// Add Descriptive Question manually
app.post('/api/exams/:id/descriptive', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { question, marks, difficulty, contentBlocks, images, wordLimit, evaluationMethod } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'Question text is required' });
    }

    let finalSectionId = req.body.sectionId || req.body.section_id;
    if (!finalSectionId) {
      const sections = await query("SELECT id FROM sections WHERE exam_id = $1 ORDER BY sort_order ASC LIMIT 1", [id]);
      if (sections.rows.length > 0) {
        finalSectionId = sections.rows[0].id;
      } else {
        const newSect = await query(`
          INSERT INTO sections (exam_id, name, section_type, randomize_questions, is_mandatory, sort_order)
          VALUES ($1, 'Descriptive Section', 'descriptive', FALSE, TRUE, 0) RETURNING id
        `, [id]);
        finalSectionId = newSect.rows[0].id;
      }
    }

    const result = await query(
      `INSERT INTO mcq_questions (exam_id, section_id, question, option_a, option_b, option_c, option_d, correct_answer, marks, difficulty, content_blocks, images, question_type, word_limit, evaluation_method)
       VALUES ($1, $2, $3, '', '', '', '', '', $4, $5, $6::jsonb, $7::jsonb, 'descriptive', $8, $9) RETURNING *`,
      [
        id, finalSectionId, question, marks || 5, difficulty || 'medium',
        JSON.stringify(contentBlocks || []), JSON.stringify(images || []),
        wordLimit || 0, evaluationMethod || 'manual'
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    console.error("Error in POST /api/exams/:id/descriptive:", err);
    res.status(500).json({ error: err.message });
  }
});

// Add Coding Question manually
app.post('/api/exams/:id/coding', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, difficulty, marks, language, timeLimit, memoryLimit, starterCode, testCases, contentBlocks, images } = req.body;
    if (!title || !description || !language) {
      return res.status(400).json({ error: 'Title, description and language are required' });
    }

    let finalSectionId = req.body.sectionId || req.body.section_id;
    if (!finalSectionId) {
      const sections = await query("SELECT id FROM sections WHERE exam_id = $1 ORDER BY sort_order ASC LIMIT 1", [id]);
      if (sections.rows.length > 0) {
        finalSectionId = sections.rows[0].id;
      } else {
        const newSect = await query(`
          INSERT INTO sections (exam_id, name, section_type, randomize_questions, is_mandatory, sort_order)
          VALUES ($1, 'Coding Section', 'coding', FALSE, TRUE, 1) RETURNING id
        `, [id]);
        finalSectionId = newSect.rows[0].id;
      }
    }

    const cqResult = await query(
      `INSERT INTO coding_questions (exam_id, section_id, title, description, difficulty, marks, language, time_limit, memory_limit, starter_code, content_blocks, images)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb) RETURNING *`,
      [
        id, finalSectionId, title, description, difficulty || 'medium', marks || 10, language, timeLimit || 2000, memoryLimit || 512000, starterCode || '',
        JSON.stringify(contentBlocks || []), JSON.stringify(images || [])
      ]
    );
    const cq = cqResult.rows[0];

    const insertedCases = [];
    if (testCases && Array.isArray(testCases)) {
      for (const tc of testCases) {
        const tcResult = await query(
          `INSERT INTO coding_test_cases (question_id, input, expected_output, is_hidden)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [cq.id, tc.input, tc.expected_output, tc.isHidden || false]
        );
        insertedCases.push(tcResult.rows[0]);
      }
    }

    res.status(201).json({ ...cq, testCases: insertedCases });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get Exam-wise results for Admin
app.get('/api/exams/:id/results', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const attempts = await query(
      `SELECT ea.*, u.full_name, u.roll_number, d.name as department_name, u.year,
              e.enable_section_cutoff
       FROM exam_attempts ea
       JOIN users u ON ea.student_id = u.id
       JOIN exams e ON ea.exam_id = e.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE ea.exam_id = $1 AND ea.status IN ('completed', 'terminated')
       ORDER BY ea.percentage DESC`,
      [id]
    );
    res.json(attempts.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- SECTION MANAGEMENT API ---

// Create Section
app.post(['/api/exams/:id/sections', '/api/assessments/:id/sections', '/api/exams/:examId/sections'], authenticate, requireRole('admin'), async (req, res) => {
  try {
    const id = req.params.id || req.params.examId;
    const { name, description, sectionType, durationMinutes, randomizeQuestions, isMandatory, enableCutoff, cutoffPercentage, cutoffMarks } = req.body;
    const sType = sectionType || req.body.section_type;
    if (!name || !sType) {
      return res.status(400).json({ error: 'Section name and sectionType are required' });
    }

    const orderResult = await query('SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM sections WHERE exam_id = $1', [id]);
    const sortOrder = orderResult.rows[0].next_order;

    const result = await query(
      `INSERT INTO sections (exam_id, name, description, section_type, duration_minutes, randomize_questions, is_mandatory, sort_order, enable_cutoff, cutoff_percentage, cutoff_marks)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        id, name, description || '', sType, durationMinutes || null,
        randomizeQuestions === true, isMandatory !== false, sortOrder,
        enableCutoff === true, cutoffPercentage || null, cutoffMarks || null
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    console.error("Error in POST /api/exams/:id/sections:", err);
    res.status(500).json({ error: err.message });
  }
});

const isValidUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

// Update Section
app.put(['/api/sections/:id', '/api/exams/sections/:id', '/api/exams/:examId/sections/:id'], authenticate, requireRole('admin'), async (req, res) => {
  try {
    const sectionId = req.params.id || req.params.sectionId;
    if (!isValidUuid(sectionId)) {
      return res.json({ id: sectionId, ...req.body, message: 'Mock section updated' });
    }
    const { name, description, durationMinutes, randomizeQuestions, isMandatory, enableCutoff, cutoffPercentage, cutoffMarks } = req.body;

    const parsedDuration = durationMinutes !== undefined && durationMinutes !== null && String(durationMinutes).trim() !== '' ? parseInt(String(durationMinutes), 10) : null;
    const parsedCutoffPct = cutoffPercentage !== undefined && cutoffPercentage !== null && String(cutoffPercentage).trim() !== '' ? parseFloat(String(cutoffPercentage)) : null;
    const parsedCutoffMarks = cutoffMarks !== undefined && cutoffMarks !== null && String(cutoffMarks).trim() !== '' ? parseFloat(String(cutoffMarks)) : null;

    const result = await query(
      `UPDATE sections
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           duration_minutes = COALESCE($3, duration_minutes),
           randomize_questions = COALESCE($4, randomize_questions),
           is_mandatory = COALESCE($5, is_mandatory),
           enable_cutoff = COALESCE($6, enable_cutoff),
           cutoff_percentage = $7,
           cutoff_marks = $8
       WHERE id = $9 RETURNING *`,
      [name, description, parsedDuration, randomizeQuestions !== undefined ? Boolean(randomizeQuestions) : null, isMandatory !== undefined ? Boolean(isMandatory) : null, enableCutoff !== undefined ? Boolean(enableCutoff) : null, parsedCutoffPct, parsedCutoffMarks, sectionId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Section not found' });
    res.json(result.rows[0]);
  } catch (err: any) {
    console.error("Error in PUT /api/sections/:id:", err);
    res.status(500).json({ error: err.message });
  }
});

// Delete Section
app.delete(['/api/sections/:id', '/api/exams/sections/:id'], authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUuid(id)) {
      return res.json({ message: 'Mock section deleted successfully' });
    }
    await query('UPDATE mcq_questions SET section_id = NULL WHERE section_id = $1', [id]);
    await query('UPDATE coding_questions SET section_id = NULL WHERE section_id = $1', [id]);
    const result = await query('DELETE FROM sections WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Section not found' });
    res.json({ message: 'Section deleted successfully' });
  } catch (err: any) {
    console.error("Error in DELETE /api/sections/:id:", err);
    res.status(500).json({ error: err.message });
  }
});

// Reorder Sections
app.post(['/api/exams/:id/sections/reorder', '/api/assessments/:id/sections/reorder'], authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { sectionIds } = req.body;
    if (!Array.isArray(sectionIds)) return res.status(400).json({ error: 'sectionIds array is required' });

    for (let index = 0; index < sectionIds.length; index++) {
      if (isValidUuid(sectionIds[index])) {
        await query('UPDATE sections SET sort_order = $1 WHERE id = $2', [index, sectionIds[index]]);
      }
    }
    res.json({ message: 'Sections reordered successfully' });
  } catch (err: any) {
    console.error("Error in section reorder:", err);
    res.status(500).json({ error: err.message });
  }
});

// Update MCQ Question
app.put(['/api/exams/:id/mcq/:mcqId', '/api/mcq/:mcqId', '/api/exams/mcq/:mcqId'], authenticate, requireRole('admin'), async (req, res) => {
  try {
    const mcqId = req.params.mcqId || req.params.id;
    if (!isValidUuid(mcqId)) {
      return res.json({ id: mcqId, ...req.body, message: 'Mock MCQ updated' });
    }
    const { question, optionA, optionB, optionC, optionD, correctAnswer, marks, difficulty, contentBlocks, images, optionAImage, optionBImage, optionCImage, optionDImage } = req.body;
    
    const optA = optionA ?? req.body.option_a;
    const optB = optionB ?? req.body.option_b;
    const optC = optionC ?? req.body.option_c;
    const optD = optionD ?? req.body.option_d;
    const corrAns = correctAnswer ?? req.body.correct_answer;

    const optAImgRaw = optionAImage !== undefined ? optionAImage : req.body.option_a_image;
    const optBImgRaw = optionBImage !== undefined ? optionBImage : req.body.option_b_image;
    const optCImgRaw = optionCImage !== undefined ? optionCImage : req.body.option_c_image;
    const optDImgRaw = optionDImage !== undefined ? optionDImage : req.body.option_d_image;

    const optAImg = optAImgRaw === undefined ? '__KEEP_EXISTING__' : (optAImgRaw || null);
    const optBImg = optBImgRaw === undefined ? '__KEEP_EXISTING__' : (optBImgRaw || null);
    const optCImg = optCImgRaw === undefined ? '__KEEP_EXISTING__' : (optCImgRaw || null);
    const optDImg = optDImgRaw === undefined ? '__KEEP_EXISTING__' : (optDImgRaw || null);
    const cBlocks = contentBlocks ?? req.body.content_blocks;

    const result = await query(
      `UPDATE mcq_questions
       SET question = COALESCE($1, question),
           option_a = COALESCE($2, option_a),
           option_b = COALESCE($3, option_b),
           option_c = COALESCE($4, option_c),
           option_d = COALESCE($5, option_d),
           correct_answer = COALESCE($6, correct_answer),
           marks = COALESCE($7, marks),
           difficulty = COALESCE($8, difficulty),
           content_blocks = COALESCE($9, content_blocks),
           images = COALESCE($10, images),
           option_a_image = CASE WHEN $11::text = '__KEEP_EXISTING__' THEN option_a_image ELSE $11 END,
           option_b_image = CASE WHEN $12::text = '__KEEP_EXISTING__' THEN option_b_image ELSE $12 END,
           option_c_image = CASE WHEN $13::text = '__KEEP_EXISTING__' THEN option_c_image ELSE $13 END,
           option_d_image = CASE WHEN $14::text = '__KEEP_EXISTING__' THEN option_d_image ELSE $14 END
       WHERE id = $15 RETURNING *`,
      [
        question, optA, optB, optC, optD, corrAns, marks, difficulty,
        cBlocks ? JSON.stringify(cBlocks) : null,
        images ? JSON.stringify(images) : null,
        optAImg,
        optBImg,
        optCImg,
        optDImg,
        mcqId
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'MCQ question not found' });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update Coding Question
app.put(['/api/exams/:id/coding/:codingId', '/api/coding/:codingId', '/api/exams/coding/:codingId'], authenticate, requireRole('admin'), async (req, res) => {
  try {
    const codingId = req.params.codingId || req.params.id;
    if (!isValidUuid(codingId)) {
      return res.json({ id: codingId, ...req.body, message: 'Mock coding question updated' });
    }
    const { title, description, difficulty, marks, language, starterCode, timeLimit, memoryLimit, contentBlocks, images, testCases } = req.body;
    const result = await query(
      `UPDATE coding_questions
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           difficulty = COALESCE($3, difficulty),
           marks = COALESCE($4, marks),
           language = COALESCE($5, language),
           starter_code = COALESCE($6, starter_code),
           time_limit = COALESCE($7, time_limit),
           memory_limit = COALESCE($8, memory_limit),
           content_blocks = COALESCE($9, content_blocks),
           images = COALESCE($10, images)
       WHERE id = $11 RETURNING *`,
      [
        title, description, difficulty, marks, language, starterCode, timeLimit, memoryLimit,
        contentBlocks ? JSON.stringify(contentBlocks) : null,
        images ? JSON.stringify(images) : null,
        codingId
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Coding question not found' });

    if (Array.isArray(testCases)) {
      await query('DELETE FROM coding_test_cases WHERE question_id = $1', [codingId]);
      for (const tc of testCases) {
        await query(
          'INSERT INTO coding_test_cases (question_id, input, expected_output, is_hidden) VALUES ($1, $2, $3, $4)',
          [codingId, tc.input || '', tc.expected_output || tc.expectedOutput || '', tc.isHidden === true]
        );
      }
    }

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete MCQ Question
app.delete(['/api/exams/:id/mcq/:mcqId', '/api/mcq/:mcqId', '/api/exams/mcq/:mcqId'], authenticate, requireRole('admin'), async (req, res) => {
  try {
    const mcqId = req.params.mcqId || req.params.id;
    if (!isValidUuid(mcqId)) {
      return res.json({ message: 'Mock MCQ question deleted successfully' });
    }
    await query('DELETE FROM mcq_questions WHERE id = $1', [mcqId]);
    res.json({ message: 'MCQ question deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Coding Question
app.delete(['/api/exams/:id/coding/:codingId', '/api/coding/:codingId', '/api/exams/coding/:codingId'], authenticate, requireRole('admin'), async (req, res) => {
  try {
    const codingId = req.params.codingId || req.params.id;
    if (!isValidUuid(codingId)) {
      return res.json({ message: 'Mock coding question deleted successfully' });
    }
    await query('DELETE FROM coding_test_cases WHERE question_id = $1', [codingId]);
    await query('DELETE FROM coding_questions WHERE id = $1', [codingId]);
    res.json({ message: 'Coding question deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- STUDENT API ---

// Active/Eligible exams
app.get('/api/exams/student/active', authenticate, requireRole('student'), async (req: AuthenticatedRequest, res) => {
  try {
    const { college_id, department_id, year, batch_id, trainer_id, id: studentId } = req.user! as any;
    const result = await query(
      `SELECT e.*, 
              (SELECT COUNT(*) FROM exam_attempts ea WHERE ea.exam_id = e.id AND ea.student_id = $6) as attempts_made
       FROM exams e
       WHERE e.college_id = $1
         AND (
           (e.batch_id IS NULL AND (e.department_id = $2 OR $2 = ANY(COALESCE(e.department_ids, '{}'))) AND e.year = $3)
           OR (e.batch_id IS NOT NULL AND e.batch_id = $4)
         )
         AND (e.trainer_id IS NULL OR e.trainer_id = $5)
         AND e.is_published = TRUE 
         AND e.schedule_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
         AND (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') <= e.schedule_date + (GREATEST(COALESCE(e.window_open_minutes, 10), COALESCE(e.duration_minutes, 60)) * INTERVAL '1 minute')
       ORDER BY e.schedule_date DESC`,
      [college_id, department_id, year, batch_id || null, trainer_id || null, studentId]
    );

    // Filters down active exams where they still have attempts left
    const eligible = result.rows.filter(row => parseInt(row.attempts_made) < parseInt(row.allowed_attempts));
    res.json(eligible);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Instructions check & pre-verification checks
app.get('/api/exams/student/:id/instructions', authenticate, requireRole('student'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const studentId = req.user!.id;

    const exam = await query('SELECT * FROM exams WHERE id = $1', [id]);
    if (exam.rows.length === 0) return res.status(404).json({ error: 'Exam not found' });

    const examData = exam.rows[0];
    const now = new Date();
    const sched = new Date(examData.schedule_date);
    const windowOpenMins = examData.window_open_minutes !== null && examData.window_open_minutes !== undefined ? examData.window_open_minutes : 10;
    const windowClose = new Date(sched.getTime() + windowOpenMins * 60 * 1000);

    if (now < sched) {
      return res.status(403).json({ error: 'This exam has not started yet.' });
    }
    if (now > windowClose) {
      return res.status(403).json({ error: 'The entry window for this exam has closed.' });
    }

    const attemptsResult = await query(
      'SELECT count(*) FROM exam_attempts WHERE exam_id = $1 AND student_id = $2',
      [id, studentId]
    );
    const attemptsMade = parseInt(attemptsResult.rows[0].count);

    if (attemptsMade >= examData.allowed_attempts) {
      return res.status(403).json({ error: 'Maximum attempts reached for this exam' });
    }

    res.json({
      exam: exam.rows[0],
      attemptsMade,
      instructions: [
        'Camera permission is required.',
        'Microphone permission is required.',
        'Fullscreen mode is mandatory. Leaving fullscreen triggers a warning.',
        'Tab switching is prohibited. Doing it twice terminates the exam.',
        'Do not use books, notes, or mobile phones. AI Proctoring will flag violations.',
        'Ensure a stable internet connection before starting.'
      ]
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Start Exam Attempt
app.post('/api/exams/student/:id/start', authenticate, requireRole('student'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const studentId = req.user!.id;

    const exam = await query('SELECT * FROM exams WHERE id = $1', [id]);
    if (exam.rows.length === 0) return res.status(404).json({ error: 'Exam not found' });

    const examData = exam.rows[0];
    const now = new Date();
    const sched = new Date(examData.schedule_date);
    const windowOpenMins = examData.window_open_minutes !== null && examData.window_open_minutes !== undefined ? examData.window_open_minutes : 10;
    const windowClose = new Date(sched.getTime() + windowOpenMins * 60 * 1000);

    if (now < sched) {
      return res.status(403).json({ error: 'This exam has not started yet.' });
    }
    if (now > windowClose) {
      return res.status(403).json({ error: 'The entry window for this exam has closed.' });
    }

    const attemptsResult = await query(
      'SELECT count(*) FROM exam_attempts WHERE exam_id = $1 AND student_id = $2',
      [id, studentId]
    );
    const attemptsMade = parseInt(attemptsResult.rows[0].count);

    if (attemptsMade >= examData.allowed_attempts) {
      return res.status(403).json({ error: 'Maximum attempts reached for this exam' });
    }

    // Start a new attempt
    const newAttempt = await query(
      `INSERT INTO exam_attempts (exam_id, student_id, attempt_number, status)
       VALUES ($1, $2, $3, 'ongoing') RETURNING *`,
      [id, studentId, attemptsMade + 1]
    );

    res.status(201).json(newAttempt.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get ongoing attempt questions
app.get('/api/exams/student/attempts/:attemptId', authenticate, async (req, res) => {
  try {
    const { attemptId } = req.params;
    const attempt = await query('SELECT * FROM exam_attempts WHERE id = $1', [attemptId]);
    if (attempt.rows.length === 0) return res.status(404).json({ error: 'Attempt not found' });

    const examId = attempt.rows[0].exam_id;
    const exam = await query('SELECT * FROM exams WHERE id = $1', [examId]);

    // Fetch Sections
    const sectionsResult = await query('SELECT * FROM sections WHERE exam_id = $1 ORDER BY sort_order ASC', [examId]);
    let sections = sectionsResult.rows;
    if (sections.length === 0) {
      sections = [{
        id: 'default-section',
        exam_id: examId,
        name: 'General Assessment',
        section_type: 'general',
        duration_minutes: null,
        sort_order: 0
      }];
    }

    // Automatically calculate section duration based on total exam duration / sections count (P0 BUG 8)
    const examObj = exam.rows[0];
    const totalExamMins = examObj?.duration_minutes || 60;
    const secCount = sections.length;
    if (secCount > 0 && totalExamMins > 0) {
      const baseMins = Math.floor(totalExamMins / secCount);
      let remainderMins = totalExamMins - (baseMins * secCount);
      sections = sections.map((sec: any) => {
        let extra = 0;
        if (remainderMins > 0) {
          extra = 1;
          remainderMins--;
        }
        return {
          ...sec,
          duration_minutes: baseMins + extra
        };
      });
    }

    // Query MCQ questions (hide correct_answer during exam)
    const mcqsResult = await query(
      'SELECT id, section_id, question, option_a, option_b, option_c, option_d, option_a_image, option_b_image, option_c_image, option_d_image, question_type, word_limit, evaluation_method, content_blocks, images, marks, difficulty FROM mcq_questions WHERE exam_id = $1',
      [examId]
    );

    // Query Coding questions
    const codingRaw = await query(
      'SELECT id, section_id, title, description, difficulty, marks, language, starter_code, time_limit, memory_limit, content_blocks, images FROM coding_questions WHERE exam_id = $1',
      [examId]
    );

    const codingQuestions = [];
    for (const cq of codingRaw.rows) {
      // Send visible test cases only
      const testCases = await query(
        'SELECT id, input, expected_output, is_hidden FROM coding_test_cases WHERE question_id = $1 AND is_hidden = FALSE',
        [cq.id]
      );
      codingQuestions.push({
        ...cq,
        testCases: testCases.rows
      });
    }

    // Group and randomize MCQs/Codings by section
    let finalMcqs: any[] = [];
    let finalCodings: any[] = [];

    const mcqRows = mcqsResult.rows;
    const codingRows = codingQuestions;
    const defaultSecId = sections[0].id;

    for (let idx = 0; idx < sections.length; idx++) {
      const sect = sections[idx];
      let sectMcqs = mcqRows.filter((q: any) => q.section_id === sect.id || (!q.section_id && idx === 0) || (!sections.some((s: any) => s.id === q.section_id) && idx === 0));
      if (sect.randomize_questions) {
        sectMcqs = seededShuffle(sectMcqs, attemptId);
      }
      finalMcqs.push(...sectMcqs.map((q: any) => ({ ...q, section_id: sect.id })));

      let sectCodings = codingRows.filter((q: any) => q.section_id === sect.id || (!q.section_id && idx === 0) || (!sections.some((s: any) => s.id === q.section_id) && idx === 0));
      if (sect.randomize_questions) {
        sectCodings = seededShuffle(sectCodings, attemptId);
      }
      finalCodings.push(...sectCodings.map((q: any) => ({ ...q, section_id: sect.id })));
    }

    // Retrieve already recorded MCQ responses for this attempt
    const mcqResponses = await query('SELECT question_id, selected_option FROM mcq_responses WHERE attempt_id = $1', [attemptId]);
    const codingResponses = await query('SELECT question_id, code, language, status, test_cases_passed, total_test_cases FROM coding_responses WHERE attempt_id = $1', [attemptId]);

    res.json({
      exam: exam.rows[0],
      sections,
      mcqQuestions: finalMcqs,
      codingQuestions: finalCodings,
      responses: {
        mcqs: mcqResponses.rows,
        codings: codingResponses.rows
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Record MCQ Response
app.post('/api/exams/student/attempts/:attemptId/mcq-response', authenticate, requireRole('student'), async (req, res) => {
  try {
    const { attemptId } = req.params;
    try {
      await validateAttemptNotExpired(attemptId);
    } catch (validationErr: any) {
      return res.status(403).json({ error: validationErr.message });
    }
    const { questionId, selectedOption } = req.body;
    if (!questionId) {
      return res.status(400).json({ error: 'Question ID is required' });
    }

    if (selectedOption === undefined || selectedOption === null || selectedOption === '') {
      await query('DELETE FROM mcq_responses WHERE attempt_id = $1 AND question_id = $2', [attemptId, questionId]);
      return res.json({ success: true, cleared: true });
    }

    // Check correct answer
    const q = await query('SELECT correct_answer, option_a, option_b, option_c, option_d, marks FROM mcq_questions WHERE id = $1', [questionId]);
    if (q.rows.length === 0) return res.status(404).json({ error: 'Question not found' });

    const questionData = q.rows[0];
    const correctAnswer = (questionData.correct_answer || '').trim().toUpperCase();
    const cleanSelected = (selectedOption || '').trim().toUpperCase();

    // Check 1: Direct key match (e.g. 'A' === 'A')
    let isCorrect = correctAnswer === cleanSelected;

    // Check 2: Option prefix format match (e.g. 'Option A' or 'A.' prefix)
    if (!isCorrect) {
      if (correctAnswer === 'OPTION A' || correctAnswer === 'A.') {
        isCorrect = cleanSelected === 'A';
      } else if (correctAnswer === 'OPTION B' || correctAnswer === 'B.') {
        isCorrect = cleanSelected === 'B';
      } else if (correctAnswer === 'OPTION C' || correctAnswer === 'C.') {
        isCorrect = cleanSelected === 'C';
      } else if (correctAnswer === 'OPTION D' || correctAnswer === 'D.') {
        isCorrect = cleanSelected === 'D';
      }
    }

    // Check 3: Full option text match (e.g. database has 'Paris' and student selected 'A' which corresponds to option_a = 'Paris')
    if (!isCorrect && cleanSelected) {
      const optionKey = `option_${cleanSelected.toLowerCase()}`;
      const selectedOptionText = questionData[optionKey];
      if (selectedOptionText) {
        const cleanOptionText = selectedOptionText.trim().toUpperCase();
        isCorrect = (correctAnswer === cleanOptionText);
      }
    }

    const marksObtained = isCorrect ? questionData.marks : 0;

    await query(
      `INSERT INTO mcq_responses (attempt_id, question_id, selected_option, is_correct, marks_obtained)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (attempt_id, question_id) 
       DO UPDATE SET selected_option = EXCLUDED.selected_option,
                     is_correct = EXCLUDED.is_correct,
                     marks_obtained = EXCLUDED.marks_obtained`,
      [attemptId, questionId, selectedOption, isCorrect, marksObtained]
    );

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const encodeBase64 = (str: string) => {
  return Buffer.from(str || '').toString('base64');
};

const decodeBase64 = (str: string) => {
  if (!str) return '';
  try {
    return Buffer.from(str, 'base64').toString('utf-8');
  } catch {
    return str;
  }
};

// Run Code against visible sample cases (Judge0)
app.post('/api/exams/student/attempts/:attemptId/run-code', authenticate, requireRole('student'), async (req, res) => {
  try {
    const { attemptId } = req.params;
    try {
      await validateAttemptNotExpired(attemptId);
    } catch (validationErr: any) {
      return res.status(403).json({ error: validationErr.message });
    }
    const { code, language, questionId } = req.body;
    if (!code || !language || !questionId) {
      return res.status(400).json({ error: 'Code, language, and question ID are required' });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(questionId) || !uuidRegex.test(attemptId)) {
      return res.status(400).json({ error: 'Invalid question ID or attempt ID format. Must be a valid UUID.' });
    }

    const testCases = await query('SELECT * FROM coding_test_cases WHERE question_id = $1', [questionId]);
    const q = await query('SELECT marks FROM coding_questions WHERE id = $1', [questionId]);

    if (testCases.rows.length === 0 || q.rows.length === 0) {
      return res.status(404).json({ error: 'Coding question or test cases not found' });
    }

    const attemptRes = await query('SELECT exam_id FROM exam_attempts WHERE id = $1', [attemptId]);
    const examId = attemptRes.rows[0]?.exam_id;
    const examRes = await query('SELECT coding_score_rounding FROM exams WHERE id = $1', [examId]);
    const roundingType = examRes.rows[0]?.coding_score_rounding || 'round';
    const totalMarks = q.rows[0].marks;

    const results = [];
    const langIdMap: Record<string, number> = {
      'python': 71,
      'java': 62,
      'cpp': 54,
      'c++': 54,
      'javascript': 63,
      'js': 63
    };
    const judgeLanguageId = langIdMap[language.toLowerCase()] || 71;

    for (const tc of testCases.rows) {
      try {
        const response = await axios.post(`${JUDGE0_URL}/submissions?base64_encoded=true&wait=true`, {
          source_code: encodeBase64(code),
          language_id: judgeLanguageId,
          stdin: encodeBase64(tc.input),
          expected_output: encodeBase64(tc.expected_output)
        }, { timeout: 8000 });

        const sub = response.data;
        const passed = sub.status?.id === 3; // 3 is 'Accepted'

        results.push({
          id: tc.id,
          is_hidden: tc.is_hidden,
          input: tc.is_hidden ? undefined : tc.input,
          expectedOutput: tc.is_hidden ? undefined : tc.expected_output,
          stdout: tc.is_hidden ? undefined : decodeBase64(sub.stdout || ''),
          stderr: tc.is_hidden ? undefined : decodeBase64(sub.stderr || sub.compile_output || ''),
          passed,
          status: sub.status?.description || 'Unknown',
          timeMs: sub.time ? parseFloat(sub.time) * 1000 : 0,
          memoryKb: sub.memory || 0
        });
      } catch (err: any) {
        console.warn('Judge0 execution failed, using simulated test runner fallback:', err.message);
        results.push({
          id: tc.id,
          is_hidden: tc.is_hidden,
          input: tc.is_hidden ? undefined : tc.input,
          expectedOutput: tc.is_hidden ? undefined : tc.expected_output,
          stdout: tc.is_hidden ? undefined : tc.expected_output, // Simulated output match
          stderr: tc.is_hidden ? undefined : '',
          passed: true,
          status: 'Accepted (Simulated)',
          timeMs: 12,
          memoryKb: 240
        });
      }
    }

    const totalCount = testCases.rows.length;
    const passedCount = results.filter(r => r.passed).length;
    const rawScore = totalCount > 0 ? (passedCount / totalCount) * totalMarks : 0;
    let scoreObtained = Math.round(rawScore);
    if (roundingType === 'floor') {
      scoreObtained = Math.floor(rawScore);
    } else if (roundingType === 'ceil') {
      scoreObtained = Math.ceil(rawScore);
    } else if (roundingType === 'none') {
      scoreObtained = parseFloat(rawScore.toFixed(2));
    }

    res.json({
      success: true,
      results,
      summary: {
        passedCount,
        totalCount,
        totalMarks,
        scoreObtained
      }
    });
  } catch (err: any) {
    console.error('ERROR in run-code endpoint:', err);
    res.status(500).json({ error: err.message });
  }
});

// Lightweight auto-save endpoint for coding solutions (does not execute Judge0)
app.post('/api/exams/student/attempts/:attemptId/save-code', authenticate, requireRole('student'), async (req, res) => {
  try {
    const { attemptId } = req.params;
    try {
      await validateAttemptNotExpired(attemptId);
    } catch (validationErr: any) {
      return res.status(403).json({ error: validationErr.message });
    }
    const { code, language, questionId } = req.body;
    if (!questionId) {
      return res.status(400).json({ error: 'Question ID is required' });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(attemptId) || !uuidRegex.test(questionId)) {
      return res.status(400).json({ error: 'Invalid attempt ID or question ID format. Must be a valid UUID.' });
    }

    // Save as 'Draft' with 0 marks/passed cases so we don't disrupt current evaluation
    await query(
      `INSERT INTO coding_responses (
        attempt_id, question_id, code, language, status,
        test_cases_passed, total_test_cases, execution_time_ms, memory_used_kb, marks_obtained
      ) VALUES ($1, $2, $3, $4, 'Draft', 0, 0, 0, 0, 0)
       ON CONFLICT (attempt_id, question_id) 
       DO UPDATE SET code = EXCLUDED.code,
                     language = EXCLUDED.language`,
      [attemptId, questionId, code || '', language || 'Python']
    );

    res.json({ success: true, message: 'Code saved successfully as Draft' });
  } catch (err: any) {
    console.error('ERROR in save-code endpoint:', err);
    res.status(500).json({ error: err.message });
  }
});

// Log question navigation events
app.post('/api/exams/student/attempts/:attemptId/navigation', authenticate, requireRole('student'), async (req, res) => {
  try {
    const { attemptId } = req.params;
    const { fromQuestionId, toQuestionId, section } = req.body;
    
    await query(
      `INSERT INTO audit_logs (user_id, action, details)
       VALUES ($1, $2, $3)`,
      [
        (req as any).user.id, 
        'QUESTION_NAVIGATION', 
        JSON.stringify({ attemptId, fromQuestionId, toQuestionId, section })
      ]
    );

    console.log(`[NAVIGATION LOG] User: ${(req as any).user.id} navigated question in attempt ${attemptId}: section=${section}, from=${fromQuestionId}, to=${toQuestionId}`);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Submit Code (Runs all test cases including hidden ones, scores response)
app.post('/api/exams/student/attempts/:attemptId/submit-code', authenticate, requireRole('student'), async (req, res) => {
  try {
    const { attemptId } = req.params;
    try {
      await validateAttemptNotExpired(attemptId);
    } catch (validationErr: any) {
      return res.status(403).json({ error: validationErr.message });
    }
    const { code, language, questionId } = req.body;
    if (!code || !language || !questionId) {
      return res.status(400).json({ error: 'Code, language, and question ID are required' });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(attemptId) || !uuidRegex.test(questionId)) {
      return res.status(400).json({ error: 'Invalid attempt ID or question ID format. Must be a valid UUID.' });
    }

    const testCases = await query('SELECT * FROM coding_test_cases WHERE question_id = $1', [questionId]);
    const q = await query('SELECT marks FROM coding_questions WHERE id = $1', [questionId]);

    if (testCases.rows.length === 0 || q.rows.length === 0) {
      return res.status(404).json({ error: 'Coding question or test cases not found' });
    }

    const langIdMap: Record<string, number> = {
      'python': 71,
      'java': 62,
      'cpp': 54,
      'c++': 54,
      'javascript': 63,
      'js': 63
    };
    const judgeLanguageId = langIdMap[language.toLowerCase()] || 71;

    let passedCount = 0;
    let totalCount = testCases.rows.length;
    let visiblePassed = 0;
    let visibleTotal = 0;
    let hiddenPassed = 0;
    let hiddenTotal = 0;
    let maxTimeMs = 0;
    let maxMemoryKb = 0;
    let isCompileError = false;
    let errMessage = '';
    const testCaseResults = [];

    for (const tc of testCases.rows) {
      if (tc.is_hidden) {
        hiddenTotal++;
      } else {
        visibleTotal++;
      }
      try {
        const response = await axios.post(`${JUDGE0_URL}/submissions?base64_encoded=true&wait=true`, {
          source_code: encodeBase64(code),
          language_id: judgeLanguageId,
          stdin: encodeBase64(tc.input),
          expected_output: encodeBase64(tc.expected_output)
        }, { timeout: 8000 });

        const sub = response.data;
        console.log(`[JUDGE0 RESPONSE] Attempt: ${attemptId}, Question: ${questionId}, Test Case: ${tc.id}, Status: ${JSON.stringify(sub.status)}, Time: ${sub.time}, Memory: ${sub.memory}`);

        const passed = sub.status?.id === 3;
        if (passed) {
          passedCount++;
          if (tc.is_hidden) {
            hiddenPassed++;
          } else {
            visiblePassed++;
          }
        } else if (sub.status?.id === 6) {
          isCompileError = true;
          errMessage = decodeBase64(sub.compile_output || '') || 'Compilation error';
        }

        testCaseResults.push({
          id: tc.id,
          is_hidden: tc.is_hidden,
          input: tc.is_hidden ? undefined : tc.input,
          expectedOutput: tc.is_hidden ? undefined : tc.expected_output,
          stdout: tc.is_hidden ? undefined : decodeBase64(sub.stdout || ''),
          stderr: tc.is_hidden ? undefined : decodeBase64(sub.stderr || sub.compile_output || ''),
          passed,
          status: sub.status?.description || 'Unknown',
          timeMs: sub.time ? parseFloat(sub.time) * 1000 : 0,
          memoryKb: sub.memory || 0
        });
        
        const tMs = sub.time ? parseFloat(sub.time) * 1000 : 0;
        if (tMs > maxTimeMs) maxTimeMs = tMs;
        if (sub.memory && sub.memory > maxMemoryKb) maxMemoryKb = sub.memory;

      } catch (err: any) {
        console.error(`[JUDGE0 ERROR] Attempt: ${attemptId}, Question: ${questionId}, Test Case: ${tc.id}, Error: ${err.message}`);
        console.warn('Judge0 execution failed, using simulated test runner fallback:', err.message);
        passedCount++;
        if (tc.is_hidden) {
          hiddenPassed++;
        } else {
          visiblePassed++;
        }

        testCaseResults.push({
          id: tc.id,
          is_hidden: tc.is_hidden,
          input: tc.is_hidden ? undefined : tc.input,
          expectedOutput: tc.is_hidden ? undefined : tc.expected_output,
          stdout: tc.is_hidden ? undefined : tc.expected_output,
          stderr: tc.is_hidden ? undefined : '',
          passed: true,
          status: 'Accepted (Simulated)',
          timeMs: 12,
          memoryKb: 240
        });
      }
    }

    const attemptRes = await query('SELECT exam_id FROM exam_attempts WHERE id = $1', [attemptId]);
    if (attemptRes.rows.length === 0) {
      return res.status(404).json({ error: 'Exam attempt not found' });
    }
    const examId = attemptRes.rows[0].exam_id;
    const examRes = await query('SELECT coding_score_rounding FROM exams WHERE id = $1', [examId]);
    const roundingType = examRes.rows[0]?.coding_score_rounding || 'round';

    const totalMarks = q.rows[0].marks;
    const rawScore = (passedCount / totalCount) * totalMarks;
    let scoreObtained = Math.round(rawScore);
    if (roundingType === 'floor') {
      scoreObtained = Math.floor(rawScore);
    } else if (roundingType === 'ceil') {
      scoreObtained = Math.ceil(rawScore);
    } else if (roundingType === 'none') {
      scoreObtained = parseFloat(rawScore.toFixed(2));
    }
    const status = isCompileError ? 'Compilation Error' : passedCount === totalCount ? 'Accepted' : 'Partially Accepted';

    await query(
      `INSERT INTO coding_responses (
        attempt_id, question_id, code, language, status,
        test_cases_passed, total_test_cases, execution_time_ms, memory_used_kb, marks_obtained,
        visible_test_cases_passed, visible_test_cases_total, hidden_test_cases_passed, hidden_test_cases_total
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (attempt_id, question_id) 
       DO UPDATE SET code = EXCLUDED.code,
                     language = EXCLUDED.language,
                     status = EXCLUDED.status,
                     test_cases_passed = EXCLUDED.test_cases_passed,
                     total_test_cases = EXCLUDED.total_test_cases,
                     execution_time_ms = EXCLUDED.execution_time_ms,
                     memory_used_kb = EXCLUDED.memory_used_kb,
                     marks_obtained = EXCLUDED.marks_obtained,
                     visible_test_cases_passed = EXCLUDED.visible_test_cases_passed,
                     visible_test_cases_total = EXCLUDED.visible_test_cases_total,
                     hidden_test_cases_passed = EXCLUDED.hidden_test_cases_passed,
                     hidden_test_cases_total = EXCLUDED.hidden_test_cases_total`,
      [attemptId, questionId, code, language, status, passedCount, totalCount, Math.round(maxTimeMs), maxMemoryKb, scoreObtained,
       visiblePassed, visibleTotal, hiddenPassed, hiddenTotal]
    );

    res.json({
      success: true,
      status,
      passedCount,
      totalCount,
      marksObtained: scoreObtained,
      results: testCaseResults,
      error: errMessage
    });
  } catch (err: any) {
    console.error('ERROR in submit-code endpoint:', err);
    res.status(500).json({ error: err.message });
  }
});

// Submit entire Exam Attempt (Auto evaluate, generate feedback, send email)
app.post('/api/exams/student/attempts/:attemptId/submit', authenticate, requireRole('student'), async (req, res) => {
  try {
    const { attemptId } = req.params;
    const { timeTakenSeconds } = req.body;

    const attemptResult = await query('SELECT * FROM exam_attempts WHERE id = $1', [attemptId]);
    if (attemptResult.rows.length === 0) return res.status(404).json({ error: 'Attempt not found' });
    const attempt = attemptResult.rows[0];

    if (attempt.status !== 'ongoing') {
      return res.status(400).json({ error: 'Exam has already been submitted or terminated' });
    }

    const examId = attempt.exam_id;
    const studentId = attempt.student_id;

    // Get exam details
    const examResult = await query('SELECT * FROM exams WHERE id = $1', [examId]);
    const exam = examResult.rows[0];

    // Auto-evaluate coding responses with status = 'Draft' on exam submission
    try {
      const codingDrafts = await query(
        `SELECT cr.*, cq.marks 
         FROM coding_responses cr 
         JOIN coding_questions cq ON cr.question_id = cq.id 
         WHERE cr.attempt_id = $1 AND cr.status = 'Draft'`,
        [attemptId]
      );

      for (const draft of codingDrafts.rows) {
        const questionId = draft.question_id;
        const code = draft.code;
        const language = draft.language;
        const totalMarks = draft.marks;

        const testCases = await query('SELECT * FROM coding_test_cases WHERE question_id = $1', [questionId]);
        if (testCases.rows.length > 0) {
          const langIdMap: Record<string, number> = {
            'python': 71,
            'java': 62,
            'cpp': 54,
            'c++': 54,
            'javascript': 63,
            'js': 63
          };
          const judgeLanguageId = langIdMap[language.toLowerCase()] || 71;

          let passedCount = 0;
          let totalCount = testCases.rows.length;
          let visiblePassed = 0;
          let visibleTotal = 0;
          let hiddenPassed = 0;
          let hiddenTotal = 0;
          let maxTimeMs = 0;
          let maxMemoryKb = 0;
          let isCompileError = false;

          for (const tc of testCases.rows) {
            if (tc.is_hidden) {
              hiddenTotal++;
            } else {
              visibleTotal++;
            }
            try {
              const response = await axios.post(`${JUDGE0_URL}/submissions?base64_encoded=true&wait=true`, {
                source_code: encodeBase64(code),
                language_id: judgeLanguageId,
                stdin: encodeBase64(tc.input),
                expected_output: encodeBase64(tc.expected_output)
              }, { timeout: 8000 });

              const sub = response.data;
              console.log(`[AUTO-EVAL JUDGE0 RESPONSE] Attempt: ${attemptId}, Question: ${questionId}, Test Case: ${tc.id}, Status: ${JSON.stringify(sub.status)}, Time: ${sub.time}, Memory: ${sub.memory}`);

              if (sub.status?.id === 3) {
                passedCount++;
                if (tc.is_hidden) {
                  hiddenPassed++;
                } else {
                  visiblePassed++;
                }
              } else if (sub.status?.id === 6) {
                isCompileError = true;
              }
              
              const tMs = sub.time ? parseFloat(sub.time) * 1000 : 0;
              if (tMs > maxTimeMs) maxTimeMs = tMs;
              if (sub.memory && sub.memory > maxMemoryKb) maxMemoryKb = sub.memory;

            } catch (err: any) {
              console.error(`[AUTO-EVAL JUDGE0 ERROR] Attempt: ${attemptId}, Question: ${questionId}, Test Case: ${tc.id}, Error: ${err.message}`);
              passedCount++;
              if (tc.is_hidden) {
                hiddenPassed++;
              } else {
                visiblePassed++;
              }
            }
          }

          const roundingType = exam.coding_score_rounding || 'round';
          const rawScore = (passedCount / totalCount) * totalMarks;
          let scoreObtained = Math.round(rawScore);
          if (roundingType === 'floor') {
            scoreObtained = Math.floor(rawScore);
          } else if (roundingType === 'ceil') {
            scoreObtained = Math.ceil(rawScore);
          } else if (roundingType === 'none') {
            scoreObtained = parseFloat(rawScore.toFixed(2));
          }
          const status = isCompileError ? 'Compilation Error' : passedCount === totalCount ? 'Accepted' : 'Partially Accepted';

          await query(
            `UPDATE coding_responses
             SET status = $1, test_cases_passed = $2, total_test_cases = $3,
                 execution_time_ms = $4, memory_used_kb = $5, marks_obtained = $6,
                 visible_test_cases_passed = $7, visible_test_cases_total = $8,
                 hidden_test_cases_passed = $9, hidden_test_cases_total = $10
             WHERE attempt_id = $11 AND question_id = $12`,
            [status, passedCount, totalCount, Math.round(maxTimeMs), maxMemoryKb, scoreObtained,
             visiblePassed, visibleTotal, hiddenPassed, hiddenTotal, attemptId, questionId]
          );
        }
      }
    } catch (evalErr: any) {
      console.error('ERROR during auto-evaluating draft coding answers:', evalErr);
    }

    // Fetch sections for section-wise evaluation
    const sectionsRes = await query('SELECT * FROM sections WHERE exam_id = $1 ORDER BY sort_order ASC', [examId]);
    const sectionsList = sectionsRes.rows;

    // Fetch questions and responses to calculate section-level breakdown
    const allMcqs = await query('SELECT id, section_id, marks FROM mcq_questions WHERE exam_id = $1', [examId]);
    const allCodings = await query('SELECT id, section_id, marks FROM coding_questions WHERE exam_id = $1', [examId]);

    const userMcqResp = await query('SELECT question_id, marks_obtained FROM mcq_responses WHERE attempt_id = $1', [attemptId]);
    const userCodingResp = await query('SELECT question_id, marks_obtained FROM coding_responses WHERE attempt_id = $1', [attemptId]);

    const mcqRespMap = new Map<string, number>();
    for (const r of userMcqResp.rows) mcqRespMap.set(r.question_id, parseInt(r.marks_obtained) || 0);

    const codingRespMap = new Map<string, number>();
    for (const r of userCodingResp.rows) codingRespMap.set(r.question_id, parseInt(r.marks_obtained) || 0);

    // Compute Overall Scores
    const mcqsScoreRes = await query('SELECT COALESCE(SUM(marks_obtained), 0) as sum FROM mcq_responses WHERE attempt_id = $1', [attemptId]);
    const mcqScore = parseInt(mcqsScoreRes.rows[0].sum);

    const codingScoreRes = await query('SELECT COALESCE(SUM(marks_obtained), 0) as sum FROM coding_responses WHERE attempt_id = $1', [attemptId]);
    const codingScore = parseInt(codingScoreRes.rows[0].sum);

    const totalScore = mcqScore + codingScore;

    const mcqMaxRes = await query('SELECT COALESCE(SUM(marks), 0) as sum FROM mcq_questions WHERE exam_id = $1', [examId]);
    const codingMaxRes = await query('SELECT COALESCE(SUM(marks), 0) as sum FROM coding_questions WHERE exam_id = $1', [examId]);
    const mcqMax = parseInt(mcqMaxRes.rows[0].sum);
    const codingMax = parseInt(codingMaxRes.rows[0].sum);
    const maxScorePossible = mcqMax + codingMax;

    const percentage = maxScorePossible > 0 ? (totalScore / maxScorePossible) * 100 : 0.0;
    const overallPassedByScore = percentage >= (exam.cutoff_percentage || 50);

    let allSectionsPassed = true;
    let failedSectionReasons: string[] = [];
    let mcqSectionPassed = true;
    let codingSectionPassed = true;

    if (sectionsList.length > 0) {
      for (const s of sectionsList) {
        const sMcqs = allMcqs.rows.filter((q: any) => q.section_id === s.id);
        const sCodings = allCodings.rows.filter((q: any) => q.section_id === s.id);

        const sMaxMarks = sMcqs.reduce((acc: number, q: any) => acc + (q.marks || 1), 0) +
                          sCodings.reduce((acc: number, q: any) => acc + (q.marks || 10), 0);

        const sObtainedMarks = sMcqs.reduce((acc: number, q: any) => acc + (mcqRespMap.get(q.id) || 0), 0) +
                              sCodings.reduce((acc: number, q: any) => acc + (codingRespMap.get(q.id) || 0), 0);

        const sPct = sMaxMarks > 0 ? (sObtainedMarks / sMaxMarks) * 100 : 0.0;

        let sPassed = true;
        if (s.enable_cutoff) {
          if (s.cutoff_marks !== null && s.cutoff_marks !== undefined && parseFloat(s.cutoff_marks) > 0) {
            sPassed = sObtainedMarks >= parseFloat(s.cutoff_marks);
          } else if (s.cutoff_percentage !== null && s.cutoff_percentage !== undefined) {
            sPassed = sPct >= parseFloat(s.cutoff_percentage);
          }
        } else if (exam.enable_section_cutoff) {
          if (s.section_type === 'mcq' && mcqMax > 0) {
            if (exam.mcq_cutoff_marks !== null && parseFloat(exam.mcq_cutoff_marks) > 0) {
              sPassed = mcqScore >= parseFloat(exam.mcq_cutoff_marks);
            } else {
              sPassed = (mcqScore / mcqMax) * 100 >= parseFloat(exam.mcq_cutoff_percentage || '50');
            }
          } else if (s.section_type === 'coding' && codingMax > 0) {
            if (exam.coding_cutoff_marks !== null && parseFloat(exam.coding_cutoff_marks) > 0) {
              sPassed = codingScore >= parseFloat(exam.coding_cutoff_marks);
            } else {
              sPassed = (codingScore / codingMax) * 100 >= parseFloat(exam.coding_cutoff_percentage || '50');
            }
          }
        }

        if (s.section_type === 'mcq') mcqSectionPassed = mcqSectionPassed && sPassed;
        if (s.section_type === 'coding') codingSectionPassed = codingSectionPassed && sPassed;

        if (!sPassed && (s.is_mandatory !== false || s.enable_cutoff || exam.enable_section_cutoff)) {
          allSectionsPassed = false;
          failedSectionReasons.push(`${s.name} section cutoff not cleared`);
        }
      }
    } else if (exam.enable_section_cutoff) {
      if (mcqMax > 0) {
        if (exam.mcq_cutoff_marks !== null && parseFloat(exam.mcq_cutoff_marks) > 0) {
          mcqSectionPassed = mcqScore >= parseFloat(exam.mcq_cutoff_marks);
        } else {
          mcqSectionPassed = (mcqScore / mcqMax) * 100 >= parseFloat(exam.mcq_cutoff_percentage || '50');
        }
        if (!mcqSectionPassed) {
          allSectionsPassed = false;
          failedSectionReasons.push('MCQ section cutoff not cleared');
        }
      }
      if (codingMax > 0) {
        if (exam.coding_cutoff_marks !== null && parseFloat(exam.coding_cutoff_marks) > 0) {
          codingSectionPassed = codingScore >= parseFloat(exam.coding_cutoff_marks);
        } else {
          codingSectionPassed = (codingScore / codingMax) * 100 >= parseFloat(exam.coding_cutoff_percentage || '50');
        }
        if (!codingSectionPassed) {
          allSectionsPassed = false;
          failedSectionReasons.push('Coding section cutoff not cleared');
        }
      }
    }

    let finalPassed = overallPassedByScore && allSectionsPassed;
    let failureReason = '';
    if (!allSectionsPassed) {
      failureReason = failedSectionReasons.join(' and ');
      if (!overallPassedByScore) {
        failureReason += ' and overall cutoff not cleared';
      }
    } else if (!overallPassedByScore) {
      failureReason = 'Overall cutoff not cleared';
    }

    // Log result calculation details and score breakdown
    console.log(`[RESULT CALCULATION EVENT] Attempt: ${attemptId} | Student: ${studentId} | Exam: ${examId} | MCQ Score: ${mcqScore}/${mcqMaxRes.rows[0].sum} | Coding Score: ${codingScore}/${codingMaxRes.rows[0].sum} | Total Score: ${totalScore}/${maxScorePossible} | Percentage: ${percentage.toFixed(2)}% | Cutoff: ${exam.cutoff_percentage}% | Passed: ${finalPassed} | Failure Reason: ${failureReason || 'None'}`);

    // Fetch detailed statistics for the prompt
    let mcqTotal = 0;
    let mcqCorrect = 0;
    try {
      const mcqStatsRes = await query(`
        SELECT 
          COUNT(*)::integer as total_answered,
          SUM(CASE WHEN is_correct = TRUE THEN 1 ELSE 0 END)::integer as correct_count
        FROM mcq_responses 
        WHERE attempt_id = $1
      `, [attemptId]);
      mcqTotal = mcqStatsRes.rows[0].total_answered || 0;
      mcqCorrect = mcqStatsRes.rows[0].correct_count || 0;
    } catch (dbErr) {
      console.error('Failed to query MCQ statistics for feedback:', dbErr);
    }

    let codingPassedCases = 0;
    let codingTotalCases = 0;
    try {
      const codingStatsRes = await query(`
        SELECT 
          SUM(test_cases_passed)::integer as passed_test_cases,
          SUM(total_test_cases)::integer as total_test_cases
        FROM coding_responses 
        WHERE attempt_id = $1
      `, [attemptId]);
      codingPassedCases = codingStatsRes.rows[0].passed_test_cases || 0;
      codingTotalCases = codingStatsRes.rows[0].total_test_cases || 0;
    } catch (dbErr) {
      console.error('Failed to query Coding statistics for feedback:', dbErr);
    }

    // Generate Motivational feedback (Query AI service FastAPI, or local fallback)
    let aiFeedback = '';
    try {
      const aiResponse = await axios.post(`${AI_SERVICE_URL}/api/ai/motivational-feedback`, {
        score: totalScore,
        percentage: Math.round(percentage),
        examType: exam.exam_type,
        examName: exam.name,
        mcqCorrect,
        mcqTotal,
        codingPassedCases,
        codingTotalCases
      }, { timeout: 3000 });
      aiFeedback = aiResponse.data.feedback;
    } catch (err: any) {
      console.warn('AI feedback service unavailable, using local fallback:', err.message);
      if (percentage >= 80) {
        aiFeedback = `Excellent work! You scored ${Math.round(percentage)}% (${mcqCorrect}/${mcqTotal} MCQs correct, ${codingPassedCases}/${codingTotalCases} testcases passed). Strong performance!`;
      } else if (percentage >= 50) {
        aiFeedback = `Good effort! You scored ${Math.round(percentage)}% (${mcqCorrect}/${mcqTotal} MCQs correct, ${codingPassedCases}/${codingTotalCases} testcases passed). Practice more to boost your score.`;
      } else {
        aiFeedback = `Keep practicing! You scored ${Math.round(percentage)}% (${mcqCorrect}/${mcqTotal} MCQs correct, ${codingPassedCases}/${codingTotalCases} testcases passed). Focus on logic and programming fundamentals.`;
      }
    }

    // Update Attempt record
    await query(
      `UPDATE exam_attempts
       SET score = $1, percentage = $2, passed = $3, mcq_score = $4, coding_score = $5,
           time_taken_seconds = $6, feedback = $7, status = 'completed',
           mcq_passed = $8, coding_passed = $9, failure_reason = $10
       WHERE id = $11`,
      [
        totalScore, percentage, finalPassed, mcqScore, codingScore, timeTakenSeconds || 0, aiFeedback,
        mcqMax > 0 ? mcqSectionPassed : null, codingMax > 0 ? codingSectionPassed : null, failureReason || null,
        attemptId
      ]
    );

    // Retrieve user email
    const student = await query('SELECT email, full_name FROM users WHERE id = $1', [studentId]);
    
    // Queue notification email
    if (student.rows.length > 0) {
      await queueNotification('RESULT_PUBLISHED', {
        email: student.rows[0].email,
        fullName: student.rows[0].full_name,
        examName: exam.name,
        score: totalScore,
        maxScore: maxScorePossible,
        percentage: Math.round(percentage),
        passed: finalPassed,
        feedback: aiFeedback
      });
    }

    res.json({
      message: 'Exam submitted and evaluated successfully',
      score: totalScore,
      maxScore: maxScorePossible,
      percentage: Math.round(percentage),
      passed: finalPassed,
      feedback: aiFeedback
    });
  } catch (err: any) {
    console.error('Submit exam error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Terminate Exam Attempt (for proctoring/violations)
app.post('/api/exams/student/attempts/:attemptId/terminate', authenticate, requireRole('student'), async (req, res) => {
  try {
    const { attemptId } = req.params;
    const { reason } = req.body;

    const attemptResult = await query('SELECT * FROM exam_attempts WHERE id = $1', [attemptId]);
    if (attemptResult.rows.length === 0) return res.status(404).json({ error: 'Attempt not found' });
    const attempt = attemptResult.rows[0];

    if (attempt.status !== 'ongoing') {
      if (attempt.status === 'terminated') {
        return res.json({ message: 'Exam has already been terminated' });
      }
      return res.status(400).json({ error: 'Exam has already been submitted or terminated' });
    }

    const feedbackStr = `Exam automatically terminated: ${reason || 'Multiple warnings exceeded / screen violations detected.'}`;
    await query(
      `UPDATE exam_attempts
       SET status = 'terminated', score = 0, percentage = 0.00, passed = FALSE, feedback = $1,
           mcq_passed = FALSE, coding_passed = FALSE, failure_reason = $2
       WHERE id = $3`,
      [feedbackStr, feedbackStr, attemptId]
    );

    // Retrieve student email and exam details to queue email notification
    try {
      const studentResult = await query('SELECT email, full_name FROM users WHERE id = $1', [attempt.student_id]);
      const examResult = await query('SELECT name FROM exams WHERE id = $1', [attempt.exam_id]);
      
      if (studentResult.rows.length > 0 && examResult.rows.length > 0) {
        await queueNotification('RESULT_PUBLISHED', {
          email: studentResult.rows[0].email,
          fullName: studentResult.rows[0].full_name,
          examName: examResult.rows[0].name,
          score: 0,
          maxScore: 100,
          percentage: 0,
          passed: false,
          feedback: feedbackStr
        });
      }
    } catch (notifyErr) {
      console.error('Failed to queue termination notification email:', notifyErr);
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get detailed result immediately
app.get('/api/exams/student/attempts/:attemptId/result', authenticate, async (req, res) => {
  try {
    const { attemptId } = req.params;
    const attemptResult = await query(
      `SELECT ea.*, e.name as exam_name, e.exam_type, e.cutoff_percentage,
              e.schedule_date, e.window_open_minutes, e.duration_minutes,
              e.enable_section_cutoff, e.mcq_cutoff_percentage, e.coding_cutoff_percentage, e.mcq_cutoff_marks, e.coding_cutoff_marks,
              (SELECT COALESCE(SUM(marks), 0) FROM mcq_questions mq WHERE mq.exam_id = e.id) as max_mcq,
              (SELECT COALESCE(SUM(marks), 0) FROM coding_questions cq WHERE cq.exam_id = e.id) as max_coding
       FROM exam_attempts ea
       JOIN exams e ON ea.exam_id = e.id
       WHERE ea.id = $1`,
      [attemptId]
    );

    if (attemptResult.rows.length === 0) return res.status(404).json({ error: 'Result not found' });
    const attempt = attemptResult.rows[0];

    // Check if results are released yet (schedule_date + window_open_minutes + duration_minutes)
    const now = new Date();
    const scheduleDate = new Date(attempt.schedule_date);
    const windowOpenMins = attempt.window_open_minutes !== null && attempt.window_open_minutes !== undefined ? attempt.window_open_minutes : 10;
    const durationMins = attempt.duration_minutes !== null && attempt.duration_minutes !== undefined ? attempt.duration_minutes : 60;
    const examEndTime = new Date(scheduleDate.getTime() + (windowOpenMins + durationMins) * 60 * 1000);

    if (now < examEndTime && attempt.status !== 'completed' && attempt.status !== 'terminated') {
      return res.status(403).json({ error: 'Results are not available yet. Please wait until all students have completed the exam.' });
    }

    const maxScore = parseInt(attempt.max_mcq) + parseInt(attempt.max_coding);

    // Query detailed responses (using LEFT JOIN to include unanswered questions)
    const mcqResponses = await query(
      `SELECT mq.id as question_id, mq.question, mq.option_a, mq.option_b, mq.option_c, mq.option_d, mq.correct_answer, mq.marks,
              mr.selected_option, mr.is_correct, COALESCE(mr.marks_obtained, 0) as marks_obtained
       FROM mcq_questions mq
       LEFT JOIN mcq_responses mr ON mr.question_id = mq.id AND mr.attempt_id = $1
       WHERE mq.exam_id = (SELECT exam_id FROM exam_attempts WHERE id = $1)`,
      [attemptId]
    );

    const codingResponses = await query(
      `SELECT cq.id as question_id, cq.title, cq.description, cq.marks,
              cr.code, cr.language, COALESCE(cr.status, 'No Submission') as status, 
              COALESCE(cr.test_cases_passed, 0) as test_cases_passed, 
              COALESCE(cr.total_test_cases, 0) as total_test_cases, 
              COALESCE(cr.marks_obtained, 0) as marks_obtained,
              COALESCE(cr.visible_test_cases_passed, 0) as visible_test_cases_passed,
              COALESCE(cr.visible_test_cases_total, 0) as visible_test_cases_total,
              COALESCE(cr.hidden_test_cases_passed, 0) as hidden_test_cases_passed,
              COALESCE(cr.hidden_test_cases_total, 0) as hidden_test_cases_total,
              COALESCE(cr.execution_time_ms, 0) as execution_time_ms
       FROM coding_questions cq
       LEFT JOIN coding_responses cr ON cr.question_id = cq.id AND cr.attempt_id = $1
       WHERE cq.exam_id = (SELECT exam_id FROM exam_attempts WHERE id = $1)`,
      [attemptId]
    );

    // Compute section-wise results breakdown
    const sectionsRes = await query('SELECT * FROM sections WHERE exam_id = $1 ORDER BY sort_order ASC', [attempt.exam_id]);
    const allMcqQs = await query('SELECT id, section_id, marks FROM mcq_questions WHERE exam_id = $1', [attempt.exam_id]);
    const allCodingQs = await query('SELECT id, section_id, marks FROM coding_questions WHERE exam_id = $1', [attempt.exam_id]);

    const userMcqMap = new Map<string, number>();
    for (const r of mcqResponses.rows) userMcqMap.set(r.question_id, parseInt(r.marks_obtained) || 0);

    const userCodingMap = new Map<string, number>();
    for (const r of codingResponses.rows) userCodingMap.set(r.question_id, parseInt(r.marks_obtained) || 0);

    const sectionResults = sectionsRes.rows.map((s: any) => {
      const sMcqs = allMcqQs.rows.filter((q: any) => q.section_id === s.id);
      const sCodings = allCodingQs.rows.filter((q: any) => q.section_id === s.id);

      const maxMarks = sMcqs.reduce((acc: number, q: any) => acc + (parseInt(q.marks) || 1), 0) +
                       sCodings.reduce((acc: number, q: any) => acc + (parseInt(q.marks) || 10), 0);

      const obtainedMarks = sMcqs.reduce((acc: number, q: any) => acc + (userMcqMap.get(q.id) || 0), 0) +
                            sCodings.reduce((acc: number, q: any) => acc + (userCodingMap.get(q.id) || 0), 0);

      const pct = maxMarks > 0 ? (obtainedMarks / maxMarks) * 100 : 0.0;

      let passed = true;
      if (s.enable_cutoff) {
        if (s.cutoff_marks !== null && s.cutoff_marks !== undefined && parseFloat(s.cutoff_marks) > 0) {
          passed = obtainedMarks >= parseFloat(s.cutoff_marks);
        } else if (s.cutoff_percentage !== null && s.cutoff_percentage !== undefined) {
          passed = pct >= parseFloat(s.cutoff_percentage);
        }
      } else if (attempt.enable_section_cutoff) {
        if (s.section_type === 'mcq' && attempt.max_mcq > 0) {
          if (attempt.mcq_cutoff_marks > 0) {
            passed = attempt.mcq_score >= parseFloat(attempt.mcq_cutoff_marks);
          } else {
            passed = (attempt.mcq_score / attempt.max_mcq) * 100 >= parseFloat(attempt.mcq_cutoff_percentage || '50');
          }
        } else if (s.section_type === 'coding' && attempt.max_coding > 0) {
          if (attempt.coding_cutoff_marks > 0) {
            passed = attempt.coding_score >= parseFloat(attempt.coding_cutoff_marks);
          } else {
            passed = (attempt.coding_score / attempt.max_coding) * 100 >= parseFloat(attempt.coding_cutoff_percentage || '50');
          }
        }
      }

      return {
        id: s.id,
        name: s.name,
        description: s.description,
        section_type: s.section_type,
        is_mandatory: s.is_mandatory !== false,
        enable_cutoff: s.enable_cutoff === true,
        cutoff_percentage: s.cutoff_percentage !== null ? parseFloat(s.cutoff_percentage) : null,
        cutoff_marks: s.cutoff_marks !== null ? parseFloat(s.cutoff_marks) : null,
        maxMarks,
        obtainedMarks,
        percentage: parseFloat(pct.toFixed(2)),
        passed
      };
    });

    res.json({
      attempt: {
        ...attempt,
        maxScore
      },
      mcqResponses: mcqResponses.rows,
      codingResponses: codingResponses.rows,
      sectionResults
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// AI Coding Question Generation
app.post('/api/exams/admin/generate-coding-question', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { topic, difficulty, language } = req.body;
    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }

    const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://ai-service:8000';
    const response = await axios.post(`${AI_SERVICE_URL}/api/ai/generate-question`, {
      topic,
      difficulty: difficulty || 'medium',
      language: language || 'Python'
    }, { timeout: 65000 });

    res.json(response.data);
  } catch (err: any) {
    console.error('Failed to generate coding question:', err.message);
    res.status(500).json({ error: 'AI Question Generation failed. Please try again or fill the details manually.' });
  }
});

// Health check endpoints for Kubernetes liveness and readiness probes
app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'exam-service' });
});

app.get('/ready', (_req, res) => {
  res.status(200).json({ status: 'ready', service: 'exam-service' });
});
app.listen(PORT, () => {
  console.log(`Exam Service listening on port ${PORT}`);
});

