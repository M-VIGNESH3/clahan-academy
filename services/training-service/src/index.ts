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
const PORT = process.env.PORT || 4007;

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
  user?: { id: string; email: string; role: 'admin' | 'student'; college_id?: string };
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
app.get('/health', (req, res) => res.json({ status: 'healthy', service: 'training-service' }));

// List training tracks / modules
app.get('/api/trainings', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const tracks = [
      { id: 'tr-1', title: 'Quantitative Aptitude Masterclass', category: 'Aptitude', modules: 12, duration: '24 Hours', level: 'Intermediate', recommendedFor: 'Weak Aptitude Scores' },
      { id: 'tr-2', title: 'Data Structures & Algorithms in Python/C++', category: 'Coding', modules: 20, duration: '40 Hours', level: 'Advanced', recommendedFor: 'Coding Gaps' },
      { id: 'tr-3', title: 'Corporate Verbal & Logical Reasoning', category: 'Reasoning', modules: 8, duration: '16 Hours', level: 'Beginner', recommendedFor: 'CRT Preparation' },
      { id: 'tr-4', title: 'Full Stack Engineering Core', category: 'Technical', modules: 15, duration: '30 Hours', level: 'Advanced', recommendedFor: 'Technical Skills' },
      { id: 'tr-5', title: 'Corporate Interview Readiness & Etiquette', category: 'Communication', modules: 6, duration: '10 Hours', level: 'All Levels', recommendedFor: 'Mock Interview Prep' }
    ];
    res.json(tracks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create training track (Admin)
app.post('/api/trainings', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin role required' });
    const { title, category, modules, duration, level, recommendedFor } = req.body;
    const newTrack = {
      id: `tr-${Date.now()}`,
      title,
      category: category || 'General',
      modules: modules || 5,
      duration: duration || '10 Hours',
      level: level || 'Intermediate',
      recommendedFor: recommendedFor || 'Skill Improvement',
      created_at: new Date().toISOString()
    };
    res.status(201).json(newTrack);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Training Service running on port ${PORT}`);
});
