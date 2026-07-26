import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Matches the fallback chain used by every other service (auth-service,
// admin-service, ...) so tokens issued by auth-service verify here too.
const JWT_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'super_secret_access_token_key';

// ─────────────────────────────────────
// AUTH MIDDLEWARE
// ─────────────────────────────────────
interface AuthenticatedRequest extends express.Request {
  user?: {
    userId: string;
    role: string;
    email: string;
    orgId: string | null;
  };
}

const authenticate = (
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction
) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({
      error: 'No token provided'
    });
  }
  try {
    const decoded = jwt.verify(
      token, JWT_SECRET
    ) as any;
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({
      error: 'Invalid token'
    });
  }
};

const requireSuperAdmin = (
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction
) => {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({
      error: 'Super admin access required'
    });
  }
  next();
};

// Helper: log to audit_logs
const auditLog = async (
  orgId: string | null,
  userId: string,
  action: string,
  resourceType: string,
  resourceId: string | null,
  details: object,
  ipAddress: string
) => {
  try {
    await pool.query(
      `INSERT INTO audit_logs
       (org_id, user_id, action,
        resource_type, resource_id,
        details, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [orgId, userId, action,
       resourceType, resourceId,
       JSON.stringify(details), ipAddress]
    );
  } catch (err) {
    console.error('Audit log error:', err);
  }
};

// ─────────────────────────────────────
// HEALTH ENDPOINTS
// ─────────────────────────────────────
app.get('/health', (_, res) =>
  res.json({ status: 'ok',
             service: 'super-admin-service' }));

app.get('/healthz', (_, res) =>
  res.json({ status: 'ok' }));

app.get('/ready', async (_, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({
      status: 'not ready'
    });
  }
});

// ─────────────────────────────────────
// ORGANIZATION ENDPOINTS
// ─────────────────────────────────────

// GET /api/super/dashboard
// Returns platform-wide stats
app.get('/api/super/dashboard',
  authenticate, requireSuperAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const [orgs, users, exams, attempts] =
        await Promise.all([
          pool.query(
            `SELECT
               COUNT(*) as total,
               COUNT(*) FILTER (
                 WHERE is_active = true
               ) as active,
               COUNT(*) FILTER (
                 WHERE org_type = 'college'
               ) as colleges,
               COUNT(*) FILTER (
                 WHERE org_type = 'corporate'
               ) as corporates
             FROM organizations`
          ),
          pool.query(
            `SELECT
               COUNT(*) as total,
               COUNT(*) FILTER (
                 WHERE role = 'student'
               ) as students,
               COUNT(*) FILTER (
                 WHERE role IN (
                   'org_admin','faculty'
                 )
               ) as staff
             FROM users
             WHERE status != 'inactive'`
          ),
          pool.query(
            `SELECT COUNT(*) as total
             FROM exams`
          ),
          pool.query(
            `SELECT COUNT(*) as total
             FROM exam_attempts
             WHERE status = 'completed'`
          )
        ]);

      // Recent organizations
      const recentOrgs = await pool.query(
        `SELECT
           id, name, slug, org_type,
           is_active, created_at,
           (SELECT COUNT(*) FROM users
            WHERE college_id = o.id
            OR org_id = o.id) as user_count
         FROM organizations o
         ORDER BY created_at DESC
         LIMIT 5`
      );

      // Recent audit logs
      const recentAudit = await pool.query(
        `SELECT
           al.action, al.created_at,
           u.full_name, u.email,
           o.name as org_name
         FROM audit_logs al
         LEFT JOIN users u
           ON u.id = al.user_id
         LEFT JOIN organizations o
           ON o.id = al.org_id
         ORDER BY al.created_at DESC
         LIMIT 10`
      );

      res.json({
        stats: {
          totalOrgs: parseInt(
            orgs.rows[0].total
          ),
          activeOrgs: parseInt(
            orgs.rows[0].active
          ),
          colleges: parseInt(
            orgs.rows[0].colleges
          ),
          corporates: parseInt(
            orgs.rows[0].corporates
          ),
          totalUsers: parseInt(
            users.rows[0].total
          ),
          totalStudents: parseInt(
            users.rows[0].students
          ),
          totalStaff: parseInt(
            users.rows[0].staff
          ),
          totalExams: parseInt(
            exams.rows[0].total
          ),
          totalAttempts: parseInt(
            attempts.rows[0].total
          )
        },
        recentOrganizations: recentOrgs.rows,
        recentActivity: recentAudit.rows
      });
    } catch (err: any) {
      res.status(500).json({
        error: err.message
      });
    }
  }
);

// GET /api/super/organizations
// List all organizations with stats
app.get('/api/super/organizations',
  authenticate, requireSuperAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT
           o.*,
           (SELECT COUNT(*) FROM users
            WHERE college_id = o.id
            AND role = 'student'
           ) as student_count,
           (SELECT COUNT(*) FROM users
            WHERE org_id = o.id
            AND role IN ('org_admin','faculty')
           ) as staff_count,
           (SELECT COUNT(*) FROM exams
            WHERE college_id = o.id
           ) as exam_count,
           creator.full_name as created_by_name
         FROM organizations o
         LEFT JOIN users creator
           ON creator.id = o.created_by
         ORDER BY o.created_at DESC`
      );
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({
        error: err.message
      });
    }
  }
);

// POST /api/super/organizations
// Create new organization
app.post('/api/super/organizations',
  authenticate, requireSuperAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const {
        name, slug, orgType, address,
        contactEmail, contactPhone
      } = req.body;

      // Validate required fields
      if (!name || !slug || !contactEmail) {
        return res.status(400).json({
          error: 'name, slug and contactEmail are required'
        });
      }

      const normalizedSlug = slug.toLowerCase().replace(/\s+/g, '-');

      // Check slug is unique
      const existing = await pool.query(
        `SELECT id FROM organizations
         WHERE slug = $1`,
        [normalizedSlug]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({
          error: 'An organization with this slug already exists'
        });
      }

      const result = await pool.query(
        `INSERT INTO organizations
         (name, slug, org_type, address,
          contact_email, contact_phone,
          created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          name,
          normalizedSlug,
          orgType || 'college',
          address || null,
          contactEmail,
          contactPhone || null,
          req.user!.userId
        ]
      );

      await auditLog(
        result.rows[0].id,
        req.user!.userId,
        'org.created',
        'organization',
        result.rows[0].id,
        { name, slug: normalizedSlug, orgType },
        req.ip || ''
      );

      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({
        error: err.message
      });
    }
  }
);

// GET /api/super/organizations/:id
// Get single org with full stats
app.get('/api/super/organizations/:id',
  authenticate, requireSuperAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;

      const org = await pool.query(
        `SELECT o.*,
           (SELECT COUNT(*) FROM users
            WHERE college_id = o.id
            AND role = 'student'
           ) as student_count,
           (SELECT COUNT(*) FROM users
            WHERE org_id = o.id
            AND role = 'faculty'
           ) as faculty_count,
           (SELECT COUNT(*) FROM users
            WHERE org_id = o.id
            AND role = 'org_admin'
           ) as admin_count,
           (SELECT COUNT(*) FROM exams
            WHERE college_id = o.id
           ) as exam_count,
           (SELECT COUNT(*)
            FROM exam_attempts ea
            JOIN exams e ON e.id = ea.exam_id
            WHERE e.college_id = o.id
            AND ea.status = 'completed'
           ) as attempt_count
         FROM organizations o
         WHERE o.id = $1`,
        [id]
      );

      if (org.rows.length === 0) {
        return res.status(404).json({
          error: 'Organization not found'
        });
      }

      // Get org admins
      const admins = await pool.query(
        `SELECT id, full_name, email,
                phone, status, created_at
         FROM users
         WHERE org_id = $1
         AND role = 'org_admin'
         ORDER BY created_at ASC`,
        [id]
      );

      res.json({
        ...org.rows[0],
        admins: admins.rows
      });
    } catch (err: any) {
      res.status(500).json({
        error: err.message
      });
    }
  }
);

// PUT /api/super/organizations/:id
// Update organization details
app.put('/api/super/organizations/:id',
  authenticate, requireSuperAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const {
        name, address, contactEmail,
        contactPhone, orgType
      } = req.body;

      const result = await pool.query(
        `UPDATE organizations SET
           name = COALESCE($1, name),
           address = COALESCE($2, address),
           contact_email = COALESCE(
             $3, contact_email),
           contact_phone = COALESCE(
             $4, contact_phone),
           org_type = COALESCE($5, org_type),
           updated_at = NOW()
         WHERE id = $6
         RETURNING *`,
        [name, address, contactEmail,
         contactPhone, orgType, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Organization not found'
        });
      }

      await auditLog(
        id, req.user!.userId,
        'org.updated', 'organization', id,
        req.body, req.ip || ''
      );

      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({
        error: err.message
      });
    }
  }
);

// POST /api/super/organizations/:id/activate
app.post('/api/super/organizations/:id/activate',
  authenticate, requireSuperAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      await pool.query(
        `UPDATE organizations
         SET is_active = true, updated_at = NOW()
         WHERE id = $1`,
        [id]
      );
      await auditLog(
        id, req.user!.userId,
        'org.activated', 'organization',
        id, {}, req.ip || ''
      );
      res.json({ message: 'Organization activated' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// POST /api/super/organizations/:id/deactivate
app.post(
  '/api/super/organizations/:id/deactivate',
  authenticate, requireSuperAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      // Soft delete — data preserved
      await pool.query(
        `UPDATE organizations
         SET is_active = false,
             updated_at = NOW()
         WHERE id = $1`,
        [id]
      );
      await auditLog(
        id, req.user!.userId,
        'org.deactivated', 'organization',
        id, {}, req.ip || ''
      );
      res.json({
        message: 'Organization deactivated. Data preserved.'
      });
    } catch (err: any) {
      res.status(500).json({
        error: err.message
      });
    }
  }
);

// ─────────────────────────────────────
// ORG ADMIN ACCOUNT CREATION
// ─────────────────────────────────────

// POST /api/super/organizations/:id/admin
// Create an org_admin account for a college
app.post('/api/super/organizations/:id/admin',
  authenticate, requireSuperAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id: orgId } = req.params;
      const { fullName, email, phone, password } = req.body;

      if (!fullName || !email) {
        return res.status(400).json({
          error: 'fullName and email are required'
        });
      }

      // Check org exists and is active
      const org = await pool.query(
        `SELECT * FROM organizations
         WHERE id = $1 AND is_active = true`,
        [orgId]
      );
      if (org.rows.length === 0) {
        return res.status(404).json({
          error: 'Organization not found or inactive'
        });
      }

      // Check email not already in use
      const existing = await pool.query(
        `SELECT id FROM users
         WHERE email = $1`,
        [email.toLowerCase()]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({
          error: 'Email already in use'
        });
      }

      // Use the caller-supplied password if given, otherwise generate one
      const rawPassword = password
        || (Math.random().toString(36).slice(-8) + 'A1!');

      const passwordHash = await bcrypt.hash(
        rawPassword, 10
      );

      // Create org_admin user
      const result = await pool.query(
        `INSERT INTO users
         (email, password_hash, raw_password,
          full_name, phone, role, org_id,
          email_verified, status)
         VALUES ($1,$2,$3,$4,$5,
                 'org_admin',$6,true,'active')
         RETURNING id, email, full_name,
                   role, org_id, created_at`,
        [
          email.toLowerCase(),
          passwordHash,
          rawPassword,
          fullName,
          phone || null,
          orgId
        ]
      );

      await auditLog(
        orgId, req.user!.userId,
        'org_admin.created', 'user',
        result.rows[0].id,
        { email, orgId, orgName: org.rows[0].name },
        req.ip || ''
      );

      // TODO Sprint 2: Send credential email
      // For now return credentials in response
      // so super admin can share manually
      res.status(201).json({
        user: result.rows[0],
        credentials: {
          email: email.toLowerCase(),
          password: rawPassword,
          loginUrl: '/admin-login'
        },
        message: `Org admin created for ${org.rows[0].name}. Share credentials securely.`
      });
    } catch (err: any) {
      res.status(500).json({
        error: err.message
      });
    }
  }
);

// GET /api/super/organizations/:id/credentials
// Returns org admins with their credentials
app.get(
  '/api/super/organizations/:id/credentials',
  authenticate, requireSuperAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;

      const admins = await pool.query(
        `SELECT
           id, full_name, email, raw_password,
           phone, status, created_at
         FROM users
         WHERE org_id = $1 AND role = 'org_admin'
         ORDER BY created_at ASC`,
        [id]
      );

      const org = await pool.query(
        `SELECT id, name, slug, org_type,
                contact_email, contact_phone,
                address, is_active, settings
         FROM organizations WHERE id = $1`,
        [id]
      );

      if (org.rows.length === 0) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      res.json({
        org: org.rows[0],
        admins: admins.rows
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// PUT /api/super/organizations/:id/admin/:adminId
// Edit org admin details
app.put(
  '/api/super/organizations/:id/admin/:adminId',
  authenticate, requireSuperAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { adminId } = req.params;
      const { fullName, email, phone } = req.body;

      const result = await pool.query(
        `UPDATE users SET
           full_name = COALESCE($1, full_name),
           email = COALESCE($2, email),
           phone = COALESCE($3, phone)
         WHERE id = $4
           AND role = 'org_admin'
         RETURNING id, full_name, email, phone, status`,
        [fullName, email, phone, adminId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Admin not found' });
      }

      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// POST /api/super/organizations/:id/admin/:adminId/reset-password
// Reset org admin password
app.post(
  '/api/super/organizations/:id/admin/:adminId/reset-password',
  authenticate, requireSuperAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id, adminId } = req.params;
      const { newPassword } = req.body;

      const rawPassword = newPassword
        || (Math.random().toString(36).slice(-8) + 'Admin1!');
      const passwordHash = await bcrypt.hash(rawPassword, 10);

      const result = await pool.query(
        `UPDATE users SET
           password_hash = $1,
           raw_password = $2
         WHERE id = $3
           AND role = 'org_admin'
         RETURNING id`,
        [passwordHash, rawPassword, adminId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Admin not found' });
      }

      await auditLog(
        id, req.user!.userId,
        'org_admin.password_reset', 'user', adminId,
        {}, req.ip || ''
      );

      res.json({
        message: 'Password reset successfully',
        newPassword: rawPassword
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ─────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────

// GET /api/super/analytics
// Platform-wide analytics for graphs
app.get('/api/super/analytics',
  authenticate, requireSuperAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      // Orgs created per month (last 6 months)
      const orgGrowth = await pool.query(
        `SELECT
           TO_CHAR(created_at, 'Mon YYYY') as month,
           DATE_TRUNC('month', created_at) as month_date,
           COUNT(*) as count
         FROM organizations
         WHERE created_at >= NOW() - INTERVAL '6 months'
         GROUP BY month, month_date
         ORDER BY month_date ASC`
      );

      // Exams per day last 30 days
      const examActivity = await pool.query(
        `SELECT
           DATE(created_at) as date,
           COUNT(*) as count
         FROM exam_attempts
         WHERE created_at >= NOW() - INTERVAL '30 days'
           AND status = 'completed'
         GROUP BY DATE(created_at)
         ORDER BY date ASC`
      );

      // Top colleges by student count
      const topColleges = await pool.query(
        `SELECT
           o.name,
           COUNT(u.id) as student_count,
           (SELECT COUNT(*) FROM exams e
            WHERE e.college_id = o.id
           ) as exam_count
         FROM organizations o
         LEFT JOIN users u
           ON u.college_id = o.id
           AND u.role = 'student'
         GROUP BY o.id, o.name
         ORDER BY student_count DESC
         LIMIT 10`
      );

      res.json({
        orgGrowth: orgGrowth.rows,
        examActivity: examActivity.rows,
        topColleges: topColleges.rows
      });
    } catch (err: any) {
      res.status(500).json({
        error: err.message
      });
    }
  }
);

// ─────────────────────────────────────
// AUDIT LOGS
// ─────────────────────────────────────

// GET /api/super/audit-logs
// View all audit logs with filters
app.get('/api/super/audit-logs',
  authenticate, requireSuperAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const {
        orgId, action, limit = 50, offset = 0
      } = req.query;

      let whereClause = 'WHERE 1=1';
      const params: any[] = [];
      let paramCount = 0;

      if (orgId) {
        paramCount++;
        whereClause += ` AND al.org_id = $${paramCount}`;
        params.push(orgId);
      }
      if (action) {
        paramCount++;
        whereClause += ` AND al.action = $${paramCount}`;
        params.push(action);
      }

      paramCount++;
      params.push(limit);
      paramCount++;
      params.push(offset);

      const result = await pool.query(
        `SELECT
           al.*,
           u.full_name as user_name,
           u.email as user_email,
           u.role as user_role,
           o.name as org_name
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.user_id
         LEFT JOIN organizations o
           ON o.id = al.org_id
         ${whereClause}
         ORDER BY al.created_at DESC
         LIMIT $${paramCount - 1}
         OFFSET $${paramCount}`,
        params
      );

      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({
        error: err.message
      });
    }
  }
);

// ─────────────────────────────────────
// EXAM TEMPLATES
// ─────────────────────────────────────

// GET /api/super/exam-templates
app.get('/api/super/exam-templates',
  authenticate, requireSuperAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT t.*,
           u.full_name as created_by_name
         FROM exam_templates t
         LEFT JOIN users u
           ON u.id = t.created_by
         ORDER BY t.created_at DESC`
      );
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({
        error: err.message
      });
    }
  }
);

// POST /api/super/exam-templates
app.post('/api/super/exam-templates',
  authenticate, requireSuperAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { name, description,
              templateConfig } = req.body;
      if (!name) {
        return res.status(400).json({
          error: 'name is required'
        });
      }
      const result = await pool.query(
        `INSERT INTO exam_templates
         (name, description, created_by,
          template_config, is_global)
         VALUES ($1,$2,$3,$4,true)
         RETURNING *`,
        [name, description || null,
         req.user!.userId,
         templateConfig
           ? JSON.stringify(templateConfig)
           : null]
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({
        error: err.message
      });
    }
  }
);

// PUT /api/super/exam-templates/:id
app.put('/api/super/exam-templates/:id',
  authenticate, requireSuperAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const { name, description,
              templateConfig } = req.body;
      const result = await pool.query(
        `UPDATE exam_templates SET
           name = COALESCE($1, name),
           description = COALESCE(
             $2, description),
           template_config = COALESCE(
             $3, template_config),
           updated_at = NOW()
         WHERE id = $4 RETURNING *`,
        [name, description,
         templateConfig
           ? JSON.stringify(templateConfig)
           : null,
         id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Template not found'
        });
      }
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({
        error: err.message
      });
    }
  }
);

// DELETE /api/super/exam-templates/:id
app.delete('/api/super/exam-templates/:id',
  authenticate, requireSuperAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      await pool.query(
        `DELETE FROM exam_templates
         WHERE id = $1`,
        [id]
      );
      res.json({
        message: 'Template deleted'
      });
    } catch (err: any) {
      res.status(500).json({
        error: err.message
      });
    }
  }
);

// ─────────────────────────────────────
// START SERVER
// ─────────────────────────────────────
const PORT = process.env.PORT || 4010;
app.listen(PORT, () => {
  console.log(
    `Super Admin Service running on ${PORT}`
  );
});

export default app;
