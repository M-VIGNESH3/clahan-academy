import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import { Pool, types } from 'pg';
types.setTypeParser(1114, (str) => new Date(str.replace(' ', 'T') + 'Z'));
import * as jwt from 'jsonwebtoken';

const app = express();
const PORT = process.env.PORT || 4005;

const JWT_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'super_secret_access_token_key';

const TAB_SWITCH_LIMIT = parseInt(process.env.TAB_SWITCH_LIMIT || '3');
const MOBILE_PHONE_LIMIT = parseInt(process.env.MOBILE_PHONE_LIMIT || '5');
const BOOK_LIMIT = parseInt(process.env.BOOK_LIMIT || '8');
const MULTIPLE_FACES_LIMIT = parseInt(process.env.MULTIPLE_FACES_LIMIT || '5');
const NO_FACE_TIMEOUT_MS = parseInt(process.env.NO_FACE_TIMEOUT_MS || '10000');
const FULLSCREEN_EXIT_LIMIT = parseInt(process.env.FULLSCREEN_EXIT_LIMIT || '3');

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception in proctoring-service:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection in proctoring-service at:', promise, 'reason:', reason);
});

// Database Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@postgres:5432/clahan?sslmode=disable',
  max: 50,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
pool.on('error', (err) => {
  console.error('Unexpected error on idle pg client in proctoring-service:', err);
});
const query = (text: string, params?: any[]) => pool.query(text, params);

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

interface AuthenticatedRequest extends express.Request {
  user?: {
    userId: string;
    id: string;
    role: string;
    full_name?: string;
  };
}

// JWT auth for the faculty-scoped REST endpoints below. The admin live-monitor
// flow uses socket.io with its own inline role check, so this middleware is
// only wired into the new /api/proctor/faculty/* routes.
const authenticate = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'No token' });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET) as any;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'proctoring-service' });
});

// Admin endpoint to get active sessions
app.get('/api/proctor/live', async (req, res) => {
  try {
    // Get ongoing attempts and their warnings/critical proctoring logs
    const result = await query(`
      SELECT ea.id as attempt_id, ea.exam_id, ea.student_id, ea.attempt_number, ea.created_at as started_at,
             u.full_name as student_name, u.roll_number, e.name as exam_name,
             (SELECT COUNT(*) FROM proctoring_logs pl WHERE pl.attempt_id = ea.id) as violation_count,
             (SELECT json_agg(pl) FROM (SELECT * FROM proctoring_logs WHERE attempt_id = ea.id ORDER BY created_at DESC LIMIT 5) pl) as recent_violations
      FROM exam_attempts ea
      JOIN users u ON ea.student_id = u.id
      JOIN exams e ON ea.exam_id = e.id
      WHERE ea.status = 'ongoing'
      ORDER BY ea.created_at DESC
    `);
    
    // Filter to only return attempts that are actively connected right now
    const activeAttemptIds = Object.values(activeSessions).map(s => s.attemptId);
    const activeOnly = result.rows.filter(row => activeAttemptIds.includes(row.attempt_id));
    res.json(activeOnly);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Pre-exam face verification endpoint
app.post('/api/proctor/verify-face', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Image data is required' });
    }
    const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://ai-service:8000';
    
    const params = new URLSearchParams();
    params.append('frame', image);
    params.append('attemptId', 'pre-exam-verification');

    const response = await fetch(`${AI_SERVICE_URL}/api/ai/proctor/frame`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });

    if (response.ok) {
      const data = await response.json();
      return res.json(data);
    } else {
      return res.status(500).json({ error: 'Failed to verify face with AI service' });
    }
  } catch (err: any) {
    console.error('Error verifying face:', err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/proctor/faculty/live
// Faculty-scoped live sessions — only students in the faculty's assigned batches
app.get('/api/proctor/faculty/live',
  authenticate,
  async (req: AuthenticatedRequest, res) => {
    try {
      const facultyId = req.user!.userId;

      const result = await query(
        `SELECT DISTINCT
           ea.id as attempt_id,
           ea.exam_id,
           ea.student_id,
           ea.status,
           ea.created_at as started_at,
           u.full_name as student_name,
           u.roll_number,
           e.name as exam_name,
           e.duration_minutes,
           COUNT(pl.id) as violation_count,
           COUNT(pl.id) FILTER (WHERE pl.severity = 'high') as high_violations,
           (SELECT screenshot FROM proctoring_logs
             WHERE attempt_id = ea.id AND screenshot IS NOT NULL
             ORDER BY created_at DESC LIMIT 1) as last_screenshot
         FROM exam_attempts ea
         JOIN users u ON u.id = ea.student_id
         JOIN exams e ON e.id = ea.exam_id
         LEFT JOIN proctoring_logs pl ON pl.attempt_id = ea.id
         WHERE ea.status = 'ongoing'
           AND u.batch_id IN (
             SELECT batch_id FROM faculty_batches WHERE faculty_id = $1
           )
         GROUP BY ea.id, u.full_name, u.roll_number, e.name, e.duration_minutes
         ORDER BY violation_count DESC`,
        [facultyId]
      );

      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/proctor/faculty/attempts/:attemptId/logs
app.get('/api/proctor/faculty/attempts/:attemptId/logs',
  authenticate,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { attemptId } = req.params;
      const facultyId = req.user!.userId;

      // Verify this attempt belongs to a student in the faculty's batch
      const verify = await query(
        `SELECT ea.id FROM exam_attempts ea
         JOIN users u ON u.id = ea.student_id
         JOIN faculty_batches fb ON fb.batch_id = u.batch_id
         WHERE ea.id = $1 AND fb.faculty_id = $2`,
        [attemptId, facultyId]
      );

      if (verify.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const logs = await query(
        `SELECT * FROM proctoring_logs
         WHERE attempt_id = $1
         ORDER BY created_at DESC`,
        [attemptId]
      );

      res.json(logs.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// POST /api/proctor/faculty/warn/:attemptId
app.post('/api/proctor/faculty/warn/:attemptId',
  authenticate,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { attemptId } = req.params;
      const facultyId = req.user!.userId;

      const faculty = await query(`SELECT full_name FROM users WHERE id = $1`, [facultyId]);
      const facultyName = faculty.rows[0]?.full_name || 'Faculty';

      await query(
        `INSERT INTO proctoring_logs (attempt_id, event_type, details, severity)
         VALUES ($1, 'manual_warning', $2, 'medium')`,
        [
          attemptId,
          JSON.stringify({
            message: 'Warning issued by faculty',
            issuedBy: facultyName,
            issuedByRole: 'faculty',
            issuedById: facultyId
          })
        ]
      );

      res.json({ message: `Warning sent by ${facultyName}` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

interface ExamFaceDetectionConfig {
  enabled: boolean;
  expiresAt: number;
}
const examFaceDetectionCache: Record<string, ExamFaceDetectionConfig> = {};

async function isFaceDetectionEnabled(examId: string): Promise<boolean> {
  try {
    const examRes = await query(
      'SELECT enable_face_detection FROM exams WHERE id = $1', 
      [examId]
    );
    return examRes.rows[0]?.enable_face_detection === true;
  } catch (err) {
    console.error(`Error querying enable_face_detection for exam ${examId}:`, err);
    return false;
  }
}

// 'admin' here means "any admin-tier role" — org_admin and super_admin are
// real, distinct JWT role values in this system, so a strict equality check
// against the literal 'admin' string was silently excluding real admin
// accounts from the live-monitor room (and from the admin-terminate/warn
// socket handlers). Faculty are included in the monitor room too so their
// live-proctoring page receives the same frame/alert broadcasts, but are
// kept out of the admin-tier-only terminate/warn handlers below.
const ADMIN_TIER_ROLES = ['admin', 'org_admin', 'super_admin'];
const MONITOR_ROLES = [...ADMIN_TIER_ROLES, 'faculty'];

const activeSessions: Record<string, { attemptId: string; studentId: string; examId: string; role: string; fullName?: string }> = {};

// GAP 2 — Attempt-indexed Session Tracking Maps
const attemptSessions: Map<string, {
  socketId: string;
  studentId: string;
  examId: string;
  role: string;
  lastSeen: number;
}> = new Map();

const socketToAttempt: Map<string, string> = new Map();

// Track consecutive violations in memory (key: attemptId, value: Record<eventType, count>)
const consecutiveViolations: Record<string, Record<string, number>> = {};

// Track first seen timestamps for duration-based violations (key: attemptId, value: Record<eventType, timestamp>)
const violationStartTimes: Record<string, Record<string, number>> = {};

// Track phone confidences in memory (key: attemptId, value: array of confidence strings)
const phoneConfidences: Record<string, string[]> = {};

// FINAL TASK 4 — Periodic Cleanup Job for Stale Attempt Sessions
setInterval(() => {
  const now = Date.now();
  const MAX_SESSION_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours
  let cleaned = 0;
  for (const [attemptId, session] of attemptSessions.entries()) {
    if (now - session.lastSeen > MAX_SESSION_AGE_MS) {
      socketToAttempt.delete(session.socketId);
      attemptSessions.delete(attemptId);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`Session cleanup: removed ${cleaned} stale sessions. Active: ${attemptSessions.size}`);
  }
}, 10 * 60 * 1000);

io.on('connection', (socket: Socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Single disconnect handler — this used to be split across two separate
  // socket.on('disconnect', ...) registrations (here and near the bottom of
  // this file). Both fired on every disconnect, but the second one read
  // activeSessions[socket.id] AFTER this one had already deleted it, so
  // `session` was always undefined there and the 'student-disconnected'
  // broadcast to admin-monitor never actually fired. Merged into one so the
  // session is read before anything is torn down.
  socket.on('disconnect', (reason) => {
    const session = activeSessions[socket.id];
    console.log('Socket disconnected:', socket.id,
      'reason:', reason,
      'was student:', session?.role === 'student',
      'attemptId:', session?.attemptId
    );

    if (session && session.role === 'student') {
      io.to('admin-monitor').emit('student-disconnected', {
        socketId: socket.id,
        studentId: session.studentId,
        attemptId: session.attemptId,
      });
    }

    delete activeSessions[socket.id];

    const attemptId = socketToAttempt.get(socket.id);
    socketToAttempt.delete(socket.id);
    if (attemptId) {
      setTimeout(() => {
        const current = attemptSessions.get(attemptId);
        if (current && current.socketId === socket.id) {
          attemptSessions.delete(attemptId);
          console.log(`Cleaned up session for attempt ${attemptId} after 60s disconnect grace period`);
        }
      }, 60000);
    }
  });

  // Authentication & Room Joining
  socket.on('join-exam', async (payload: { token: string; attemptId: string; examId: string }) => {
    try {
      const { token, attemptId, examId } = payload;
      const decoded: any = jwt.verify(token, JWT_SECRET);

      console.log('Socket join-exam:', {
        role: decoded.role,
        userId: decoded.userId || decoded.id,
        attemptId,
        examId
      });

      if (attemptSessions.size > 10000) {
        console.error('attemptSessions Map exceeded 10000 entries. Emergency cleanup triggered.');
      }

      const sessionObj = {
        attemptId,
        studentId: decoded.id,
        examId,
        role: decoded.role,
        fullName: decoded.full_name,
      };

      activeSessions[socket.id] = sessionObj;

      // Update attempt-indexed Maps
      if (attemptSessions.has(attemptId)) {
        const existing = attemptSessions.get(attemptId)!;
        socketToAttempt.delete(existing.socketId);
      }
      attemptSessions.set(attemptId, {
        socketId: socket.id,
        studentId: decoded.id,
        examId,
        role: decoded.role,
        lastSeen: Date.now()
      });
      socketToAttempt.set(socket.id, attemptId);

      // Students join attempt-specific room and exam room
      if (decoded.role === 'student') {
        socket.join(`attempt:${attemptId}`);
        socket.join(`exam:${examId}`);
        console.log(`Student ${decoded.email} joined proctoring for attempt ${attemptId}`);
        
        let rollNumber = 'N/A';
        let examName = 'N/A';
        let studentName = decoded.full_name || decoded.email;

        try {
          const detailsResult = await query(`
            SELECT u.roll_number, e.name as exam_name, u.full_name
            FROM exam_attempts ea
            JOIN users u ON ea.student_id = u.id
            JOIN exams e ON ea.exam_id = e.id
            WHERE ea.id = $1
          `, [attemptId]);

          if (detailsResult.rows.length > 0) {
            rollNumber = detailsResult.rows[0].roll_number || 'N/A';
            examName = detailsResult.rows[0].exam_name || 'N/A';
            studentName = detailsResult.rows[0].full_name || studentName;
          }
        } catch (dbErr) {
          console.error('Failed to query student/exam details for proctor room:', dbErr);
        }

        // Notify admin rooms
        io.to('admin-monitor').emit('student-joined', {
          socketId: socket.id,
          studentName,
          studentId: decoded.id,
          attemptId,
          examId,
          rollNumber,
          examName
        });
      } else if (MONITOR_ROLES.includes(decoded.role)) {
        // Faculty also join this room so their live-monitor page receives
        // the same 'student-frame'/'fraud-alert' broadcasts as admins; the
        // faculty REST endpoint (/api/proctor/faculty/live) already scopes
        // which attempts they can see, and the frontend filters incoming
        // frames/alerts down to that same set.
        socket.join('admin-monitor');
        console.log(`${decoded.role} (${decoded.userId || decoded.id}) joined admin-monitor room`);
      } else {
        console.log(`FAILED join for role: ${decoded.role}, token valid: true`);
      }
    } catch (err: any) {
      console.error('Socket authentication failed:', err.message);
      socket.emit('auth-error', { error: 'Authentication failed for Socket.IO' });
      socket.disconnect();
    }
  });

  // Helper function to handle a proctor violation
  async function processViolation(
    attemptId: string,
    studentId: string,
    examId: string,
    eventType: string,
    details: string,
    severity: 'warning' | 'critical',
    socket: Socket,
    screenshot?: string
  ) {
    try {
      // Prevent processing violations if the attempt is already completed or terminated
      const attemptCheck = await query('SELECT status FROM exam_attempts WHERE id = $1', [attemptId]);
      if (attemptCheck.rows.length === 0 || attemptCheck.rows[0].status !== 'ongoing') {
        return;
      }

      // Check if AI face detection is enabled for this exam
      const faceDetectionEnabled = await isFaceDetectionEnabled(examId);
      const isFaceRelatedEvent = ['NO_FACE_DETECTED', 'MULTIPLE_FACES_DETECTED', 'CAMERA_DISABLED'].includes(eventType);
      if (!faceDetectionEnabled && isFaceRelatedEvent) {
        console.log(`[PROCTORING BYPASS] Skipping ${eventType} for exam ${examId} because enable_face_detection is disabled.`);
        return;
      }

      // Save violation log to database
      await query(
        `INSERT INTO proctoring_logs (attempt_id, event_type, details, severity, screenshot)
         VALUES ($1, $2, $3, $4, $5)`,
        [attemptId, eventType, details, severity, screenshot || null]
      );

      // Fetch all violation counts for this attempt to assess against termination rules
      const violationsResult = await query(
        `SELECT event_type, count(*) 
         FROM proctoring_logs 
         WHERE attempt_id = $1 
         GROUP BY event_type`,
        [attemptId]
      );

      const counts: Record<string, number> = {};
      for (const row of violationsResult.rows) {
        counts[row.event_type] = parseInt(row.count);
      }

      // Live alert to Admin
      io.to('admin-monitor').emit('fraud-alert', {
        attemptId,
        studentId,
        eventType,
        details,
        severity,
        counts,
      });

      // Rules evaluation for auto-termination
      let shouldTerminate = false;
      let terminationReason = '';

      if (severity === 'critical') {
        shouldTerminate = true;
        terminationReason = details || 'Proctoring violation limit reached.';
      }
      // Rule 1: Tab switches -> Terminate
      else if ((counts['TAB_SWITCH'] || 0) >= TAB_SWITCH_LIMIT) {
        shouldTerminate = true;
        terminationReason = `Multiple tab switches detected (limit ${TAB_SWITCH_LIMIT}).`;
      }
      // Rule 2: Camera disabled -> Terminate / Auto Submit
      else if (eventType === 'CAMERA_DISABLED') {
        shouldTerminate = true;
        terminationReason = 'Webcam was disabled or blocked.';
      }
      // Rule 3: Mobile Phone detected -> Terminate after limit consecutive detections
      else if (eventType === 'MOBILE_PHONE_DETECTED') {
        const consec = consecutiveViolations[attemptId] || {};
        if ((consec['MOBILE_PHONE_DETECTED'] || 0) >= MOBILE_PHONE_LIMIT) {
          shouldTerminate = true;
          terminationReason = 'Mobile phone or device detected in camera view.';
        }
      }
      // Rule 4: Book detected -> Terminate after limit consecutive detections
      else if (eventType === 'BOOK_DETECTED') {
        const consec = consecutiveViolations[attemptId] || {};
        if ((consec['BOOK_DETECTED'] || 0) >= BOOK_LIMIT) {
          shouldTerminate = true;
          terminationReason = 'Book or study notes detected in camera view.';
        }
      }
      // Rule 5: Multiple faces -> Terminate after limit consecutive detections
      else if (eventType === 'MULTIPLE_FACES_DETECTED') {
        const consec = consecutiveViolations[attemptId] || {};
        if ((consec['MULTIPLE_FACES_DETECTED'] || 0) >= MULTIPLE_FACES_LIMIT) {
          shouldTerminate = true;
          terminationReason = 'Multiple faces detected in the webcam view.';
        }
      }
      // Rule 6: No face for long duration -> Terminate after timeout
      else if (eventType === 'NO_FACE_DETECTED') {
        const start = violationStartTimes[attemptId]?.['NO_FACE_DETECTED'];
        if (start && (Date.now() - start) >= NO_FACE_TIMEOUT_MS) {
          shouldTerminate = true;
          terminationReason = `Prolonged Face Absence (terminated after ${NO_FACE_TIMEOUT_MS / 1000} seconds).`;
        }
      }
      // Rule 7: Fullscreen exit -> Warning then Terminate
      else if ((counts['FULLSCREEN_EXIT'] || 0) >= FULLSCREEN_EXIT_LIMIT) {
        shouldTerminate = true;
        terminationReason = 'Exited fullscreen mode multiple times.';
      }

      if (shouldTerminate) {
        if (eventType === 'CAMERA_DISABLED' || eventType === 'NO_FACE_DETECTED') {
          // Auto-submit: calculate score up to now and mark completed
          const mcqScoreRes = await query('SELECT COALESCE(SUM(marks_obtained), 0) as sum FROM mcq_responses WHERE attempt_id = $1', [attemptId]);
          const mcqScore = parseInt(mcqScoreRes.rows[0].sum);
          const codingScoreRes = await query('SELECT COALESCE(SUM(marks_obtained), 0) as sum FROM coding_responses WHERE attempt_id = $1', [attemptId]);
          const codingScore = parseInt(codingScoreRes.rows[0].sum);
          const totalScore = mcqScore + codingScore;

          const mcqMaxRes = await query('SELECT COALESCE(SUM(marks), 0) as sum FROM mcq_questions WHERE exam_id = $1', [examId]);
          const codingMaxRes = await query('SELECT COALESCE(SUM(marks), 0) as sum FROM coding_questions WHERE exam_id = $1', [examId]);
          const maxScorePossible = parseInt(mcqMaxRes.rows[0].sum) + parseInt(codingMaxRes.rows[0].sum);

          const examResult = await query('SELECT cutoff_percentage FROM exams WHERE id = $1', [examId]);
          const cutoff = examResult.rows[0]?.cutoff_percentage || 50;
          const percentage = maxScorePossible > 0 ? parseFloat(((totalScore / maxScorePossible) * 100).toFixed(2)) : 0;
          const passed = percentage >= cutoff;

          await query(
            `UPDATE exam_attempts 
             SET status = 'completed', score = $1, percentage = $2, passed = $3, completed_at = CURRENT_TIMESTAMP, feedback = $4
             WHERE id = $5`,
            [totalScore, percentage, passed, `Auto-submitted due to: ${terminationReason}`, attemptId]
          );
        } else {
          await query(
            `UPDATE exam_attempts 
             SET status = 'terminated', score = 0, percentage = 0, passed = FALSE, completed_at = CURRENT_TIMESTAMP, feedback = $4
             WHERE id = $5`,
            [0, 0, false, `Terminated due to: ${terminationReason}`, attemptId]
          );
        }

        // Notify student socket to force quit
        io.to(`attempt:${attemptId}`).emit('exam-terminated', {
          reason: terminationReason,
          autoSubmitted: eventType === 'CAMERA_DISABLED' || eventType === 'NO_FACE_DETECTED'
        });

        // Notify Admin of termination
        io.to('admin-monitor').emit('student-terminated', {
          attemptId,
          studentId,
          reason: terminationReason,
          counts
        });

        console.log(`Attempt ${attemptId} auto-terminated due to: ${terminationReason}`);
      } else {
        // Send alert back to student if warning
        const isWebcamEvent = ['MOBILE_PHONE_DETECTED', 'BOOK_DETECTED', 'MULTIPLE_FACES_DETECTED', 'NO_FACE_DETECTED'].includes(eventType);
        const consec = consecutiveViolations[attemptId] || {};
        const consecCount = consec[eventType] || 0;

        const maxLimits: Record<string, number> = {
          'MOBILE_PHONE_DETECTED': MOBILE_PHONE_LIMIT,
          'BOOK_DETECTED': BOOK_LIMIT,
          'MULTIPLE_FACES_DETECTED': MULTIPLE_FACES_LIMIT,
          'NO_FACE_DETECTED': Math.round(NO_FACE_TIMEOUT_MS / 500)
        };

        const limit = maxLimits[eventType] || 3;
        const warningNum = isWebcamEvent ? consecCount : (counts[eventType] || 1);
        let displayMsg = '';
        if (eventType === 'NO_FACE_DETECTED') {
          displayMsg = 'Face not detected. Please return to camera.';
        } else if (eventType === 'MULTIPLE_FACES_DETECTED') {
          if (warningNum >= 3) {
            displayMsg = 'Warning: Multiple faces detected. Please ensure you are alone.';
          } else {
            displayMsg = `Warning: Multiple faces detected (Violation count: ${warningNum}/${limit}).`;
          }
        } else if (isWebcamEvent) {
          displayMsg = `Warning: ${eventType.replace(/_/g, ' ')} detected (Violation count: ${warningNum}/${limit}). Repeated violations will terminate your exam.`;
        } else {
          displayMsg = `Warning: ${eventType.replace(/_/g, ' ')} detected (Violation count: ${warningNum}/3). Repeated actions will terminate your exam.`;
        }

        socket.emit('proctor-warning', {
          message: displayMsg,
          count: warningNum,
        });
      }

    } catch (err: any) {
      console.error('Proctor event handler error:', err);
    }
  }

  // Client emits a proctor violation event
  socket.on('proctor-event', async (data: { eventType: string; details: string; severity: 'warning' | 'critical' }) => {
    const session = activeSessions[socket.id];
    if (!session || session.role !== 'student') return;

    const { attemptId, studentId, examId } = session;
    const { eventType, details, severity } = data;

    await processViolation(attemptId, studentId, examId, eventType, details, severity, socket);
  });

  // Client streams camera frame (low resolution base64 JPEG)
  socket.on('proctor-frame', async (data: { image: string }) => {
    const session = activeSessions[socket.id];
    if (!session || session.role !== 'student') {
      console.warn(`No session found for socket ${socket.id}. Skipping frame.`);
      return;
    }

    const { attemptId, studentId, examId } = session;

    // Broadcast student webcam frame to admin/faculty monitor room — this
    // always happens, independent of whether AI face analysis is enabled
    // for this exam, so admins/faculty can watch live video either way.
    io.to('admin-monitor').emit('student-frame', {
      attemptId: attemptId,
      image: data.image
    });

    // AI analysis is skipped entirely (not just its results discarded) when
    // face detection is off for this exam, to avoid paying for an AI-service
    // round trip on every single frame for no reason.
    const faceDetectionEnabled = await isFaceDetectionEnabled(examId);
    if (!faceDetectionEnabled) {
      if (consecutiveViolations[attemptId]) {
        consecutiveViolations[attemptId]['NO_FACE_DETECTED'] = 0;
        consecutiveViolations[attemptId]['NO_FACE_FRAMES'] = 0;
        consecutiveViolations[attemptId]['WARNED_2S'] = 0;
        consecutiveViolations[attemptId]['LOGGED_5S'] = 0;
      }
      if (violationStartTimes[attemptId]) {
        violationStartTimes[attemptId]['NO_FACE_DETECTED'] = 0;
      }
      socket.emit('proctor-status', {
        faceDetectionEnabled: false,
        trackingStatus: 'Proctoring Disabled',
        message: 'AI proctoring is disabled for this exam',
        detectionSource: 'Disabled'
      });
      return; // Hard guard - if disabled, skip ALL face tracking logic and do not emit warnings/terminate
    }

    // Send the frame to the AI service for analysis
    try {
      const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://ai-service:8000';
      const params = new URLSearchParams();
      params.append('frame', data.image);
      params.append('attemptId', attemptId);

      const response = await fetch(`${AI_SERVICE_URL}/api/ai/proctor/frame`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params
      });

      if (response.ok) {
        const result: any = await response.json();

        // Initialize consecutive violation storage for this attempt
        consecutiveViolations[attemptId] = consecutiveViolations[attemptId] || {};
        const consec = consecutiveViolations[attemptId];

        // Determine if face detection is currently losing/lost tracking
        const isLosingFace = faceDetectionEnabled && (result.trackingStatus === 'Face Lost' || result.trackingStatus === 'Temporary Detection Loss');

        if (!isLosingFace) {
          consec['NO_FACE_DETECTED'] = 0;
          consec['NO_FACE_FRAMES'] = 0;
          consec['WARNED_2S'] = 0;
          consec['LOGGED_5S'] = 0;
          if (violationStartTimes[attemptId]) {
            violationStartTimes[attemptId]['NO_FACE_DETECTED'] = 0;
          }
        }
        if (!result.violations.includes('MULTIPLE_FACES_DETECTED')) {
          consec['MULTIPLE_FACES_DETECTED'] = 0;
        }
        if (!result.violations.includes('MOBILE_PHONE_DETECTED')) {
          consec['MOBILE_PHONE_DETECTED'] = 0;
          phoneConfidences[attemptId] = [];
        }
        if (!result.violations.includes('BOOK_DETECTED')) {
          consec['BOOK_DETECTED'] = 0;
        }
        if (!result.violations.includes('CAMERA_DISABLED')) {
          consec['CAMERA_DISABLED'] = 0;
        }

        // Calculate real-time elapsed seconds for face absence
        let elapsedSec = 0;
        if (isLosingFace) {
          if (!violationStartTimes[attemptId]) {
            violationStartTimes[attemptId] = {};
          }
          if (!violationStartTimes[attemptId]['NO_FACE_DETECTED']) {
            violationStartTimes[attemptId]['NO_FACE_DETECTED'] = Date.now();
          }
          elapsedSec = (Date.now() - violationStartTimes[attemptId]['NO_FACE_DETECTED']) / 1000;
        }

        // Emit real-time tracking status to student
        socket.emit('proctor-status', {
          faceConfidence: result.faceConfidence || 0.0,
          trackingStatus: result.trackingStatus || 'Face Present',
          facePresent: !!result.facePresent,
          faceLost: !!result.faceLost,
          faceRecovered: !!result.faceRecovered,
          elapsedLost: elapsedSec,
          violations: result.violations || [],
          faceCount: result.faceCount || 0,
          detectionSource: result.detectionSource || 'None'
        });

        // Handle face loss timing with synchronized tracker state from AI service
        if (isLosingFace) {
          consec['NO_FACE_FRAMES'] = (consec['NO_FACE_FRAMES'] || 0) + 1;

          console.log(`[PROCTOR LOG] Attempt: ${attemptId} | Status: ${result.trackingStatus} | Face Confidence: ${(result.faceConfidence || 0).toFixed(2)} | Elapsed Loss: ${elapsedSec.toFixed(1)}s`);

          if (elapsedSec >= 2 && elapsedSec < 5 && !consec['WARNED_2S']) {
            consec['WARNED_2S'] = 1;
            socket.emit('proctor-warning', {
              message: 'Face not detected. Please return to camera.',
              count: consec['NO_FACE_FRAMES']
            });
          } else if (elapsedSec >= 5 && elapsedSec < 10 && !consec['LOGGED_5S']) {
            consec['LOGGED_5S'] = 1;
            const details = `No face detected for ${elapsedSec.toFixed(1)} seconds (Fraud Event). (Face confidence: ${result.faceConfidence || 0})`;
            await processViolation(
              attemptId,
              studentId,
              examId,
              'NO_FACE_DETECTED',
              details,
              'warning',
              socket,
              data.image
            );
          } else if (elapsedSec >= 10) {
            const details = `Prolonged Face Absence (terminated after ${elapsedSec.toFixed(1)} seconds). (Face confidence: ${result.faceConfidence || 0})`;
            await processViolation(
              attemptId,
              studentId,
              examId,
              'NO_FACE_DETECTED',
              details,
              'critical',
              socket,
              data.image
            );
          }
        }

        const currentViolations = result.violations || [];
        if (Array.isArray(currentViolations)) {
          for (const violation of currentViolations) {
            if (violation === 'NO_FACE_DETECTED') {
              continue; // Handled separately above
            }
            consec[violation] = (consec[violation] || 0) + 1;
            const consecCount = consec[violation];

            if (violation === 'MULTIPLE_FACES_DETECTED') {
              // Fraud Counter +1: Log warning in db on every frame
              await processViolation(
                attemptId,
                studentId,
                examId,
                violation,
                'Multiple faces detected in the webcam view.',
                'warning',
                socket,
                data.image
              );
            }
            else if (violation === 'MOBILE_PHONE_DETECTED') {
              const phoneConf = result.confidences?.["cell phone"] || 0.0;
              const confStr = (phoneConf * 100).toFixed(1);
              
              // Store confidence scores in memory to log them on the 5th frame
              phoneConfidences[attemptId] = phoneConfidences[attemptId] || [];
              phoneConfidences[attemptId].push(confStr);
              
              if (consecCount >= 5) {
                const confList = phoneConfidences[attemptId] || [];
                const confListStr = confList.slice(0, 5).map(c => c + '%').join(', ');
                await processViolation(
                  attemptId,
                  studentId,
                  examId,
                  violation,
                  `Fraud Event: Mobile phone detected in camera view for 5 consecutive frames (Confidences: ${confListStr}).`,
                  'critical',
                  socket,
                  data.image
                );
                phoneConfidences[attemptId] = [];
              } else {
                // Do not log Fraud Event inside database yet; just show a caution warning to student
                socket.emit('proctor-warning', {
                  message: `Warning: Mobile phone usage suspected (Frame ${consecCount}/5). Please put it away.`,
                  count: consecCount
                });
              }
            }
            else if (violation === 'BOOK_DETECTED') {
              const bookConf = result.confidences?.["book"] || 0.0;
              const confStr = (bookConf * 100).toFixed(1);
              
              if (consecCount === 2) {
                socket.emit('proctor-warning', {
                  message: `Warning: Book or notes detected in camera view (Confidence: ${confStr}%).`,
                  count: consecCount
                });
              } else if (consecCount >= 8) {
                // Terminate exam
                await processViolation(
                  attemptId,
                  studentId,
                  examId,
                  violation,
                  `Book or notes detected repeatedly (Confidence: ${confStr}%).`,
                  'critical',
                  socket,
                  data.image
                );
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error('Failed to call AI service for frame analysis:', err.message);
    }
  });

  // Admin triggers a manual student exam termination
  socket.on('admin-terminate-student', async (data: { attemptId: string; reason: string }) => {
    const session = activeSessions[socket.id];
    // Security check: Must be authenticated as an admin-tier role
    if (!session || !ADMIN_TIER_ROLES.includes(session.role)) {
      console.warn(`Unauthorized termination attempt from socket ${socket.id}`);
      return;
    }

    const { attemptId, reason } = data;
    const terminatedByName = session.fullName || 'Admin';
    const terminatedByRole = session.role;
    console.log(`[ADMIN TERMINATION] ${terminatedByName} (${socket.id}) is terminating attempt ${attemptId} for reason: ${reason}`);

    try {
      // 1. Update the database attempt status
      const fullReason = `Exam manually terminated by ${terminatedByName} (${terminatedByRole}). Reason: ${reason}`;

      const attemptRes = await query('SELECT student_id, exam_id FROM exam_attempts WHERE id = $1', [attemptId]);
      if (attemptRes.rows.length === 0) {
        console.error(`Attempt ${attemptId} not found for termination`);
        return;
      }
      const { student_id: studentId, exam_id: examId } = attemptRes.rows[0];

      await query(
        `UPDATE exam_attempts
         SET status = 'terminated', score = 0, percentage = 0.00, passed = FALSE, feedback = $1,
             terminated_by_name = $3, terminated_by_role = $4
         WHERE id = $2`,
        [fullReason, attemptId, terminatedByName, terminatedByRole]
      );

      // 2. Insert critical proctor log for audit trail
      await query(
        `INSERT INTO proctoring_logs (attempt_id, event_type, details, severity)
         VALUES ($1, 'MANUAL_TERMINATION', $2, 'critical')`,
        [attemptId, reason]
      );

      // 3. Emit termination event to student socket/room
      io.to(`attempt:${attemptId}`).emit('exam-terminated', {
        reason: fullReason,
        autoSubmitted: false
      });

      // 4. Broadcast to other admins that attempt was terminated
      io.to('admin-monitor').emit('student-terminated', {
        attemptId,
        studentId,
        reason: fullReason,
        counts: {}
      });

    } catch (err: any) {
      console.error('Error handling admin-terminate-student socket event:', err);
    }
  });

  // Admin triggers a manual student exam warning
  socket.on('admin-warn-student', async (data: { attemptId: string; reason: string }) => {
    const session = activeSessions[socket.id];
    // Security check: Must be authenticated as an admin-tier role
    if (!session || !ADMIN_TIER_ROLES.includes(session.role)) {
      console.warn(`Unauthorized warning attempt from socket ${socket.id}`);
      return;
    }

    const { attemptId, reason } = data;
    console.log(`[ADMIN WARNING] Admin ${socket.id} is warning attempt ${attemptId} for reason: ${reason}`);

    try {
      // 1. Insert proctor log for audit trail
      await query(
        `INSERT INTO proctoring_logs (attempt_id, event_type, details, severity)
         VALUES ($1, 'MANUAL_WARNING', $2, 'warning')`,
        [attemptId, reason]
      );

      // 2. Emit manual warning event to student socket/room
      io.to(`attempt:${attemptId}`).emit('admin-warning', {
        reason: reason
      });

      // 3. Broadcast update to admin-monitor so other admins/proctors see the warning
      const violationsResult = await query(
        `SELECT event_type, count(*) 
         FROM proctoring_logs 
         WHERE attempt_id = $1 
         GROUP BY event_type`,
        [attemptId]
      );

      const counts: Record<string, number> = {};
      for (const row of violationsResult.rows) {
        counts[row.event_type] = parseInt(row.count);
      }

      // Live alert to Admin
      io.to('admin-monitor').emit('fraud-alert', {
        attemptId,
        eventType: 'MANUAL_WARNING',
        details: reason,
        severity: 'warning',
        counts,
      });

    } catch (err: any) {
      console.error('Error handling admin-warn-student socket event:', err);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Proctoring Service listening on port ${PORT}`);
});

// Health check endpoints for Kubernetes liveness and readiness probes
app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'proctoring-service' });
});

app.get('/ready', (_req, res) => {
  res.status(200).json({ status: 'ready', service: 'proctoring-service' });
});
