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

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception in proctoring-service:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection in proctoring-service at:', promise, 'reason:', reason);
});

// Database Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@postgres:5432/clahan_academy?sslmode=disable',
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
app.use(express.json());

// Disable caching for all API responses
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

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

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Maintain active sockets mapping
// key: socket.id, value: details
const activeSessions: Record<string, { attemptId: string; studentId: string; examId: string; role: string }> = {};

io.on('connection', (socket: Socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Authentication & Room Joining
  socket.on('join-exam', async (payload: { token: string; attemptId: string; examId: string }) => {
    try {
      const { token, attemptId, examId } = payload;
      const decoded: any = jwt.verify(token, JWT_SECRET);

      activeSessions[socket.id] = {
        attemptId,
        studentId: decoded.id,
        examId,
        role: decoded.role,
      };

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
      } else if (decoded.role === 'admin') {
        socket.join('admin-monitor');
        console.log(`Admin joined live proctoring monitor room`);
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
    socket: Socket
  ) {
    try {
      // Save violation log to database
      await query(
        `INSERT INTO proctoring_logs (attempt_id, event_type, details, severity)
         VALUES ($1, $2, $3, $4)`,
        [attemptId, eventType, details, severity]
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

      // Rule 1: 3 Tab switches -> Terminate
      if ((counts['TAB_SWITCH'] || 0) >= 3) {
        shouldTerminate = true;
        terminationReason = 'Multiple tab switches detected (limit 3).';
      }
      // Rule 2: Camera disabled -> Terminate
      else if (eventType === 'CAMERA_DISABLED') {
        shouldTerminate = true;
        terminationReason = 'Webcam was disabled or blocked.';
      }
      // Rule 3: Mobile Phone detected -> Terminate after 10 cumulative detections
      else if ((counts['MOBILE_PHONE_DETECTED'] || 0) >= 10) {
        shouldTerminate = true;
        terminationReason = 'Mobile phone or device detected in camera view.';
      }
      // Rule 4: Book detected -> Terminate after 15 cumulative detections
      else if ((counts['BOOK_DETECTED'] || 0) >= 15) {
        shouldTerminate = true;
        terminationReason = 'Book or study notes detected in camera view.';
      }
      // Rule 5: Multiple faces -> Terminate after 10 cumulative detections
      else if ((counts['MULTIPLE_FACES_DETECTED'] || 0) >= 10) {
        shouldTerminate = true;
        terminationReason = 'Multiple faces detected in the webcam view.';
      }
      // Rule 6: No face for long duration -> Warning then Terminate (25 violations, approx. 37.5 seconds)
      else if ((counts['NO_FACE_DETECTED'] || 0) >= 25) {
        shouldTerminate = true;
        terminationReason = 'No face detected for prolonged duration.';
      }
      // Rule 7: Fullscreen exit -> Warning then Terminate (limit 3)
      else if ((counts['FULLSCREEN_EXIT'] || 0) >= 3) {
        shouldTerminate = true;
        terminationReason = 'Exited fullscreen mode multiple times.';
      }

      if (shouldTerminate) {
        // Update exam_attempts database to 'terminated', score=0, passed=false
        await query(
          `UPDATE exam_attempts 
           SET status = 'terminated', score = 0, percentage = 0.00, passed = FALSE, feedback = $1
           WHERE id = $2`,
          [`Exam automatically terminated: ${terminationReason}`, attemptId]
        );

        // Notify student socket to force quit
        io.to(`attempt:${attemptId}`).emit('exam-terminated', {
          reason: terminationReason,
        });

        // Notify Admin of termination
        io.to('admin-monitor').emit('student-terminated', {
          attemptId,
          studentId,
          reason: terminationReason,
        });

        console.log(`Attempt ${attemptId} auto-terminated due to: ${terminationReason}`);
      } else {
        // Send alert back to student if warning
        socket.emit('proctor-warning', {
          message: `Warning: ${eventType.replace(/_/g, ' ')} detected. Repeated actions will terminate your exam.`,
          count: counts[eventType] || 1,
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
    if (!session || session.role !== 'student') return;

    const { attemptId, studentId, examId } = session;

    // Broadcast student webcam frame to admin monitor room
    io.to('admin-monitor').emit('student-frame', {
      attemptId: attemptId,
      image: data.image
    });

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
        if (result.violations && Array.isArray(result.violations)) {
          for (const violation of result.violations) {
            const severity = (violation === 'MOBILE_PHONE_DETECTED' || 
                              violation === 'BOOK_DETECTED' || 
                              violation === 'MULTIPLE_FACES_DETECTED') ? 'critical' : 'warning';
            
            await processViolation(
              attemptId,
              studentId,
              examId,
              violation,
              `AI detected infraction: ${violation}`,
              severity,
              socket
            );
          }
        }
      }
    } catch (err: any) {
      console.error('Failed to call AI service for frame analysis:', err.message);
    }
  });

  socket.on('disconnect', () => {
    const session = activeSessions[socket.id];
    if (session && session.role === 'student') {
      io.to('admin-monitor').emit('student-disconnected', {
        socketId: socket.id,
        studentId: session.studentId,
        attemptId: session.attemptId,
      });
    }
    delete activeSessions[socket.id];
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Proctoring Service listening on port ${PORT}`);
});
