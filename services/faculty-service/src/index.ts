import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import * as XLSX from 'xlsx';

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Matches the fallback chain used by every other service so tokens issued
// by auth-service verify here too.
const JWT_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'super_secret_access_token_key';

interface AuthenticatedRequest extends express.Request {
  user?: {
    userId: string;
    role: string;
    email: string;
    orgId: string | null;
    permissions?: Record<string, boolean>;
  };
}

// Auth middleware
const authenticate = (
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction
) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'No token' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Faculty or above only
const requireFaculty = (
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction
) => {
  const allowed = ['faculty', 'org_admin', 'super_admin', 'admin'];
  if (!allowed.includes(req.user?.role || '')) {
    return res.status(403).json({ error: 'Faculty access required' });
  }
  next();
};

// Health
app.get('/health', (_, res) =>
  res.json({ status: 'ok', service: 'faculty-service' })
);

app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'faculty-service' });
});

app.get('/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ready', service: 'faculty-service' });
  } catch {
    res.status(503).json({ status: 'not ready' });
  }
});

// A faculty's students come from two places that both got built out in
// Sprint 1: the batch_students junction table (CRT/training batches, where
// students can be from any department/year) and the plain users.batch_id FK
// (the original academic-batch model). Any query counting/listing "my
// students" has to union both or it silently misses one batch type.
const MY_STUDENT_IDS_SUBQUERY = `
  SELECT bs.student_id
  FROM faculty_batches fb
  JOIN batch_students bs ON bs.batch_id = fb.batch_id
  WHERE fb.faculty_id = $1
  UNION
  SELECT u.id as student_id
  FROM faculty_batches fb
  JOIN users u ON u.batch_id = fb.batch_id
  WHERE fb.faculty_id = $1 AND u.role = 'student'
`;

// GET /api/faculty/dashboard
app.get('/api/faculty/dashboard',
  authenticate, requireFaculty,
  async (req: AuthenticatedRequest, res) => {
    try {
      const facultyId = req.user!.userId;

      const [questionBatches, students, myBatches, recentResults] =
        await Promise.all([
          // My question batches
          pool.query(
            `SELECT COUNT(*) as total,
               COUNT(*) FILTER (WHERE status = 'pending') as pending
             FROM question_batches
             WHERE created_by = $1`,
            [facultyId]
          ),
          // Students across all my assigned batches (deduped, both linkage types)
          pool.query(
            `SELECT COUNT(DISTINCT student_id) as total
             FROM (${MY_STUDENT_IDS_SUBQUERY}) my_students`,
            [facultyId]
          ),
          // My assigned batches, with a correct per-batch student count
          pool.query(
            `SELECT b.id, b.name, b.batch_type,
               (
                 SELECT COUNT(DISTINCT student_id) FROM (
                   SELECT student_id FROM batch_students WHERE batch_id = b.id
                   UNION
                   SELECT id as student_id FROM users WHERE batch_id = b.id AND role = 'student'
                 ) batch_students_combined
               ) as student_count
             FROM faculty_batches fb
             JOIN batches b ON b.id = fb.batch_id
             WHERE fb.faculty_id = $1
             ORDER BY b.name`,
            [facultyId]
          ),
          // Recent exam results for my students
          pool.query(
            `SELECT
               e.name as exam_name,
               COUNT(ea.id) as attempt_count,
               ROUND(AVG(ea.percentage)::numeric, 1) as avg_score
             FROM exam_attempts ea
             JOIN exams e ON e.id = ea.exam_id
             WHERE ea.status = 'completed'
               AND ea.student_id IN (${MY_STUDENT_IDS_SUBQUERY})
             GROUP BY e.id, e.name
             ORDER BY MAX(ea.created_at) DESC
             LIMIT 5`,
            [facultyId]
          )
        ]);

      // Get faculty permissions
      const perms = await pool.query(
        `SELECT * FROM faculty_permissions WHERE faculty_id = $1`,
        [facultyId]
      );

      res.json({
        stats: {
          questionBatches: parseInt(questionBatches.rows[0]?.total || '0'),
          pendingApproval: parseInt(questionBatches.rows[0]?.pending || '0'),
          assignedBatches: myBatches.rows.length,
          totalStudents: parseInt(students.rows[0]?.total || '0')
        },
        myBatches: myBatches.rows,
        recentExamResults: recentResults.rows,
        permissions: perms.rows[0] || {}
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/faculty/profile
app.get('/api/faculty/profile',
  authenticate, requireFaculty,
  async (req: AuthenticatedRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT
           u.id, u.full_name, u.email,
           u.phone, u.role, u.status,
           u.org_id, u.created_at,
           o.name as org_name,
           fp.*
         FROM users u
         LEFT JOIN organizations o ON o.id = u.org_id
         LEFT JOIN faculty_permissions fp ON fp.faculty_id = u.id
         WHERE u.id = $1`,
        [req.user!.userId]
      );
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/faculty/question-batches
app.get('/api/faculty/question-batches',
  authenticate, requireFaculty,
  async (req: AuthenticatedRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT
           qb.*,
           COUNT(q.id) as actual_count
         FROM question_batches qb
         LEFT JOIN question_bank q ON q.batch_id = qb.id
         WHERE qb.created_by = $1
         GROUP BY qb.id
         ORDER BY qb.created_at DESC`,
        [req.user!.userId]
      );
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// POST /api/faculty/question-batches
app.post('/api/faculty/question-batches',
  authenticate, requireFaculty,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { name, subject, topic, difficulty, description, tags } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Batch name is required' });
      }

      // Check org settings for approval
      const orgSettings = await pool.query(
        `SELECT settings FROM organizations WHERE id = $1`,
        [req.user!.orgId]
      );
      const settings = orgSettings.rows[0]?.settings || {};
      const requireApproval = settings.requireQuestionApproval || false;

      const result = await pool.query(
        `INSERT INTO question_batches
         (org_id, created_by, name, subject, topic, difficulty, description, tags, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [
          req.user!.orgId,
          req.user!.userId,
          name, subject || null,
          topic || null,
          difficulty || 'mixed',
          description || null,
          tags || null,
          requireApproval ? 'pending' : 'approved'
        ]
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/faculty/question-batches/:id/questions
app.get('/api/faculty/question-batches/:id/questions',
  authenticate, requireFaculty,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query(
        `SELECT * FROM question_bank
         WHERE batch_id = $1
         ORDER BY created_at ASC`,
        [id]
      );
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// POST /api/faculty/questions
// Add single question to a batch
app.post('/api/faculty/questions',
  authenticate, requireFaculty,
  async (req: AuthenticatedRequest, res) => {
    try {
      const {
        batchId, questionType, questionText, subject, topic,
        difficulty, marks, tags, explanation,
        // MCQ
        optionA, optionB, optionC, optionD, correctAnswer,
        // Coding
        title, codingLanguage, starterCode, timeLimit, memoryLimit
      } = req.body;

      if (!batchId || !questionType || !questionText) {
        return res.status(400).json({
          error: 'batchId, questionType and questionText are required'
        });
      }

      // Verify batch belongs to this faculty
      const batch = await pool.query(
        `SELECT id FROM question_batches WHERE id = $1 AND created_by = $2`,
        [batchId, req.user!.userId]
      );
      if (batch.rows.length === 0) {
        return res.status(403).json({ error: 'Batch not found or not owned by you' });
      }

      const result = await pool.query(
        `INSERT INTO question_bank
         (org_id, batch_id, created_by,
          question_type, question_text,
          subject, topic, difficulty,
          marks, tags, explanation,
          option_a, option_b, option_c, option_d, correct_answer,
          title, coding_language, starter_code, time_limit, memory_limit, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'approved')
         RETURNING *`,
        [
          req.user!.orgId,
          batchId,
          req.user!.userId,
          questionType,
          questionText,
          subject || null,
          topic || null,
          difficulty || 'medium',
          marks || 1,
          tags || null,
          explanation || null,
          optionA || null,
          optionB || null,
          optionC || null,
          optionD || null,
          correctAnswer || null,
          title || null,
          codingLanguage || null,
          starterCode || null,
          timeLimit || 30,
          memoryLimit || 256
        ]
      );

      // Update question count on batch
      await pool.query(
        `UPDATE question_batches
         SET question_count = (
           SELECT COUNT(*) FROM question_bank WHERE batch_id = $1
         ),
         updated_at = NOW()
         WHERE id = $1`,
        [batchId]
      );

      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/faculty/questions/excel-template
app.get('/api/faculty/questions/excel-template',
  authenticate, requireFaculty,
  async (req: AuthenticatedRequest, res) => {
    try {
      const headers = ['Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer', 'Marks', 'Difficulty', 'Explanation'];
      const sample = ['What is the correct way to write a Python comment?', '# Comment', '// Comment', '/* Comment */', '<! Comment >', 'A', 1, 'easy', 'Python uses # for single-line comments'];
      const worksheet = XLSX.utils.aoa_to_sheet([headers, sample]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Questions');
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="question_bank_template.xlsx"');
      res.send(buffer);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// POST /api/faculty/questions/bulk-upload
// Parses an uploaded XLSX file and inserts MCQ questions into a batch
app.post('/api/faculty/questions/bulk-upload',
  authenticate, requireFaculty, upload.single('file'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { batchId } = req.body;
      if (!batchId) {
        return res.status(400).json({ error: 'batchId is required' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'Excel file is required' });
      }

      // Verify batch belongs to this faculty
      const batch = await pool.query(
        `SELECT id, org_id FROM question_batches WHERE id = $1 AND created_by = $2`,
        [batchId, req.user!.userId]
      );
      if (batch.rows.length === 0) {
        return res.status(403).json({ error: 'Batch not found or not owned by you' });
      }

      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: null });

      let imported = 0;
      const errors: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // account for header row
        const questionText = row['Question'];
        const optionA = row['Option A'];
        const optionB = row['Option B'];
        const optionC = row['Option C'];
        const optionD = row['Option D'];
        const rawAnswer = row['Correct Answer'];
        const correctAnswer = typeof rawAnswer === 'string' ? rawAnswer.trim().toLowerCase() : rawAnswer;

        if (!questionText || !optionA || !optionB || !optionC || !optionD) {
          errors.push(`Row ${rowNum}: missing question text or options`);
          continue;
        }
        if (!['a', 'b', 'c', 'd'].includes(correctAnswer)) {
          errors.push(`Row ${rowNum}: Correct Answer must be A, B, C or D`);
          continue;
        }

        const marks = Number(row['Marks']) || 1;
        const difficulty = row['Difficulty'] || 'medium';
        const explanation = row['Explanation'] || null;

        try {
          await pool.query(
            `INSERT INTO question_bank
             (org_id, batch_id, created_by,
              question_type, question_text,
              difficulty, marks, explanation,
              option_a, option_b, option_c, option_d, correct_answer, status)
             VALUES ($1,$2,$3,'mcq',$4,$5,$6,$7,$8,$9,$10,$11,$12,'approved')`,
            [
              batch.rows[0].org_id,
              batchId,
              req.user!.userId,
              questionText,
              difficulty,
              marks,
              explanation,
              optionA, optionB, optionC, optionD,
              correctAnswer
            ]
          );
          imported++;
        } catch (rowErr: any) {
          errors.push(`Row ${rowNum}: ${rowErr.message}`);
        }
      }

      if (imported > 0) {
        await pool.query(
          `UPDATE question_batches
           SET question_count = (
             SELECT COUNT(*) FROM question_bank WHERE batch_id = $1
           ),
           updated_at = NOW()
           WHERE id = $1`,
          [batchId]
        );
      }

      res.json({ imported, total: rows.length, errors });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// DELETE /api/faculty/questions/:id
app.delete('/api/faculty/questions/:id',
  authenticate, requireFaculty,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      // Only delete if created by this faculty
      const result = await pool.query(
        `DELETE FROM question_bank
         WHERE id = $1 AND created_by = $2
         RETURNING batch_id`,
        [id, req.user!.userId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Question not found' });
      }
      // Update batch count
      await pool.query(
        `UPDATE question_batches
         SET question_count = (
           SELECT COUNT(*) FROM question_bank WHERE batch_id = $1
         )
         WHERE id = $1`,
        [result.rows[0].batch_id]
      );
      res.json({ message: 'Question deleted' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/faculty/students
app.get('/api/faculty/students',
  authenticate, requireFaculty,
  async (req: AuthenticatedRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT DISTINCT
           u.id, u.full_name, u.email,
           u.roll_number, u.status,
           d.name as department,
           b.name as batch_name
         FROM users u
         JOIN (
           SELECT bs.student_id, fb.batch_id
           FROM faculty_batches fb
           JOIN batch_students bs ON bs.batch_id = fb.batch_id
           WHERE fb.faculty_id = $1
           UNION
           SELECT u2.id as student_id, fb.batch_id
           FROM faculty_batches fb
           JOIN users u2 ON u2.batch_id = fb.batch_id
           WHERE fb.faculty_id = $1 AND u2.role = 'student'
         ) my_students ON my_students.student_id = u.id
         JOIN batches b ON b.id = my_students.batch_id
         LEFT JOIN departments d ON d.id = u.department_id
         WHERE u.role = 'student'
         ORDER BY u.full_name`,
        [req.user!.userId]
      );
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/faculty/notifications
app.get('/api/faculty/notifications',
  authenticate, requireFaculty,
  async (req: AuthenticatedRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT * FROM in_app_notifications
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [req.user!.userId]
      );
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// POST /api/faculty/notifications/read/:id
app.post('/api/faculty/notifications/read/:id',
  authenticate, requireFaculty,
  async (req: AuthenticatedRequest, res) => {
    try {
      await pool.query(
        `UPDATE in_app_notifications
         SET is_read = true
         WHERE id = $1 AND user_id = $2`,
        [req.params.id, req.user!.userId]
      );
      res.json({ message: 'Marked as read' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

const PORT = process.env.PORT || 4011;
app.listen(PORT, () => {
  console.log(`Faculty Service running on ${PORT}`);
});

export default app;
