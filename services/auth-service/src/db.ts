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

    // ═══════════════════════════════════
    // SPRINT 1 — MULTI-TENANT MIGRATIONS
    // ═══════════════════════════════════

    // Migration 1: organizations
    try {
      await client.query('SAVEPOINT sp_organizations');
      await client.query(`
        CREATE TABLE IF NOT EXISTS organizations (
          id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name          VARCHAR(200) NOT NULL,
          slug          VARCHAR(100) UNIQUE NOT NULL,
          org_type      VARCHAR(20) DEFAULT 'college' CHECK (org_type IN ('college', 'corporate')),
          address       TEXT,
          contact_email VARCHAR(200),
          contact_phone VARCHAR(20),
          is_active     BOOLEAN DEFAULT true,
          settings      JSONB DEFAULT '{
            "requireQuestionApproval": false,
            "allowFacultyPublish": false,
            "allowStudentSelfRegister": true,
            "requireSelfRegisterApproval": false,
            "showLeaderboard": true,
            "examScheduleMode": "both",
            "allowQuestionReview": false
          }'::jsonb,
          created_by    UUID,
          created_at    TIMESTAMPTZ DEFAULT NOW(),
          updated_at    TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      await client.query('RELEASE SAVEPOINT sp_organizations');
      console.log('✅ organizations table ready');
    } catch (err: any) {
      await client.query('ROLLBACK TO SAVEPOINT sp_organizations');
      console.error('organizations migration:', err.message);
    }

    // Migration 2: users updates
    // NOTE: profile_photo_url is NOT dropped here — it is still read/written by
    // auth-service (register/login), student-service, and the frontend. Dropping it
    // would break those flows and is deferred until those callers are updated.
    // NOTE: the status CHECK is a superset of the old ('active','pending','suspended')
    // and new ('pending_approval') values so existing registration ('pending') and
    // login suspension checks ('suspended') keep working.
    try {
      await client.query('SAVEPOINT sp_users_rbac');
      await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
        ALTER TABLE users ADD CONSTRAINT users_role_check
          CHECK (role IN ('super_admin', 'org_admin', 'faculty', 'student', 'admin'));

        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
        ALTER TABLE users ADD CONSTRAINT users_status_check
          CHECK (status IN ('active', 'inactive', 'pending', 'suspended', 'pending_approval'));
      `);
      await client.query('RELEASE SAVEPOINT sp_users_rbac');
      console.log('✅ users table updated');
    } catch (err: any) {
      await client.query('ROLLBACK TO SAVEPOINT sp_users_rbac');
      console.error('users migration:', err.message);
    }

    // Migration 3: batches updates
    try {
      await client.query('SAVEPOINT sp_batches_rbac');
      await client.query(`
        ALTER TABLE batches ADD COLUMN IF NOT EXISTS batch_type VARCHAR(20) DEFAULT 'academic'
          CHECK (batch_type IN ('academic', 'crt', 'training'));
        ALTER TABLE batches ADD COLUMN IF NOT EXISTS description TEXT;
      `);
      await client.query('RELEASE SAVEPOINT sp_batches_rbac');
      console.log('✅ batches table updated');
    } catch (err: any) {
      await client.query('ROLLBACK TO SAVEPOINT sp_batches_rbac');
      console.error('batches migration:', err.message);
    }

    // Migration 4: batch_students
    try {
      await client.query('SAVEPOINT sp_batch_students');
      await client.query(`
        CREATE TABLE IF NOT EXISTS batch_students (
          id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          batch_id   UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
          student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          added_by   UUID REFERENCES users(id),
          added_at   TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(batch_id, student_id)
        );
      `);
      await client.query('RELEASE SAVEPOINT sp_batch_students');
      console.log('✅ batch_students table ready');
    } catch (err: any) {
      await client.query('ROLLBACK TO SAVEPOINT sp_batch_students');
      console.error('batch_students migration:', err.message);
    }

    // Migration 5: faculty_permissions
    try {
      await client.query('SAVEPOINT sp_faculty_permissions');
      await client.query(`
        CREATE TABLE IF NOT EXISTS faculty_permissions (
          id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          faculty_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          org_id                  UUID NOT NULL REFERENCES organizations(id),
          can_upload_questions    BOOLEAN DEFAULT true,
          can_create_drafts       BOOLEAN DEFAULT true,
          can_publish_exams       BOOLEAN DEFAULT false,
          can_manage_students     BOOLEAN DEFAULT false,
          can_view_all_results    BOOLEAN DEFAULT false,
          can_bulk_import         BOOLEAN DEFAULT false,
          can_view_all_questions  BOOLEAN DEFAULT false,
          created_at              TIMESTAMPTZ DEFAULT NOW(),
          updated_at              TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(faculty_id)
        );
      `);
      await client.query('RELEASE SAVEPOINT sp_faculty_permissions');
      console.log('✅ faculty_permissions table ready');
    } catch (err: any) {
      await client.query('ROLLBACK TO SAVEPOINT sp_faculty_permissions');
      console.error('faculty_permissions migration:', err.message);
    }

    // Migration 6: faculty_batches
    try {
      await client.query('SAVEPOINT sp_faculty_batches');
      await client.query(`
        CREATE TABLE IF NOT EXISTS faculty_batches (
          id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          faculty_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          batch_id   UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
          org_id     UUID NOT NULL REFERENCES organizations(id),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(faculty_id, batch_id)
        );
      `);
      await client.query('RELEASE SAVEPOINT sp_faculty_batches');
      console.log('✅ faculty_batches table ready');
    } catch (err: any) {
      await client.query('ROLLBACK TO SAVEPOINT sp_faculty_batches');
      console.error('faculty_batches migration:', err.message);
    }

    // Migration 7: question_batches
    try {
      await client.query('SAVEPOINT sp_question_batches');
      await client.query(`
        CREATE TABLE IF NOT EXISTS question_batches (
          id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id         UUID NOT NULL REFERENCES organizations(id),
          created_by     UUID NOT NULL REFERENCES users(id),
          name           VARCHAR(200) NOT NULL,
          subject        VARCHAR(100),
          topic          VARCHAR(100),
          difficulty     VARCHAR(20) DEFAULT 'mixed' CHECK (difficulty IN ('easy','medium','hard','mixed')),
          description    TEXT,
          question_count INTEGER DEFAULT 0,
          status         VARCHAR(20) DEFAULT 'approved' CHECK (status IN ('pending','approved','rejected')),
          reviewed_by    UUID REFERENCES users(id),
          review_note    TEXT,
          tags           TEXT[],
          created_at     TIMESTAMPTZ DEFAULT NOW(),
          updated_at     TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      await client.query('RELEASE SAVEPOINT sp_question_batches');
      console.log('✅ question_batches table ready');
    } catch (err: any) {
      await client.query('ROLLBACK TO SAVEPOINT sp_question_batches');
      console.error('question_batches migration:', err.message);
    }

    // Migration 8: question_bank
    try {
      await client.query('SAVEPOINT sp_question_bank');
      await client.query(`
        CREATE TABLE IF NOT EXISTS question_bank (
          id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id          UUID NOT NULL REFERENCES organizations(id),
          batch_id        UUID NOT NULL REFERENCES question_batches(id) ON DELETE CASCADE,
          created_by      UUID NOT NULL REFERENCES users(id),
          question_type   VARCHAR(10) NOT NULL CHECK (question_type IN ('mcq','coding')),
          question_text   TEXT NOT NULL,
          subject         VARCHAR(100),
          topic           VARCHAR(100),
          difficulty      VARCHAR(20) CHECK (difficulty IN ('easy','medium','hard')),
          marks           INTEGER DEFAULT 1,
          tags            TEXT[],
          explanation     TEXT,
          option_a        TEXT,
          option_b        TEXT,
          option_c        TEXT,
          option_d        TEXT,
          correct_answer  VARCHAR(5),
          title           VARCHAR(200),
          coding_language VARCHAR(50),
          starter_code    TEXT,
          time_limit      INTEGER DEFAULT 30,
          memory_limit    INTEGER DEFAULT 256,
          status          VARCHAR(20) DEFAULT 'approved' CHECK (status IN ('pending','approved','rejected')),
          reviewed_by     UUID REFERENCES users(id),
          review_note     TEXT,
          usage_count     INTEGER DEFAULT 0,
          created_at      TIMESTAMPTZ DEFAULT NOW(),
          updated_at      TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      await client.query('RELEASE SAVEPOINT sp_question_bank');
      console.log('✅ question_bank table ready');
    } catch (err: any) {
      await client.query('ROLLBACK TO SAVEPOINT sp_question_bank');
      console.error('question_bank migration:', err.message);
    }

    // Migration 9: question_bank_test_cases
    try {
      await client.query('SAVEPOINT sp_question_bank_test_cases');
      await client.query(`
        CREATE TABLE IF NOT EXISTS question_bank_test_cases (
          id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          question_id     UUID NOT NULL REFERENCES question_bank(id) ON DELETE CASCADE,
          input           TEXT,
          expected_output TEXT,
          is_hidden       BOOLEAN DEFAULT false,
          created_at      TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      await client.query('RELEASE SAVEPOINT sp_question_bank_test_cases');
      console.log('✅ question_bank_test_cases table ready');
    } catch (err: any) {
      await client.query('ROLLBACK TO SAVEPOINT sp_question_bank_test_cases');
      console.error('question_bank_test_cases migration:', err.message);
    }

    // Migration 10: exam_templates
    try {
      await client.query('SAVEPOINT sp_exam_templates');
      await client.query(`
        CREATE TABLE IF NOT EXISTS exam_templates (
          id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name            VARCHAR(200) NOT NULL,
          description     TEXT,
          created_by      UUID REFERENCES users(id),
          is_global       BOOLEAN DEFAULT true,
          template_config JSONB,
          usage_count     INTEGER DEFAULT 0,
          created_at      TIMESTAMPTZ DEFAULT NOW(),
          updated_at      TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      await client.query('RELEASE SAVEPOINT sp_exam_templates');
      console.log('✅ exam_templates table ready');
    } catch (err: any) {
      await client.query('ROLLBACK TO SAVEPOINT sp_exam_templates');
      console.error('exam_templates migration:', err.message);
    }

    // Migration 11: exams updates
    try {
      await client.query('SAVEPOINT sp_exams_rbac');
      await client.query(`
        ALTER TABLE exams ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
        ALTER TABLE exams ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES exam_templates(id);
        ALTER TABLE exams ADD COLUMN IF NOT EXISTS schedule_type VARCHAR(20) DEFAULT 'fixed';
        ALTER TABLE exams ADD COLUMN IF NOT EXISTS flexible_start TIMESTAMPTZ;
        ALTER TABLE exams ADD COLUMN IF NOT EXISTS flexible_end TIMESTAMPTZ;
        ALTER TABLE exams ADD COLUMN IF NOT EXISTS show_leaderboard BOOLEAN DEFAULT true;
        ALTER TABLE exams ADD COLUMN IF NOT EXISTS allow_question_review BOOLEAN DEFAULT false;
        ALTER TABLE exams ADD COLUMN IF NOT EXISTS results_released BOOLEAN DEFAULT false;
        ALTER TABLE exams ADD COLUMN IF NOT EXISTS results_released_at TIMESTAMPTZ;
        ALTER TABLE exams ADD COLUMN IF NOT EXISTS results_released_by UUID REFERENCES users(id);
        ALTER TABLE exams ADD COLUMN IF NOT EXISTS exam_status VARCHAR(20) DEFAULT 'draft';
        ALTER TABLE exams ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
        ALTER TABLE exams ADD COLUMN IF NOT EXISTS published_by UUID REFERENCES users(id);
      `);
      await client.query('RELEASE SAVEPOINT sp_exams_rbac');
      console.log('✅ exams table updated');
    } catch (err: any) {
      await client.query('ROLLBACK TO SAVEPOINT sp_exams_rbac');
      console.error('exams migration:', err.message);
    }

    // Migration 12: exam_batches
    try {
      await client.query('SAVEPOINT sp_exam_batches');
      await client.query(`
        CREATE TABLE IF NOT EXISTS exam_batches (
          id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          exam_id    UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
          batch_id   UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(exam_id, batch_id)
        );
      `);
      await client.query('RELEASE SAVEPOINT sp_exam_batches');
      console.log('✅ exam_batches table ready');
    } catch (err: any) {
      await client.query('ROLLBACK TO SAVEPOINT sp_exam_batches');
      console.error('exam_batches migration:', err.message);
    }

    // Migration 13: audit_logs updates
    // NOTE: audit_logs already exists (created earlier in this function) with
    // (user_id, action, details TEXT, ip_address, created_at) and is actively
    // written to by exam-service. Per rule 8/2 the existing columns are left as-is;
    // only the new multi-tenant columns are added.
    try {
      await client.query('SAVEPOINT sp_audit_logs_rbac');
      await client.query(`
        ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
        ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS resource_type VARCHAR(50);
        ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS resource_id UUID;
      `);
      await client.query('RELEASE SAVEPOINT sp_audit_logs_rbac');
      console.log('✅ audit_logs table updated');
    } catch (err: any) {
      await client.query('ROLLBACK TO SAVEPOINT sp_audit_logs_rbac');
      console.error('audit_logs migration:', err.message);
    }

    // Migration 14: in_app_notifications
    try {
      await client.query('SAVEPOINT sp_in_app_notifications');
      await client.query(`
        CREATE TABLE IF NOT EXISTS in_app_notifications (
          id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id      UUID REFERENCES organizations(id),
          user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title       VARCHAR(200) NOT NULL,
          message     TEXT NOT NULL,
          type        VARCHAR(50),
          link        VARCHAR(200),
          is_read     BOOLEAN DEFAULT false,
          created_at  TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      await client.query('RELEASE SAVEPOINT sp_in_app_notifications');
      console.log('✅ in_app_notifications table ready');
    } catch (err: any) {
      await client.query('ROLLBACK TO SAVEPOINT sp_in_app_notifications');
      console.error('in_app_notifications migration:', err.message);
    }

    // Migration 15: migrate existing colleges into organizations
    // Reuses each college's own id as the organization id, so
    // users.college_id (and departments/batches/trainers.college_id)
    // keep matching without any data changes - this is what bridges the
    // legacy colleges table to the multi-tenant organizations table.
    // Slug gets a short id suffix to guarantee uniqueness even if two
    // college names collide or a name already matches an existing org's slug.
    try {
      await client.query('SAVEPOINT sp_colleges_to_orgs');
      const collegesExist = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'colleges'
        ) as exists
      `);

      if (collegesExist.rows[0].exists) {
        await client.query(`
          INSERT INTO organizations
            (id, name, slug, org_type, is_active, created_at)
          SELECT
            id,
            name,
            LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '-', 'g'))
              || '-' || SUBSTRING(id::text, 1, 8) as slug,
            'college' as org_type,
            true as is_active,
            created_at
          FROM colleges
          WHERE id NOT IN (
            SELECT id FROM organizations WHERE id IS NOT NULL
          )
          ON CONFLICT (id) DO NOTHING
        `);
        console.log('✅ Existing colleges migrated to organizations');
      }
      await client.query('RELEASE SAVEPOINT sp_colleges_to_orgs');
    } catch (err: any) {
      await client.query('ROLLBACK TO SAVEPOINT sp_colleges_to_orgs');
      console.error('colleges->organizations migration:', err.message);
    }

    // Migration 16: verify student college_id now resolves via organizations
    try {
      await client.query('SAVEPOINT sp_verify_student_org_links');
      const linked = await client.query(`
        SELECT COUNT(*) FROM users u
        JOIN organizations o ON o.id = u.college_id
        WHERE u.role = 'student'
      `);
      await client.query('RELEASE SAVEPOINT sp_verify_student_org_links');
      console.log(`✅ Student college_id links verified (${linked.rows[0].count} students linked)`);
    } catch (err: any) {
      await client.query('ROLLBACK TO SAVEPOINT sp_verify_student_org_links');
      console.error('College link check:', err.message);
    }

    // Migration 17: exam_attempts termination audit trail
    try {
      await client.query('SAVEPOINT sp_terminated_by');
      await client.query(`
        ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS terminated_by_name VARCHAR(200);
        ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS terminated_by_role VARCHAR(50);
      `);
      await client.query('RELEASE SAVEPOINT sp_terminated_by');
      console.log('✅ terminated_by columns added');
    } catch (err: any) {
      await client.query('ROLLBACK TO SAVEPOINT sp_terminated_by');
      console.error('terminated_by migration:', err.message);
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
