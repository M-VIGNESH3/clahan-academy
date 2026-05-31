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

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_access_token_key';

// Database Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@postgres:5432/clahan_academy?sslmode=disable',
});
const query = (text: string, params?: any[]) => pool.query(text, params);

app.use(helmet());
app.use(cors());
app.use(express.json());

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
    res.json(result.rows);
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
  socket.on('join-exam', (payload: { token: string; attemptId: string; examId: string }) => {
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
        
        // Notify admin rooms
        io.to('admin-monitor').emit('student-joined', {
          socketId: socket.id,
          studentName: decoded.fullName || decoded.email,
          studentId: decoded.id,
          attemptId,
          examId,
        });
      } else if (decoded.role === 'admin') {
        socket.join('admin-monitor');
        console.log(`Admin joined live proctoring monitor room`);
      }
    } catch (err: any) {
      socket.emit('auth-error', { error: 'Authentication failed for Socket.IO' });
      socket.disconnect();
    }
  });

  // Client emits a proctor violation event
  socket.on('proctor-event', async (data: { eventType: string; details: string; severity: 'warning' | 'critical' }) => {
    const session = activeSessions[socket.id];
    if (!session || session.role !== 'student') return;

    const { attemptId, studentId, examId } = session;
    const { eventType, details, severity } = data;

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

      // Rule 1: 1 Tab switch -> Terminate
      if ((counts['TAB_SWITCH'] || 0) >= 1) {
        shouldTerminate = true;
        terminationReason = 'Tab switch detected (limit 1).';
      }
      // Rule 2: Camera disabled -> Terminate
      else if (eventType === 'CAMERA_DISABLED') {
        shouldTerminate = true;
        terminationReason = 'Webcam was disabled or blocked.';
      }
      // Rule 3: Mobile Phone detected -> Terminate
      else if (eventType === 'MOBILE_PHONE_DETECTED') {
        shouldTerminate = true;
        terminationReason = 'Mobile phone or device detected by AI.';
      }
      // Rule 4: Book detected -> Terminate
      else if (eventType === 'BOOK_DETECTED') {
        shouldTerminate = true;
        terminationReason = 'Book or study notes detected by AI.';
      }
      // Rule 5: Multiple faces -> Terminate
      else if (eventType === 'MULTIPLE_FACES_DETECTED') {
        shouldTerminate = true;
        terminationReason = 'Multiple faces detected in the webcam view.';
      }
      // Rule 6: No face for long duration -> Warning then Terminate (e.g. 3 violations of NO_FACE)
      else if ((counts['NO_FACE_DETECTED'] || 0) >= 3) {
        shouldTerminate = true;
        terminationReason = 'No face detected for prolonged duration.';
      }
      // Rule 7: Fullscreen exit -> Warning then Terminate (e.g. 3 exits)
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
