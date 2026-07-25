import { Pool, types } from 'pg';
types.setTypeParser(1114, (str) => new Date(str.replace(' ', 'T') + 'Z'));
import * as bcrypt from 'bcryptjs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@postgres:5432/clahan?sslmode=disable',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle pg client in auth-service:', err);
});

export const query = (text: string, params?: any[]) => pool.query(text, params);

export async function initDb() {
  console.log('Initializing database tables...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create Colleges
    await client.query(`
      CREATE TABLE IF NOT EXISTS colleges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create Departments
    await client.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        college_id UUID REFERENCES colleges(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(college_id, name)
      );
    `);

    // Create Batches Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS batches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        college_id UUID REFERENCES colleges(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(college_id, name)
      );
    `);

    // Create Trainers Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS trainers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        college_id UUID REFERENCES colleges(id) ON DELETE CASCADE,
        batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(50),
        specialization VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create Users
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'student')),
        full_name VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        roll_number VARCHAR(100),
        college_id UUID REFERENCES colleges(id) ON DELETE SET NULL,
        department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
        batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
        year VARCHAR(50),
        status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended')),
        github_profile VARCHAR(255),
        linkedin_profile VARCHAR(255),
        profile_photo_url VARCHAR(500),
        otp_secret VARCHAR(255),
        email_verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create Exams
    await client.query(`
      CREATE TABLE IF NOT EXISTS exams (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        exam_type VARCHAR(50) NOT NULL CHECK (exam_type IN ('mcq', 'coding', 'both')),
        duration_minutes INTEGER NOT NULL,
        cutoff_percentage INTEGER DEFAULT 50,
        allowed_attempts INTEGER DEFAULT 1,
        schedule_date TIMESTAMP NOT NULL,
        college_id UUID REFERENCES colleges(id) ON DELETE CASCADE,
        department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
        department_ids UUID[],
        batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
        year VARCHAR(50),
        window_open_minutes INTEGER DEFAULT 10,
        is_published BOOLEAN DEFAULT FALSE,
        enable_face_detection BOOLEAN DEFAULT TRUE,
        enable_section_cutoff BOOLEAN DEFAULT FALSE,
        mcq_cutoff_percentage DECIMAL(5, 2) DEFAULT 50.00,
        coding_cutoff_percentage DECIMAL(5, 2) DEFAULT 50.00,
        mcq_cutoff_marks DECIMAL(5, 2) DEFAULT 0.00,
        coding_cutoff_marks DECIMAL(5, 2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migrate existing DB if needed
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES batches(id) ON DELETE SET NULL;
    `);

    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS raw_password VARCHAR(255);
    `);

    await client.query(`
      ALTER TABLE exams ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES batches(id) ON DELETE SET NULL;
    `);

    await client.query(`
      ALTER TABLE exams ADD COLUMN IF NOT EXISTS window_open_minutes INTEGER DEFAULT 10;
    `);

    await client.query(`
      ALTER TABLE exams ADD COLUMN IF NOT EXISTS department_ids UUID[];
    `);

    await client.query(`
      UPDATE exams SET department_ids = ARRAY[department_id] WHERE department_ids IS NULL AND department_id IS NOT NULL;
    `);

    await client.query(`
      ALTER TABLE exams ALTER COLUMN year DROP NOT NULL;
    `);

    await client.query(`
      ALTER TABLE exams ADD COLUMN IF NOT EXISTS coding_score_rounding VARCHAR(50) DEFAULT 'round';
    `);

    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS trainer_id UUID REFERENCES trainers(id) ON DELETE SET NULL;
    `);

    await client.query(`
      ALTER TABLE exams ADD COLUMN IF NOT EXISTS trainer_id UUID REFERENCES trainers(id) ON DELETE SET NULL;
    `);

    await client.query(`
      ALTER TABLE exams ADD COLUMN IF NOT EXISTS enable_face_detection BOOLEAN DEFAULT TRUE;
    `);

    await client.query(`
      ALTER TABLE exams ADD COLUMN IF NOT EXISTS enable_section_cutoff BOOLEAN DEFAULT FALSE;
      ALTER TABLE exams ADD COLUMN IF NOT EXISTS mcq_cutoff_percentage DECIMAL(5,2) DEFAULT 50.00;
      ALTER TABLE exams ADD COLUMN IF NOT EXISTS coding_cutoff_percentage DECIMAL(5,2) DEFAULT 50.00;
      ALTER TABLE exams ADD COLUMN IF NOT EXISTS mcq_cutoff_marks DECIMAL(5,2) DEFAULT 0.00;
      ALTER TABLE exams ADD COLUMN IF NOT EXISTS coding_cutoff_marks DECIMAL(5,2) DEFAULT 0.00;
    `);

    // Create Sections Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        section_type VARCHAR(50) NOT NULL,
        duration_minutes INTEGER,
        randomize_questions BOOLEAN DEFAULT FALSE,
        is_mandatory BOOLEAN DEFAULT TRUE,
        sort_order INTEGER DEFAULT 0,
        enable_cutoff BOOLEAN DEFAULT FALSE,
        cutoff_percentage DECIMAL(5, 2) DEFAULT NULL,
        cutoff_marks DECIMAL(5, 2) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);


    // MCQ Questions
    await client.query(`
      CREATE TABLE IF NOT EXISTS mcq_questions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
        question TEXT NOT NULL,
        option_a TEXT NOT NULL,
        option_b TEXT NOT NULL,
        option_c TEXT NOT NULL,
        option_d TEXT NOT NULL,
        correct_answer VARCHAR(10) NOT NULL,
        marks INTEGER DEFAULT 1,
        difficulty VARCHAR(50) DEFAULT 'medium',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migration to increase correct_answer length constraint
    await client.query(`
      ALTER TABLE mcq_questions ALTER COLUMN correct_answer TYPE VARCHAR(255);
    `);

    // Coding Questions
    await client.query(`
      CREATE TABLE IF NOT EXISTS coding_questions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        difficulty VARCHAR(50) DEFAULT 'medium',
        marks INTEGER DEFAULT 10,
        language VARCHAR(50) NOT NULL,
        time_limit INTEGER DEFAULT 2000,
        memory_limit INTEGER DEFAULT 512000,
        starter_code TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Coding Test Cases
    await client.query(`
      CREATE TABLE IF NOT EXISTS coding_test_cases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        question_id UUID REFERENCES coding_questions(id) ON DELETE CASCADE,
        input TEXT NOT NULL,
        expected_output TEXT NOT NULL,
        is_hidden BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS exam_attempts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
        student_id UUID REFERENCES users(id) ON DELETE CASCADE,
        attempt_number INTEGER NOT NULL,
        score INTEGER DEFAULT 0,
        percentage DECIMAL(5, 2) DEFAULT 0.00,
        passed BOOLEAN DEFAULT FALSE,
        mcq_score INTEGER DEFAULT 0,
        coding_score INTEGER DEFAULT 0,
        time_taken_seconds INTEGER DEFAULT 0,
        feedback TEXT,
        status VARCHAR(50) DEFAULT 'ongoing' CHECK (status IN ('ongoing', 'completed', 'terminated')),
        mcq_passed BOOLEAN,
        coding_passed BOOLEAN,
        failure_reason VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS mcq_passed BOOLEAN;
      ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS coding_passed BOOLEAN;
      ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS failure_reason VARCHAR(255);
    `);

    // MCQ Responses
    await client.query(`
      CREATE TABLE IF NOT EXISTS mcq_responses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        attempt_id UUID REFERENCES exam_attempts(id) ON DELETE CASCADE,
        question_id UUID REFERENCES mcq_questions(id) ON DELETE CASCADE,
        selected_option VARCHAR(10) NOT NULL,
        is_correct BOOLEAN DEFAULT FALSE,
        marks_obtained INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(attempt_id, question_id)
      );
    `);

    // Coding Responses
    await client.query(`
      CREATE TABLE IF NOT EXISTS coding_responses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        attempt_id UUID REFERENCES exam_attempts(id) ON DELETE CASCADE,
        question_id UUID REFERENCES coding_questions(id) ON DELETE CASCADE,
        code TEXT NOT NULL,
        language VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL,
        test_cases_passed INTEGER DEFAULT 0,
        total_test_cases INTEGER DEFAULT 0,
        execution_time_ms INTEGER DEFAULT 0,
        memory_used_kb INTEGER DEFAULT 0,
        marks_obtained INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(attempt_id, question_id)
      );
    `);

    // Ensure the new columns exist on coding_responses
    await client.query(`
      ALTER TABLE coding_responses ADD COLUMN IF NOT EXISTS visible_test_cases_passed INTEGER DEFAULT 0;
      ALTER TABLE coding_responses ADD COLUMN IF NOT EXISTS visible_test_cases_total INTEGER DEFAULT 0;
      ALTER TABLE coding_responses ADD COLUMN IF NOT EXISTS hidden_test_cases_passed INTEGER DEFAULT 0;
      ALTER TABLE coding_responses ADD COLUMN IF NOT EXISTS hidden_test_cases_total INTEGER DEFAULT 0;
    `);

    // Proctoring Logs
    await client.query(`
      CREATE TABLE IF NOT EXISTS proctoring_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        attempt_id UUID REFERENCES exam_attempts(id) ON DELETE CASCADE,
        event_type VARCHAR(100) NOT NULL,
        details TEXT,
        screenshot TEXT,
        severity VARCHAR(50) DEFAULT 'warning' CHECK (severity IN ('warning', 'critical')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      ALTER TABLE proctoring_logs ADD COLUMN IF NOT EXISTS screenshot TEXT;
    `);

    // Settings
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(255) PRIMARY KEY,
        value JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Audit Logs
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(255) NOT NULL,
        details TEXT,
        ip_address VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure section_id columns and section cutoff columns exist
    await client.query(`
      ALTER TABLE mcq_questions ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES sections(id) ON DELETE SET NULL;
      ALTER TABLE coding_questions ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES sections(id) ON DELETE SET NULL;
      ALTER TABLE sections ADD COLUMN IF NOT EXISTS enable_cutoff BOOLEAN DEFAULT FALSE;
      ALTER TABLE sections ADD COLUMN IF NOT EXISTS cutoff_percentage DECIMAL(5, 2) DEFAULT NULL;
      ALTER TABLE sections ADD COLUMN IF NOT EXISTS cutoff_marks DECIMAL(5, 2) DEFAULT NULL;
    `);

    // Run data migration for older exams that do not have sections configured
    const examsRes = await client.query('SELECT id, exam_type FROM exams');
    for (const exam of examsRes.rows) {
      const sectCheck = await client.query('SELECT id FROM sections WHERE exam_id = $1 LIMIT 1', [exam.id]);
      if (sectCheck.rows.length === 0) {
        // Exam has no sections, check if it contains questions
        const mcqCountRes = await client.query('SELECT COUNT(*)::int as count FROM mcq_questions WHERE exam_id = $1', [exam.id]);
        const codingCountRes = await client.query('SELECT COUNT(*)::int as count FROM coding_questions WHERE exam_id = $1', [exam.id]);
        const mcqCount = mcqCountRes.rows[0].count;
        const codingCount = codingCountRes.rows[0].count;

        const hasMcq = exam.exam_type === 'mcq' || exam.exam_type === 'both' || mcqCount > 0;
        const hasCoding = exam.exam_type === 'coding' || exam.exam_type === 'both' || codingCount > 0;

        if (hasMcq) {
          const newSect = await client.query(`
            INSERT INTO sections (exam_id, name, section_type, randomize_questions, is_mandatory, sort_order)
            VALUES ($1, 'MCQ Section', 'mcq', FALSE, TRUE, 0) RETURNING id
          `, [exam.id]);
          const sectId = newSect.rows[0].id;
          await client.query('UPDATE mcq_questions SET section_id = $1 WHERE exam_id = $2', [sectId, exam.id]);
        }

        if (hasCoding) {
          const newSect = await client.query(`
            INSERT INTO sections (exam_id, name, section_type, randomize_questions, is_mandatory, sort_order)
            VALUES ($1, 'Coding Section', 'coding', FALSE, TRUE, 1) RETURNING id
          `, [exam.id]);
          const sectId = newSect.rows[0].id;
          await client.query('UPDATE coding_questions SET section_id = $1 WHERE exam_id = $2', [sectId, exam.id]);
        }
      }
    }

    // Seed default admin if none exists
    const adminCheck = await client.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    if (adminCheck.rows.length === 0) {
      const hashedPw = await bcrypt.hash('Admin@123', 10);
      await client.query(`
        INSERT INTO users (email, password_hash, role, full_name, email_verified, status)
        VALUES ('admin@clahan.com', $1, 'admin', 'Default Admin', TRUE, 'active')
      `, [hashedPw]);
      console.log('Seeded default admin account (admin@clahan.com / Admin@123)');
    }

    await client.query('COMMIT');
    console.log('Database tables successfully verified/created.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error initializing database:', err);
    throw err;
  } finally {
    client.release();
  }
}

export default pool;
