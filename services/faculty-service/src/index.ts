import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { randomUUID } from 'crypto';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Rich question content (images, code snippets) — matches the columns
// exam-service already added to mcq_questions/coding_questions.
pool.query(`
  ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS content_blocks JSONB DEFAULT '[]'::jsonb;
  ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;
  ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS option_a_image TEXT DEFAULT '';
  ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS option_b_image TEXT DEFAULT '';
  ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS option_c_image TEXT DEFAULT '';
  ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS option_d_image TEXT DEFAULT '';
`).catch(err => {
  console.log('DB Column rich questions addition log (faculty-service):', err.message);
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

// DELETE /api/faculty/question-batches/:id — only the faculty who created it
app.delete('/api/faculty/question-batches/:id',
  authenticate, requireFaculty,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;

      const batch = await pool.query(
        `SELECT id FROM question_batches WHERE id = $1 AND created_by = $2`,
        [id, req.user!.userId]
      );
      if (batch.rows.length === 0) {
        return res.status(404).json({ error: 'Batch not found or not yours' });
      }

      const inUse = await pool.query(
        `SELECT COUNT(*) as count FROM question_bank WHERE batch_id = $1 AND usage_count > 0`,
        [id]
      );
      if (parseInt(inUse.rows[0].count) > 0) {
        return res.status(409).json({ error: 'Cannot delete: questions from this batch are used in exams' });
      }

      // question_bank_test_cases -> question_bank -> question_batches are all
      // ON DELETE CASCADE (see auth-service/db.ts migrations 7-9), so deleting
      // the batch row alone cleans up its questions and test cases.
      await pool.query(`DELETE FROM question_batches WHERE id = $1`, [id]);

      res.json({ message: 'Batch deleted' });
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
        `SELECT
           q.*,
           COALESCE(
             json_agg(
               json_build_object(
                 'input', tc.input,
                 'expectedOutput', tc.expected_output,
                 'isHidden', tc.is_hidden
               )
             ) FILTER (WHERE tc.id IS NOT NULL),
             '[]'
           ) as test_cases
         FROM question_bank q
         LEFT JOIN question_bank_test_cases tc ON tc.question_id = q.id
         WHERE q.batch_id = $1
         GROUP BY q.id
         ORDER BY q.created_at ASC`,
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
        optionAImage, optionBImage, optionCImage, optionDImage,
        // Coding
        title, codingLanguage, starterCode, timeLimit, memoryLimit,
        // Rich content (shared)
        contentBlocks, images,
        testCases
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
          option_a_image, option_b_image, option_c_image, option_d_image,
          title, coding_language, starter_code, time_limit, memory_limit,
          content_blocks, images, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,'approved')
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
          optionAImage || '',
          optionBImage || '',
          optionCImage || '',
          optionDImage || '',
          title || null,
          codingLanguage || null,
          starterCode || null,
          timeLimit || 30,
          memoryLimit || 256,
          JSON.stringify(contentBlocks || []),
          JSON.stringify(images || [])
        ]
      );

      const questionId = result.rows[0].id;

      if (Array.isArray(testCases) && testCases.length > 0) {
        for (const tc of testCases) {
          if (!tc.input && !tc.expectedOutput) {
            continue;
          }
          await pool.query(
            `INSERT INTO question_bank_test_cases
             (question_id, input, expected_output, is_hidden)
             VALUES ($1, $2, $3, $4)`,
            [
              questionId,
              tc.input || '',
              tc.expectedOutput || '',
              tc.isHidden || false
            ]
          );
        }
      }

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
      const headers = [
        'Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer', 'Marks', 'Difficulty', 'Explanation',
        'Question Image URL', 'Option A Image URL', 'Option B Image URL', 'Option C Image URL', 'Option D Image URL',
        'Code Snippet', 'Code Language'
      ];
      const sample = [
        'What is the correct way to write a Python comment?', '# Comment', '// Comment', '/* Comment */', '<! Comment >', 'A', 1, 'easy', 'Python uses # for single-line comments',
        '', '', '', '', '',
        'print("hello")  # this is a comment', 'python'
      ];
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

        const questionImageUrl = row['Question Image URL'] || null;
        const optionAImage = row['Option A Image URL'] || '';
        const optionBImage = row['Option B Image URL'] || '';
        const optionCImage = row['Option C Image URL'] || '';
        const optionDImage = row['Option D Image URL'] || '';
        const codeSnippet = row['Code Snippet'] || null;
        const codeLanguage = row['Code Language'] || 'text';

        const images = questionImageUrl ? [questionImageUrl] : [];
        const contentBlocks = codeSnippet
          ? [{ id: randomUUID(), type: 'code', content: String(codeSnippet), language: codeLanguage }]
          : [];

        try {
          await pool.query(
            `INSERT INTO question_bank
             (org_id, batch_id, created_by,
              question_type, question_text,
              difficulty, marks, explanation,
              option_a, option_b, option_c, option_d, correct_answer,
              option_a_image, option_b_image, option_c_image, option_d_image,
              content_blocks, images, status)
             VALUES ($1,$2,$3,'mcq',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'approved')`,
            [
              batch.rows[0].org_id,
              batchId,
              req.user!.userId,
              questionText,
              difficulty,
              marks,
              explanation,
              optionA, optionB, optionC, optionD,
              correctAnswer,
              optionAImage, optionBImage, optionCImage, optionDImage,
              JSON.stringify(contentBlocks), JSON.stringify(images)
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

// POST /api/faculty/questions/bulk-upload-csv
// Mirrors the admin exam wizard's CSV-paste import flow, but saves into question_bank
app.post('/api/faculty/questions/bulk-upload-csv',
  authenticate, requireFaculty,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { batchId, csvText } = req.body;

      if (!batchId || !csvText) {
        return res.status(400).json({ error: 'batchId and csvText required' });
      }

      // Verify batch ownership
      const batch = await pool.query(
        `SELECT id, org_id FROM question_batches WHERE id = $1 AND created_by = $2`,
        [batchId, req.user!.userId]
      );
      if (batch.rows.length === 0) {
        return res.status(403).json({ error: 'Batch not found or not yours' });
      }

      // Parse CSV — same format as admin
      // Columns: Question, Option A, Option B, Option C, Option D, Correct Answer, Marks, Difficulty
      const lines = csvText
        .split('\n')
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 0);

      if (lines.length < 2) {
        return res.status(400).json({ error: 'CSV must have header + data rows' });
      }

      // Skip header row
      const dataLines = lines.slice(1);
      let imported = 0;
      let failed = 0;
      const errors: string[] = [];

      for (let i = 0; i < dataLines.length; i++) {
        const row = dataLines[i];

        // Handle quoted CSV
        const cols: string[] = [];
        let current = '';
        let inQuotes = false;
        for (const char of row) {
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            cols.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        cols.push(current.trim());

        const question = cols[0] || '';
        const optA = cols[1] || '';
        const optB = cols[2] || '';
        const optC = cols[3] || '';
        const optD = cols[4] || '';
        const answer = (cols[5] || 'a').toLowerCase().trim();
        const marks = parseInt(cols[6]) || 1;
        const difficulty = (cols[7] || 'medium').toLowerCase().trim();

        if (!question) {
          failed++;
          errors.push(`Row ${i + 2}: Question text empty`);
          continue;
        }
        if (!optA || !optB) {
          failed++;
          errors.push(`Row ${i + 2}: Options A and B required`);
          continue;
        }
        if (!['a', 'b', 'c', 'd'].includes(answer)) {
          failed++;
          errors.push(`Row ${i + 2}: Answer must be a/b/c/d`);
          continue;
        }

        try {
          await pool.query(
            `INSERT INTO question_bank
             (org_id, batch_id, created_by,
              question_type, question_text,
              option_a, option_b, option_c, option_d, correct_answer,
              marks, difficulty, status)
             VALUES ($1,$2,$3,'mcq',$4,$5,$6,$7,$8,$9,$10,$11,'approved')`,
            [
              batch.rows[0].org_id,
              batchId,
              req.user!.userId,
              question,
              optA, optB,
              optC || null,
              optD || null,
              answer, marks,
              ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium'
            ]
          );
          imported++;
        } catch (dbErr: any) {
          failed++;
          errors.push(`Row ${i + 2}: ${dbErr.message}`);
        }
      }

      // Update batch count
      await pool.query(
        `UPDATE question_batches
         SET question_count = (
           SELECT COUNT(*) FROM question_bank WHERE batch_id = $1
         ), updated_at = NOW()
         WHERE id = $1`,
        [batchId]
      );

      res.json({
        imported,
        failed,
        total: dataLines.length,
        errors: errors.slice(0, 10),
        message: `${imported} imported, ${failed} failed`
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// PUT /api/faculty/questions/:id
app.put('/api/faculty/questions/:id',
  authenticate, requireFaculty,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const {
        questionText, optionA, optionB, optionC, optionD,
        optionAImage, optionBImage, optionCImage, optionDImage,
        correctAnswer, marks, difficulty,
        subject, topic, explanation, tags,
        contentBlocks, images,
        title, codingLanguage, starterCode, timeLimit, memoryLimit,
        testCases
      } = req.body;

      // Verify ownership
      const existing = await pool.query(
        `SELECT id, batch_id FROM question_bank WHERE id = $1 AND created_by = $2`,
        [id, req.user!.userId]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Question not found' });
      }

      const result = await pool.query(
        `UPDATE question_bank SET
           question_text = COALESCE($1, question_text),
           option_a = $2,
           option_b = $3,
           option_c = $4,
           option_d = $5,
           option_a_image = $6,
           option_b_image = $7,
           option_c_image = $8,
           option_d_image = $9,
           correct_answer = $10,
           marks = COALESCE($11, marks),
           difficulty = COALESCE($12, difficulty),
           subject = $13,
           topic = $14,
           explanation = $15,
           tags = $16,
           content_blocks = $17::jsonb,
           images = $18::jsonb,
           title = $19,
           coding_language = $20,
           starter_code = $21,
           time_limit = $22,
           memory_limit = $23,
           updated_at = NOW()
         WHERE id = $24
         RETURNING *`,
        [
          questionText || null,
          optionA || null,
          optionB || null,
          optionC || null,
          optionD || null,
          optionAImage || '',
          optionBImage || '',
          optionCImage || '',
          optionDImage || '',
          correctAnswer || null,
          marks || null,
          difficulty || null,
          subject || null,
          topic || null,
          explanation || null,
          Array.isArray(tags) && tags.length > 0 ? tags : null,
          JSON.stringify(contentBlocks || []),
          JSON.stringify(images || []),
          title || null,
          codingLanguage || null,
          starterCode || null,
          timeLimit || 30,
          memoryLimit || 256,
          id
        ]
      );

      if (Array.isArray(testCases)) {
        await pool.query(
          `DELETE FROM question_bank_test_cases WHERE question_id = $1`,
          [id]
        );
        for (const tc of testCases) {
          if (!tc.input && !tc.expectedOutput) {
            continue;
          }
          await pool.query(
            `INSERT INTO question_bank_test_cases
             (question_id, input, expected_output, is_hidden)
             VALUES ($1, $2, $3, $4)`,
            [
              id,
              tc.input || '',
              tc.expectedOutput || '',
              tc.isHidden || false
            ]
          );
        }
      }

      res.json(result.rows[0]);
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
