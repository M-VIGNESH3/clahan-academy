import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'super_secret_access_token_key';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    userId: string;
    email: string;
    role: string;
    college_id?: string;
    department_id?: string;
    batch_id?: string;
    trainer_id?: string;
    roll_number?: string;
    full_name?: string;
    year?: string;
    orgId?: string;
    dashboardRoute?: string;
    isImpersonating?: boolean;
    originalUserId?: string;
  };
}

export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded: any) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = {
      id: decoded.id,
      userId: decoded.userId || decoded.id,
      email: decoded.email,
      role: decoded.role,
      college_id: decoded.college_id,
      department_id: decoded.department_id,
      batch_id: decoded.batch_id,
      trainer_id: decoded.trainer_id,
      roll_number: decoded.roll_number,
      full_name: decoded.full_name,
      year: decoded.year,
      orgId: decoded.orgId,
      dashboardRoute: decoded.dashboardRoute,
      isImpersonating: decoded.isImpersonating,
      originalUserId: decoded.originalUserId,
    };
    next();
  });
}

export function requireRole(role: 'admin' | 'student') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (req.user.role !== role) {
      return res.status(403).json({ error: `Requires ${role} role` });
    }
    next();
  };
}
