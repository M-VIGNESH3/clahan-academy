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
const PORT = process.env.PORT || 4008;

const JWT_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'super_secret_access_token_key';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@postgres:5432/clahan?sslmode=disable',
  max: 20,
  idleTimeoutMillis: 30000,
});

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
app.get('/health', (req, res) => res.json({ status: 'healthy', service: 'placement-service' }));

// List corporate placement drives
app.get('/api/placements', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const drives = [
      { id: 'plc-1', companyName: 'TCS Digital', role: 'System Engineer', package: '7.5 LPA', cutoffScore: 70, driveDate: '2026-08-15', eligibleCount: 145, status: 'Active' },
      { id: 'plc-2', companyName: 'Infosys Specialist', role: 'Power Programmer', package: '9.0 LPA', cutoffScore: 75, driveDate: '2026-08-20', eligibleCount: 98, status: 'Upcoming' },
      { id: 'plc-3', companyName: 'Wipro Turbo', role: 'Project Engineer', package: '6.5 LPA', cutoffScore: 65, driveDate: '2026-08-25', eligibleCount: 180, status: 'Upcoming' },
      { id: 'plc-4', companyName: 'Accenture Advanced', role: 'Application Development Associate', package: '5.4 LPA', cutoffScore: 60, driveDate: '2026-09-01', eligibleCount: 210, status: 'Upcoming' }
    ];
    res.json(drives);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// List partner companies
app.get('/api/companies', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const companies = [
      { id: 'comp-1', name: 'TCS', industry: 'IT & Software', location: 'Pan India', activeDrives: 2, totalHired: 120 },
      { id: 'comp-2', name: 'Infosys', industry: 'IT Services', location: 'Bangalore / Hyderabad', activeDrives: 1, totalHired: 95 },
      { id: 'comp-3', name: 'Wipro', industry: 'Technology', location: 'Pan India', activeDrives: 1, totalHired: 80 },
      { id: 'comp-4', name: 'Cognizant', industry: 'IT & Consulting', location: 'Chennai / Pune', activeDrives: 1, totalHired: 110 }
    ];
    res.json(companies);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Add Company (Admin)
app.post('/api/companies', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin role required' });
    const { name, industry, location } = req.body;
    const newCompany = {
      id: `comp-${Date.now()}`,
      name,
      industry: industry || 'Technology',
      location: location || 'Bangalore',
      activeDrives: 0,
      totalHired: 0
    };
    res.status(201).json(newCompany);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Placement Service running on port ${PORT}`);
});
