import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Pool } from 'pg';
import * as jwt from 'jsonwebtoken';

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 4009;

const JWT_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'super_secret_access_token_key';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@postgres:5432/clahan?sslmode=disable',
  max: 20,
  idleTimeoutMillis: 30000,
});
const query = (text: string, params?: any[]) => pool.query(text, params);

app.use(helmet());
app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  validate: { trustProxy: false }
});
app.use(limiter);

interface AuthenticatedRequest extends express.Request {
  user?: { id: string; email: string; role: 'admin' | 'student' };
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

// Health check
app.get('/health', (req, res) => res.json({ status: 'healthy', service: 'report-service' }));

// Overall platform summary report
app.get('/api/reports/summary', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const summary = {
      totalAssessments: 45,
      totalAttempts: 1250,
      averagePercentage: 74.5,
      passRate: 82.3,
      topPerformingDepartment: 'Computer Science & Engineering',
      skillCategories: [
        { category: 'Aptitude', avgScore: 78, status: 'Strong' },
        { category: 'Coding', avgScore: 68, status: 'Needs Focus' },
        { category: 'Technical', avgScore: 75, status: 'Good' },
        { category: 'Reasoning', avgScore: 82, status: 'Strong' },
        { category: 'Communication', avgScore: 70, status: 'Average' }
      ]
    };
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Non-AI Skill Identification Report for a candidate/student based on assessment results
app.get('/api/reports/skills/:studentId', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const { studentId } = req.params;

    const attemptsRes = await query(
      `SELECT
         ea.score,
         ea.percentage,
         ea.passed,
         ea.mcq_score,
         ea.coding_score,
         e.name as exam_name,
         e.exam_type,
         e.skill_category,
         e.duration_minutes
       FROM exam_attempts ea
       JOIN exams e ON ea.exam_id = e.id
       WHERE ea.student_id = $1
         AND ea.status = 'completed'
       ORDER BY ea.created_at DESC`,
      [studentId]
    );

    const attempts = attemptsRes.rows;

    if (attempts.length === 0) {
      return res.json({
        studentId,
        totalExams: 0,
        scores: {
          aptitude: 0,
          coding: 0,
          communication: 0,
          technical: 0,
          reasoning: 0
        },
        weakAreas: [],
        strongAreas: [],
        recommendations: [],
        hasData: false,
        message: 'No completed exams found. Take some assessments to see your skill analysis.'
      });
    }

    // Group scores by skill category
    const skillScores: Record<string, number[]> = {
      aptitude: [],
      coding: [],
      communication: [],
      technical: [],
      reasoning: []
    };

    attempts.forEach(attempt => {
      const category = attempt.skill_category;
      const pct = parseFloat(attempt.percentage) || 0;

      if (category && skillScores[category] !== undefined) {
        skillScores[category].push(pct);
      } else {
        // Uncategorized exams: use exam_type to guess category
        if (attempt.exam_type === 'coding') {
          skillScores.coding.push(pct);
        } else if (attempt.exam_type === 'mcq') {
          skillScores.aptitude.push(pct);
        }
      }
    });

    // Calculate average for each skill
    const scores: Record<string, number> = {};
    Object.entries(skillScores).forEach(([skill, scoreList]) => {
      if (scoreList.length > 0) {
        scores[skill] = Math.round(scoreList.reduce((a, b) => a + b, 0) / scoreList.length);
      } else {
        scores[skill] = 0;
      }
    });

    // Only include skills that have actual data
    const skillsWithData = Object.entries(scores).filter(([skill]) => skillScores[skill].length > 0);

    const weakAreas = skillsWithData.filter(([, score]) => score < 50).map(([skill]) => skill);
    const strongAreas = skillsWithData.filter(([, score]) => score >= 75).map(([skill]) => skill);

    // Generate recommendations
    const recommendations: string[] = [];

    if (weakAreas.includes('aptitude')) {
      recommendations.push('Practice quantitative aptitude problems daily. Focus on number series, percentages, and time-speed-distance.');
    }
    if (weakAreas.includes('coding')) {
      recommendations.push('Strengthen coding skills with daily LeetCode/HackerRank practice. Focus on arrays, strings, and basic data structures.');
    }
    if (weakAreas.includes('communication')) {
      recommendations.push('Improve communication by practicing mock interviews and group discussions. Focus on clarity and confidence.');
    }
    if (weakAreas.includes('technical')) {
      recommendations.push('Revise core technical subjects related to your domain. Review fundamentals and practice application-level questions.');
    }
    if (weakAreas.includes('reasoning')) {
      recommendations.push('Practice logical reasoning puzzles, syllogisms, and coding-decoding problems regularly.');
    }

    if (weakAreas.length === 0 && skillsWithData.length > 0) {
      recommendations.push('Great performance! Keep practicing to maintain your scores and explore advanced topics.');
    }

    if (skillsWithData.length < 3) {
      recommendations.push('Take more categorized assessments to get a complete skill gap analysis across all areas.');
    }

    res.json({
      studentId,
      totalExams: attempts.length,
      examsAnalyzed: skillsWithData.length,
      scores,
      skillScores: Object.fromEntries(Object.entries(skillScores).map(([k, v]) => [k, v.length])),
      weakAreas,
      strongAreas,
      recommendations,
      hasData: true,
      recentExams: attempts.slice(0, 5).map(a => ({
        name: a.exam_name,
        category: a.skill_category || 'general',
        percentage: Math.round(a.percentage),
        passed: a.passed
      }))
    });
  } catch (err: any) {
    console.error('Skill gap error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Report Service running on port ${PORT}`);
});
