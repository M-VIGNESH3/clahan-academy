"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const pg_1 = require("pg");
pg_1.types.setTypeParser(1114, (str) => new Date(str.replace(' ', 'T') + 'Z'));
const jwt = __importStar(require("jsonwebtoken"));
const app = (0, express_1.default)();
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
const pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@postgres:5432/clahan_academy?sslmode=disable',
    max: 50,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});
pool.on('error', (err) => {
    console.error('Unexpected error on idle pg client in proctoring-service:', err);
});
const query = (text, params) => pool.query(text, params);
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ limit: '10mb', extended: true }));
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
    }
    catch (err) {
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
        }
        else {
            return res.status(500).json({ error: 'Failed to verify face with AI service' });
        }
    }
    catch (err) {
        console.error('Error verifying face:', err);
        return res.status(500).json({ error: err.message });
    }
});
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});
const examFaceDetectionCache = {};
async function isFaceDetectionEnabled(examId) {
    const now = Date.now();
    const cached = examFaceDetectionCache[examId];
    if (cached && cached.expiresAt > now) {
        return cached.enabled;
    }
    try {
        const res = await query('SELECT enable_face_detection FROM exams WHERE id = $1', [examId]);
        const enabled = res.rows.length > 0 ? res.rows[0].enable_face_detection !== false : true;
        examFaceDetectionCache[examId] = {
            enabled,
            expiresAt: now + 5000 // Cache for 5 seconds
        };
        return enabled;
    }
    catch (err) {
        console.error(`Error querying enable_face_detection for exam ${examId}:`, err);
        return true;
    }
}
const activeSessions = {};
// Track consecutive violations in memory (key: attemptId, value: Record<eventType, count>)
const consecutiveViolations = {};
// Track first seen timestamps for duration-based violations (key: attemptId, value: Record<eventType, timestamp>)
const violationStartTimes = {};
// Track phone confidences in memory (key: attemptId, value: array of confidence strings)
const phoneConfidences = {};
io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    // Authentication & Room Joining
    socket.on('join-exam', async (payload) => {
        try {
            const { token, attemptId, examId } = payload;
            const decoded = jwt.verify(token, JWT_SECRET);
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
                }
                catch (dbErr) {
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
            }
            else if (decoded.role === 'admin') {
                socket.join('admin-monitor');
                console.log(`Admin joined live proctoring monitor room`);
            }
        }
        catch (err) {
            console.error('Socket authentication failed:', err.message);
            socket.emit('auth-error', { error: 'Authentication failed for Socket.IO' });
            socket.disconnect();
        }
    });
    // Helper function to handle a proctor violation
    async function processViolation(attemptId, studentId, examId, eventType, details, severity, socket, screenshot) {
        try {
            // Prevent processing violations if the attempt is already completed or terminated
            const attemptCheck = await query('SELECT status FROM exam_attempts WHERE id = $1', [attemptId]);
            if (attemptCheck.rows.length === 0 || attemptCheck.rows[0].status !== 'ongoing') {
                return;
            }
            // Save violation log to database
            await query(`INSERT INTO proctoring_logs (attempt_id, event_type, details, severity, screenshot)
         VALUES ($1, $2, $3, $4, $5)`, [attemptId, eventType, details, severity, screenshot || null]);
            // Fetch all violation counts for this attempt to assess against termination rules
            const violationsResult = await query(`SELECT event_type, count(*) 
         FROM proctoring_logs 
         WHERE attempt_id = $1 
         GROUP BY event_type`, [attemptId]);
            const counts = {};
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
                    const percentage = maxScorePossible > 0 ? (totalScore / maxScorePossible) * 100 : 0.0;
                    const passed = percentage >= cutoff;
                    const feedbackStr = `Exam auto-submitted due to: ${terminationReason}`;
                    await query(`UPDATE exam_attempts 
             SET status = 'completed', score = $1, percentage = $2, passed = $3, mcq_score = $4, coding_score = $5, feedback = $6
             WHERE id = $7`, [totalScore, percentage, passed, mcqScore, codingScore, feedbackStr, attemptId]);
                }
                else {
                    // Standard termination
                    await query(`UPDATE exam_attempts 
             SET status = 'terminated', score = 0, percentage = 0.00, passed = FALSE, feedback = $1
             WHERE id = $2`, [`Exam automatically terminated: ${terminationReason}`, attemptId]);
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
            }
            else {
                // Send alert back to student if warning
                const isWebcamEvent = ['MOBILE_PHONE_DETECTED', 'BOOK_DETECTED', 'MULTIPLE_FACES_DETECTED', 'NO_FACE_DETECTED'].includes(eventType);
                const consec = consecutiveViolations[attemptId] || {};
                const consecCount = consec[eventType] || 0;
                const maxLimits = {
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
                }
                else if (eventType === 'MULTIPLE_FACES_DETECTED') {
                    if (warningNum >= 3) {
                        displayMsg = 'Warning: Multiple faces detected. Please ensure you are alone.';
                    }
                    else {
                        displayMsg = `Warning: Multiple faces detected (Violation count: ${warningNum}/${limit}).`;
                    }
                }
                else if (isWebcamEvent) {
                    displayMsg = `Warning: ${eventType.replace(/_/g, ' ')} detected (Violation count: ${warningNum}/${limit}). Repeated violations will terminate your exam.`;
                }
                else {
                    displayMsg = `Warning: ${eventType.replace(/_/g, ' ')} detected (Violation count: ${warningNum}/3). Repeated actions will terminate your exam.`;
                }
                socket.emit('proctor-warning', {
                    message: displayMsg,
                    count: warningNum,
                });
            }
        }
        catch (err) {
            console.error('Proctor event handler error:', err);
        }
    }
    // Client emits a proctor violation event
    socket.on('proctor-event', async (data) => {
        const session = activeSessions[socket.id];
        if (!session || session.role !== 'student')
            return;
        const { attemptId, studentId, examId } = session;
        const { eventType, details, severity } = data;
        await processViolation(attemptId, studentId, examId, eventType, details, severity, socket);
    });
    // Client streams camera frame (low resolution base64 JPEG)
    socket.on('proctor-frame', async (data) => {
        const session = activeSessions[socket.id];
        if (!session || session.role !== 'student')
            return;
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
                const result = await response.json();
                // Fetch if face detection is enabled for this exam
                const faceDetectionEnabled = await isFaceDetectionEnabled(examId);
                if (!faceDetectionEnabled) {
                    // Bypass face detection: strip face-related violations and override lost face flags
                    result.violations = (result.violations || []).filter((v) => v !== 'NO_FACE_DETECTED' && v !== 'MULTIPLE_FACES_DETECTED');
                    result.trackingStatus = 'Face Present';
                    result.facePresent = true;
                    result.faceLost = false;
                    result.faceRecovered = false;
                }
                // Initialize consecutive violation storage for this attempt
                consecutiveViolations[attemptId] = consecutiveViolations[attemptId] || {};
                const consec = consecutiveViolations[attemptId];
                // Determine if face detection is currently losing/lost tracking
                const isLosingFace = result.trackingStatus === 'Face Lost' || result.trackingStatus === 'Temporary Detection Loss';
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
                    }
                    else if (elapsedSec >= 5 && elapsedSec < 10 && !consec['LOGGED_5S']) {
                        consec['LOGGED_5S'] = 1;
                        const details = `No face detected for ${elapsedSec.toFixed(1)} seconds (Fraud Event). (Face confidence: ${result.faceConfidence || 0})`;
                        await processViolation(attemptId, studentId, examId, 'NO_FACE_DETECTED', details, 'warning', socket, data.image);
                    }
                    else if (elapsedSec >= 10) {
                        const details = `Prolonged Face Absence (terminated after ${elapsedSec.toFixed(1)} seconds). (Face confidence: ${result.faceConfidence || 0})`;
                        await processViolation(attemptId, studentId, examId, 'NO_FACE_DETECTED', details, 'critical', socket, data.image);
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
                            await processViolation(attemptId, studentId, examId, violation, 'Multiple faces detected in the webcam view.', 'warning', socket, data.image);
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
                                await processViolation(attemptId, studentId, examId, violation, `Fraud Event: Mobile phone detected in camera view for 5 consecutive frames (Confidences: ${confListStr}).`, 'critical', socket, data.image);
                                phoneConfidences[attemptId] = [];
                            }
                            else {
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
                            }
                            else if (consecCount >= 8) {
                                // Terminate exam
                                await processViolation(attemptId, studentId, examId, violation, `Book or notes detected repeatedly (Confidence: ${confStr}%).`, 'critical', socket, data.image);
                            }
                        }
                    }
                }
            }
        }
        catch (err) {
            console.error('Failed to call AI service for frame analysis:', err.message);
        }
    });
    // Admin triggers a manual student exam termination
    socket.on('admin-terminate-student', async (data) => {
        const session = activeSessions[socket.id];
        // Security check: Must be authenticated as admin
        if (!session || session.role !== 'admin') {
            console.warn(`Unauthorized termination attempt from socket ${socket.id}`);
            return;
        }
        const { attemptId, reason } = data;
        console.log(`[ADMIN TERMINATION] Admin ${socket.id} is terminating attempt ${attemptId} for reason: ${reason}`);
        try {
            // 1. Update the database attempt status
            const fullReason = `Exam manually terminated by Administrator. Reason: ${reason}`;
            const attemptRes = await query('SELECT student_id, exam_id FROM exam_attempts WHERE id = $1', [attemptId]);
            if (attemptRes.rows.length === 0) {
                console.error(`Attempt ${attemptId} not found for termination`);
                return;
            }
            const { student_id: studentId, exam_id: examId } = attemptRes.rows[0];
            await query(`UPDATE exam_attempts 
         SET status = 'terminated', score = 0, percentage = 0.00, passed = FALSE, feedback = $1
         WHERE id = $2`, [fullReason, attemptId]);
            // 2. Insert critical proctor log for audit trail
            await query(`INSERT INTO proctoring_logs (attempt_id, event_type, details, severity)
         VALUES ($1, 'MANUAL_TERMINATION', $2, 'critical')`, [attemptId, reason]);
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
        }
        catch (err) {
            console.error('Error handling admin-terminate-student socket event:', err);
        }
    });
    // Admin triggers a manual student exam warning
    socket.on('admin-warn-student', async (data) => {
        const session = activeSessions[socket.id];
        // Security check: Must be authenticated as admin
        if (!session || session.role !== 'admin') {
            console.warn(`Unauthorized warning attempt from socket ${socket.id}`);
            return;
        }
        const { attemptId, reason } = data;
        console.log(`[ADMIN WARNING] Admin ${socket.id} is warning attempt ${attemptId} for reason: ${reason}`);
        try {
            // 1. Insert proctor log for audit trail
            await query(`INSERT INTO proctoring_logs (attempt_id, event_type, details, severity)
         VALUES ($1, 'MANUAL_WARNING', $2, 'warning')`, [attemptId, reason]);
            // 2. Emit manual warning event to student socket/room
            io.to(`attempt:${attemptId}`).emit('admin-warning', {
                reason: reason
            });
            // 3. Broadcast update to admin-monitor so other admins/proctors see the warning
            const violationsResult = await query(`SELECT event_type, count(*) 
         FROM proctoring_logs 
         WHERE attempt_id = $1 
         GROUP BY event_type`, [attemptId]);
            const counts = {};
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
        }
        catch (err) {
            console.error('Error handling admin-warn-student socket event:', err);
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
