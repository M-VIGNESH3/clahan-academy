# Clahan Academy V2 — Complete System Documentation & Architecture Guide

Welcome to the official system documentation for the **Clahan Academy Online Exam Platform**. 

Clahan Academy V2 is an enterprise-grade, highly decoupled microservices-based web application. It is engineered to support high-throughput concurrent exam sessions (10,000+ simultaneous students) with features including real-time visual/web proctoring, AI-assisted descriptive grading, and an isolated compiler sandbox.

---

## 🗺️ 1. High-Level Architecture & Components

The application is built on a highly decoupled microservices pattern, cleanly separating the user-facing presentation layer (React SPA) from specialized backend domain APIs, compilation sandboxes, and artificial intelligence models.

```mermaid
graph TD
    %% User Tier
    Client["Frontend Client / SPA"]

    %% Gateway/Proxy Routing (App Level)
    subgraph Frontend Proxy
        Client -->|"/api/auth"| AuthServ["Auth Service"]
        Client -->|"/api/admin"| AdminServ["Admin Service"]
        Client -->|"/api/student"| StudentServ["Student Service"]
        Client -->|"/api/exams"| ExamServ["Exam Service"]
        Client -->|"/api/proctor & WebSockets"| ProctorServ["Proctoring Service"]
        Client -->|"/api/notifications"| NotificationServ["Notification Service"]
    end

    %% Data & Cache Layer
    subgraph Data Layer
        AuthServ -->|SQL| Postgres[(PostgreSQL)]
        AdminServ -->|SQL| Postgres
        StudentServ -->|SQL| Postgres
        ExamServ -->|SQL| Postgres
        ProctorServ -->|SQL| Postgres

        AuthServ -->|"PubSub / Cache"| Redis[(Redis)]
        AdminServ -->|"PubSub / Cache"| Redis
        ProctorServ -->|"PubSub / Cache"| Redis
        NotificationServ -->|"PubSub / Cache"| Redis
    end

    %% AI Subsystem
    subgraph AI Subsystem
        ExamServ -->|REST| AIServ["AI Service Hub"]
        ProctorServ -->|REST| AIServ
        
        AIServ -->|LLM Queries| Ollama["Ollama Service"]
        AIServ -->|Object Detection| YOLO["YOLO v8 Service"]
        AIServ -->|Face Matching| InsightFace["InsightFace Service"]
    end

    %% Sandbox Subsystem
    subgraph Execution Subsystem
        ExamServ -->|REST| Judge0["Judge0 API"]
    end
```

### Gateway Proxy Configuration
The **Frontend Service** contains an Nginx/Vite configuration that acts as the API Gateway. All incoming client HTTP requests to `/api/*` are dynamically routed based on their path prefixes:
* `/api/auth` $\rightarrow$ **Auth Service** (Port 4001)
* `/api/admin` $\rightarrow$ **Admin Service** (Port 4002)
* `/api/student` $\rightarrow$ **Student Service** (Port 4003)
* `/api/exams` $\rightarrow$ **Exam Service** (Port 4004)
* `/api/proctor` & Sockets $\rightarrow$ **Proctoring Service** (Port 4005)
* `/api/notifications` $\rightarrow$ **Notification Service** (Port 4006)

---

## 📦 2. Microservice Topology

The system comprises **8 custom services** alongside specialized ML engines, compiler sandboxes, and relational databases.

| Directory Name | Exposed Port | Tech Stack | Primary Responsibilities |
| :--- | :---: | :--- | :--- |
| **`frontend-service`** | `5173` | React, Vite, TS, TailwindCSS | Serves the SPA; handles client-side webcam captures, IDE interfaces, and charts. |
| **`auth-service`** | `4001` | Node.js, Express, TS | Manages logins, user registrations, OTP secrets, and dual-token (Access/Refresh JWT) workflows. |
| **`admin-service`** | `4002` | Node.js, Express, TS | Handles CRUD for Batches, Colleges, Departments, and Trainers; processes CSV imports; collects platform metrics. |
| **`student-service`** | `4003` | Node.js, Express, TS | Provides student profile management, dashboards summaries, and in-app notifications. |
| **`exam-service`** | `4004` | Node.js, Express, TS | Manages exam creations, MCQ and Coding question banks, compiler execution, and final score evaluations. |
| **`proctoring-service`** | `4005` | Node.js, Express, Socket.IO | Orchestrates Socket.IO signaling rooms, streams camera frames to AI service, and executes rules termination triggers. |
| **`notification-service`**| `4006` | Node.js, BullMQ Worker, TS | Processes asynchronous email queues (OTP, registrations, results) out of Redis and handles SMTP transport. |
| **`ai-service`** | `8000` | Python, FastAPI, OpenCV | Coordinates object detection, InsightFace matching, and Ollama prompts. |

### Supporting Infrastructures
* **`ollama-service`** (Port `11434`): Hosts local Large Language Models (Phi-3) for subjective text evaluation and algorithmic question generation.
* **`judge0-api`** (Port `2358`): Provides an isolated multi-language code compilation sandbox.
* **`redis`** (Port `6379`): Acts as a shared in-memory cache and a task broker queue (BullMQ) for asynchronous tasks.
* **`postgres`** (Port `5432`): Shared relational database storing platform configurations, users, and exam data.

---

## 🗄️ 3. Relational Database Schema

PostgreSQL serves as the primary system of record. Below is the entity relationship breakdown.

```mermaid
erDiagram
    colleges ||--o{ departments : "contains"
    colleges ||--o{ batches : "owns"
    colleges ||--o{ trainers : "employs"
    colleges ||--o{ users : "registers"
    departments ||--o{ users : "assigns"
    batches ||--o{ users : "assigns"
    batches ||--o{ trainers : "manages"
    trainers ||--o{ users : "mentors"
    users ||--o{ exam_attempts : "takes"
    exams ||--o{ exam_attempts : "evaluates"
    exams ||--o{ mcq_questions : "contains"
    exams ||--o{ coding_questions : "contains"
    coding_questions ||--o{ coding_test_cases : "defines"
    exam_attempts ||--o{ mcq_responses : "tracks"
    exam_attempts ||--o{ coding_responses : "tracks"
    exam_attempts ||--o{ proctoring_logs : "records"
    users ||--o{ audit_logs : "logs"
```

### Table Definitions & DDL Schema

#### 1. `colleges`
Stores institutions registered on the platform.
* `id` (UUID, PK, Default: `uuid_generate_v4()`)
* `name` (VARCHAR, Not Null, Unique)
* `created_at` (TIMESTAMP, Default: `CURRENT_TIMESTAMP`)

#### 2. `departments`
Divisions within a college.
* `id` (UUID, PK)
* `college_id` (UUID, FK $\rightarrow$ `colleges.id`, Cascade On Delete)
* `name` (VARCHAR, Not Null)
* `created_at` (TIMESTAMP)

#### 3. `batches`
Year groups or cohort divisions within colleges.
* `id` (UUID, PK)
* `college_id` (UUID, FK $\rightarrow$ `colleges.id`, Cascade On Delete)
* `name` (VARCHAR, Not Null)
* `created_at` (TIMESTAMP)

#### 4. `trainers`
Staff or faculty assigned to monitor batches or mentor students.
* `id` (UUID, PK)
* `college_id` (UUID, FK $\rightarrow$ `colleges.id`)
* `name` (VARCHAR, Not Null)
* `email` (VARCHAR, Unique)
* `phone` (VARCHAR)
* `specialization` (VARCHAR)
* `batch_id` (UUID, FK $\rightarrow$ `batches.id`, Set Null On Delete)
* `created_at` (TIMESTAMP)

#### 5. `users`
Accounts registered on the platform (Students and Admins).
* `id` (UUID, PK)
* `email` (VARCHAR, Unique, Not Null)
* `password_hash` (VARCHAR, Not Null)
* `role` (role_type enum: `'admin'`, `'student'`)
* `full_name` (VARCHAR, Not Null)
* `phone` (VARCHAR)
* `roll_number` (VARCHAR)
* `college_id` (UUID, FK $\rightarrow$ `colleges.id`)
* `department_id` (UUID, FK $\rightarrow$ `departments.id`)
* `batch_id` (UUID, FK $\rightarrow$ `batches.id`)
* `trainer_id` (UUID, FK $\rightarrow$ `trainers.id`)
* `year` (VARCHAR)
* `status` (VARCHAR, Default: `'pending'`)
* `github_profile` (VARCHAR)
* `linkedin_profile` (VARCHAR)
* `profile_photo_url` (VARCHAR)
* `otp_secret` (VARCHAR)
* `email_verified` (BOOLEAN, Default: `false`)
* `raw_password` (VARCHAR) — *Stores seed password plain-text for initial login distribution*
* `created_at` (TIMESTAMP)

#### 6. `exams`
Schedules and configurations for test runs.
* `id` (UUID, PK)
* `name` (VARCHAR, Not Null)
* `description` (TEXT)
* `exam_type` (exam_type_enum: `'mcq'`, `'coding'`, `'both'`)
* `duration_minutes` (INTEGER, Not Null)
* `cutoff_percentage` (INTEGER, Default: `50`)
* `allowed_attempts` (INTEGER, Default: `1`)
* `schedule_date` (TIMESTAMP, Not Null)
* `college_id` (UUID, FK $\rightarrow$ `colleges.id`)
* `department_id` (UUID, FK $\rightarrow$ `departments.id`)
* `department_ids` (UUID[]) — *Multiple target departments*
* `batch_id` (UUID, FK $\rightarrow$ `batches.id`)
* `year` (VARCHAR) — *Academic year constraint (e.g. '1st Year')*
* `window_open_minutes` (INTEGER, Default: `10`)
* `is_published` (BOOLEAN, Default: `false`)
* `trainer_id` (UUID, FK $\rightarrow$ `trainers.id`)
* `coding_score_rounding` (VARCHAR, Default: `'round'`) — *Score rounding behavior: `'round'`, `'floor'`, `'ceil'`, `'none'*
* `enable_face_detection` (BOOLEAN, Default: `true`)
* `created_at` (TIMESTAMP)

#### 7. `mcq_questions`
Multiple-choice questions belonging to an exam.
* `id` (UUID, PK)
* `exam_id` (UUID, FK $\rightarrow$ `exams.id`, Cascade On Delete)
* `question` (TEXT, Not Null)
* `option_a` (VARCHAR, Not Null)
* `option_b` (VARCHAR, Not Null)
* `option_c` (VARCHAR, Not Null)
* `option_d` (VARCHAR, Not Null)
* `correct_answer` (VARCHAR, Not Null) — *Option keys: `'A'`, `'B'`, `'C'`, or `'D'*
* `marks` (INTEGER, Default: `1`)
* `difficulty` (VARCHAR, Default: `'medium'`)
* `created_at` (TIMESTAMP)

#### 8. `coding_questions`
Coding questions belonging to an exam.
* `id` (UUID, PK)
* `exam_id` (UUID, FK $\rightarrow$ `exams.id`, Cascade On Delete)
* `title` (VARCHAR, Not Null)
* `description` (TEXT, Not Null)
* `difficulty` (VARCHAR, Default: `'medium'`)
* `marks` (INTEGER, Default: `10`)
* `language` (VARCHAR, Default: `'Python'`)
* `time_limit` (INTEGER, Default: `2000`) — *Runtime time limit in ms*
* `memory_limit` (INTEGER, Default: `512000`) — *Memory limit in KB*
* `starter_code` (TEXT)
* `created_at` (TIMESTAMP)

#### 9. `coding_test_cases`
Test suites defining parameters for validation.
* `id` (UUID, PK)
* `question_id` (UUID, FK $\rightarrow$ `coding_questions.id`, Cascade On Delete)
* `input` (TEXT, Not Null)
* `expected_output` (TEXT, Not Null)
* `is_hidden` (BOOLEAN, Default: `false`)
* `created_at` (TIMESTAMP)

#### 10. `exam_attempts`
Records of candidates taking an exam.
* `id` (UUID, PK)
* `exam_id` (UUID, FK $\rightarrow$ `exams.id`, Cascade On Delete)
* `student_id` (UUID, FK $\rightarrow$ `users.id`, Cascade On Delete)
* `attempt_number` (INTEGER, Not Null)
* `score` (INTEGER, Default: `0`)
* `percentage` (NUMERIC(5,2), Default: `0.00`)
* `passed` (BOOLEAN, Default: `false`)
* `mcq_score` (INTEGER, Default: `0`)
* `coding_score` (INTEGER, Default: `0`)
* `time_taken_seconds` (INTEGER, Default: `0`)
* `feedback` (TEXT)
* `status` (attempt_status_enum: `'ongoing'`, `'completed'`, `'terminated'`, Default: `'ongoing'`)
* `created_at` (TIMESTAMP)

#### 11. `mcq_responses`
Choices logged for MCQs during a test attempt.
* `id` (UUID, PK)
* `attempt_id` (UUID, FK $\rightarrow$ `exam_attempts.id`, Cascade On Delete)
* `question_id` (UUID, FK $\rightarrow$ `mcq_questions.id`, Cascade On Delete)
* `selected_option` (VARCHAR, Not Null)
* `is_correct` (BOOLEAN, Not Null)
* `marks_obtained` (INTEGER, Not Null)
* `created_at` (TIMESTAMP)
* *Constraint*: Unique index on `(attempt_id, question_id)`

#### 12. `coding_responses`
Submissions logged for coding questions.
* `id` (UUID, PK)
* `attempt_id` (UUID, FK $\rightarrow$ `exam_attempts.id`, Cascade On Delete)
* `question_id` (UUID, FK $\rightarrow$ `coding_questions.id`, Cascade On Delete)
* `code` (TEXT)
* `language` (VARCHAR)
* `status` (VARCHAR) — *Judge0 state (e.g. `'Accepted'`, `'Compilation Error'`)*
* `test_cases_passed` (INTEGER)
* `total_test_cases` (INTEGER)
* `execution_time_ms` (INTEGER)
* `memory_used_kb` (INTEGER)
* `marks_obtained` (INTEGER)
* `visible_test_cases_passed` (INTEGER, Default: `0`)
* `visible_test_cases_total` (INTEGER, Default: `0`)
* `hidden_test_cases_passed` (INTEGER, Default: `0`)
* `hidden_test_cases_total` (INTEGER, Default: `0`)
* `created_at` (TIMESTAMP)
* *Constraint*: Unique index on `(attempt_id, question_id)`

#### 13. `proctoring_logs`
Infractions committed during active attempts.
* `id` (UUID, PK)
* `attempt_id` (UUID, FK $\rightarrow$ `exam_attempts.id`, Cascade On Delete)
* `event_type` (VARCHAR) — *e.g. `'TAB_SWITCH'`, `'MOBILE_PHONE_DETECTED'*
* `details` (TEXT)
* `severity` (severity_level_enum: `'warning'`, `'critical'`)
* `screenshot` (TEXT) — *Optional Base64 encoded image frame snapshot*
* `created_at` (TIMESTAMP)

#### 14. `settings`
Global system variables.
* `key` (VARCHAR, PK)
* `value` (TEXT)
* `updated_at` (TIMESTAMP)

#### 15. `audit_logs`
Immutable audit logs of security and system events.
* `id` (UUID, PK)
* `user_id` (UUID, FK $\rightarrow$ `users.id`, Set Null On Delete)
* `action` (VARCHAR, Not Null)
* `details` (TEXT)
* `ip_address` (VARCHAR)
* `user_agent` (VARCHAR)
* `created_at` (TIMESTAMP)

---

## 🔄 4. Core Workflows & Life-Cycles

### A. Authentication & Verification
1. **Student Registration**: When a student signs up, the Auth Service compiles a random 6-digit OTP code, stores it in `otp_secret`, and sends a welcome mail via the Notification Queue.
2. **OTP Bypass**: For local/offline testing, a global bypass OTP code `333333` is hardcoded.
3. **Session Cache Fallback**: When Redis is online, it is queried for auth session and rate-limit states. If Redis is offline, services automatically transition to a local in-memory JavaScript store (`memoryCache`) with `setTimeout` expirations.

### B. Pre-Exam Verification Handshake
1. The student clicks "Start Exam".
2. The browser requests webcam permissions and Fullscreen mode.
3. The client captures a webcam snapshot, encoding it as a Base64 string.
4. The client issues a `POST /api/proctor/verify-face` request to the Proctoring Service.
5. The Proctoring Service routes this payload to the Python `ai-service` endpoint `/api/ai/proctor/frame`.
6. **InsightFace** matches the webcam frame against the reference image from `users.profile_photo_url`.
7. If the identity matches (similarity score above threshold) and exactly one face is detected without violations, verification is approved.

### C. Live Proctoring Rules Engine
During an exam, the student's browser captures low-resolution webcam frames every few seconds and sends them via WebSocket (`proctor-frame` event).

```mermaid
sequenceDiagram
    autonumber
    actor Student
    participant UI as Frontend Client
    participant PS as Proctoring Service
    participant AI as AI Service Hub

    UI->>PS: "Socket.IO connection [join-exam]"
    loop Every 2 Seconds
        UI->>PS: "Emit [proctor-frame] (base64 image)"
        PS->>AI: "POST /api/ai/proctor/frame (image + attemptId)"
        Note over AI: Runs YOLOv8 ONNX + Haar Cascades
        AI-->>PS: "Return detections, confidence, and tracking status"
        Note over PS: Processes Rules Engine Escalations
        alt Infraction Triggered
            PS->>UI: "Emit [proctor-warning] (alert overlay)"
        else Limit Exceeded (Critical)
            PS->>UI: "Emit [exam-terminated] (force close)"
        end
    end
```

#### Proctoring Violation Rules Matrix

* **`TAB_SWITCH`** (visibility loss):
  * *Limit*: 3 switches.
  * *Action*: Warnings displayed on occurrences 1 & 2; Cumulative 3rd occurrence immediately terminates the exam.
* **`FULLSCREEN_EXIT`**:
  * *Limit*: 3 exits.
  * *Action*: Warning overlays displayed on occurrences 1 & 2; 3rd occurrence terminates the exam.
* **`CAMERA_DISABLED`**:
  * *Limit*: Immediate.
  * *Action*: Exam is immediately submitted with the current progress score and marked completed.
* **`NO_FACE_DETECTED`**:
  * *Limit*: 10 seconds continuous absence.
  * *Action*: 
    * 2 seconds: Screen message prompts return.
    * 5 seconds: Infraction logged in PostgreSQL.
    * 10 seconds: Exam is auto-submitted with the current progress score and marked completed.
* **`MULTIPLE_FACES_DETECTED`**:
  * *Limit*: 5 consecutive frames.
  * *Action*: Warns student on initial frames; 5th consecutive frame terminates the exam.
* **`MOBILE_PHONE_DETECTED`** (YOLO class `cell phone`):
  * *Limit*: 5 consecutive frames with confidence $\ge 0.80$.
  * *Action*: Displays warnings on initial frames; 5th consecutive frame terminates the exam.
* **`BOOK_DETECTED`** (YOLO class `book`):
  * *Limit*: 8 consecutive frames with confidence $> 0.40$.
  * *Action*: Warns on frame 2; 8th consecutive frame terminates the exam.

---

### D. Asynchronous Email Queueing (BullMQ)
For asynchronous and high-throughput email deliveries, the Auth Service and Admin Service publish tasks to a shared Redis queue (`notification_queue`). The **Notification Service** acts as a worker, consuming messages and delivering them.

* **Job Names**:
  * `STUDENT_REGISTRATION`: Welcome message containing registration OTP.
  * `OTP_VERIFICATION`: Message confirming successful email verification.
  * `PASSWORD_RESET`: Message containing password reset OTP.
  * `CREDENTIAL_EMAIL`: Message containing generated passwords for CSV-imported students.
  * `EXAM_PUBLISHED`: Multi-recipient alert dispatched in bulk to all eligible students when an admin publishes an exam.
  * `RESULT_PUBLISHED`: Score report including final score breakdown and Ollama-generated motivational feedback.

---

### E. Code Sandbox Integration (Judge0)
When a student runs or submits code, the Exam Service interacts with the Judge0 compiler API.

1. **Submission**: Code is sent to `POST /submissions?base64_encoded=true&wait=true`.
2. **Language Mapping**:
   * `Python` $\rightarrow$ Language ID `71`
   * `Java` $\rightarrow$ Language ID `62`
   * `C++` $\rightarrow$ Language ID `54`
   * `JavaScript` $\rightarrow$ Language ID `63`
3. **Execution**: The compiler runs the code in an isolated container. If Judge0 is offline, the service falls back to a simulated test runner.
4. **Grading**: Results are compared to test cases. The final coding score is calculated using the configured rounding rules (`round`, `floor`, `ceil`, or `none`).

---

## 🧠 5. AI Service Hub

The Python **`ai-service`** orchestrates ML inferences.

### Image Pre-Processing & Face Detection
* **Aspect-Ratio Preservation (Letterboxing)**: Raw frames are resized to fit a square `640x640` gray canvas (`114` pad fill) to preserve aspect ratios before passing them to YOLO.
* **Face Detection Pipeline**:
  * **InsightFace Buffalo_S**: Primary detector. Runs on the GPU if CUDA is available.
  * **Haar Cascade Classifiers**: Fallback detector. Frontal face cascade checks are run first, followed by profile face cascade checks if no faces are found.
  * **YOLO Person Fallback**: If both face detectors report zero faces but YOLOv8 detects a person, the system overrides the face count to `1` to avoid false negatives.
  * **Face Detection Toggle**: If `enable_face_detection` is set to `false` for an exam, the proctoring service bypasses all face absence checks and overrides tracking statuses.

### Ollama LLM Integrations

#### 1. AI Motivational Feedback
* **Endpoint**: `POST /api/ai/motivational-feedback`
* **Prompt Template**:
  ```text
  You are Clahan Academy's AI mentor. Write a concise, 1-sentence, motivational, professional exam review feedback. The student scored {percentage}% in the exam '{examName}' ({examType} test). They scored {mcqCorrect} correct out of {mcqTotal} MCQs. They passed {codingPassedCases} out of {codingTotalCases} coding test cases. Provide brief constructive encouragement and custom advice based on these numbers. Keep it under 25 words. Do not prefix with quotes or introductory phrases.
  ```
* **Fallback**: If Ollama times out, the service falls back to rule-based feedback templates (e.g. $> 80\%$ score $\rightarrow$ "Excellent work!").

#### 2. Coding Question Generator
* **Endpoint**: `POST /api/ai/generate-question`
* **Prompt Template**:
  ```text
  Generate a single programming problem about '{topic}' for a coding test.
  Difficulty: {difficulty}
  Primary Language: {language}
  Provide the output strictly in JSON format with the following keys:
  - title: A short descriptive title
  - description: Detailed problem statement, including input/output format, constraints, and 2 sample cases
  - starter_code: A boilerplate function definition appropriate for {language}
  - test_cases: A list of 4 test cases, each containing:
    - input: The raw stdin input (with newlines if multiple inputs)
    - expected_output: The expected stdout output
    - is_hidden: Boolean (2 should be false, 2 should be true)
  Do not include any explanation outside the JSON. Return valid JSON only.
  ```

---

## ⚡ 6. Detailed API Reference

### Auth Service (`auth-service` - Port 4001)

#### `POST /api/auth/register`
Creates a student account.
* **Request Payload**:
  ```json
  {
    "email": "student@college.edu",
    "password": "SecurePassword123!",
    "fullName": "John Doe",
    "phone": "9999999999",
    "rollNumber": "CS2026001",
    "collegeId": "uuid-here",
    "departmentId": "uuid-here",
    "year": "4th Year",
    "githubProfile": "https://github.com/johndoe",
    "linkedinProfile": "https://linkedin.com/in/johndoe",
    "profilePhotoUrl": "https://storage.cdn.com/johndoe.jpg",
    "batchId": "uuid-here",
    "trainerId": "uuid-here"
  }
  ```
* **Response (201)**: `{ "message": "OTP verification email dispatched. Please verify." }`

#### `POST /api/auth/login`
Validates credentials and returns JWT session tokens.
* **Request Payload**: `{ "email": "student@college.edu", "password": "SecurePassword123!", "role": "student" }`
* **Response (200)**:
  ```json
  {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi...",
    "user": { "id": "uuid", "email": "student@college.edu", "role": "student", "fullName": "John Doe" }
  }
  ```

#### `POST /api/auth/verify-otp`
Verifies registration OTP and activates the user.
* **Request Payload**: `{ "email": "student@college.edu", "otp": "123456" }`
* **Response (200)**: `{ "message": "Email verified successfully. Account activated." }`

---

### Admin Service (`admin-service` - Port 4002)

#### `POST /api/admin/students/import`
Processes bulk imports of candidates using a CSV string.
* **Headers**: `Authorization: Bearer <AdminAccessToken>`
* **Request Payload**: `{ "csvContent": "Email,Full Name,Roll Number,Phone,Year\ncandidate1@col.edu,Jane Doe,CS002,9991234567,3rd Year" }`
* **Response (200)**: `{ "message": "Import finished", "summary": { "inserted": 1, "failed": 0 } }`

#### `GET /api/admin/metrics`
Aggregates summary statistics for the admin dashboard.
* **Headers**: `Authorization: Bearer <AdminAccessToken>`
* **Response (200)**:
  ```json
  {
    "totalStudents": 150,
    "totalExams": 12,
    "liveExams": 2,
    "completedExams": 10,
    "averageScore": 76.5,
    "passPercentage": 82.4,
    "failPercentage": 17.6
  }
  ```

---

### Student Service (`student-service` - Port 4003)

#### `GET /api/student/dashboard/summary`
Fetches upcoming, active, and completed exams for the logged-in student.
* **Headers**: `Authorization: Bearer <StudentAccessToken>`
* **Response (200)**:
  ```json
  {
    "upcomingExams": [],
    "activeExams": [
      { "id": "exam-uuid", "name": "Algorithms Test", "duration_minutes": 60, "attempts_made": 0 }
    ],
    "completedExams": [
      { "id": "attempt-uuid", "exam_name": "Database Basics", "score": 85, "percentage": 85.00, "passed": true }
    ]
  }
  ```

---

### Exam Service (`exam-service` - Port 4004)

#### `POST /api/exams/student/attempts/:attemptId/submit-code`
Runs code against all test cases (including hidden ones) and logs the score.
* **Headers**: `Authorization: Bearer <StudentAccessToken>`
* **Request Payload**: `{ "code": "def solve():\n    print(input())", "language": "Python", "questionId": "q-uuid" }`
* **Response (200)**:
  ```json
  {
    "success": true,
    "status": "Accepted",
    "passedCount": 4,
    "totalCount": 4,
    "marksObtained": 10,
    "results": [
      { "id": "tc-1", "passed": true, "status": "Accepted", "timeMs": 42 }
    ]
  }
  ```

#### `POST /api/exams/student/attempts/:attemptId/submit`
Submits the exam, evaluates any drafts, generates AI feedback, and records the final grade.
* **Headers**: `Authorization: Bearer <StudentAccessToken>`
* **Request Payload**: `{ "timeTakenSeconds": 1800 }`
* **Response (200)**:
  ```json
  {
    "message": "Exam submitted and evaluated successfully",
    "score": 45,
    "maxScore": 50,
    "percentage": 90,
    "passed": true,
    "feedback": "Excellent work! Strong coding performance. Focus more on aptitude accuracy."
  }
  ```

---

## ⚙️ 7. Environment Configuration Matrix

Ensure the following environment variables are configured in your `.env` files or system containers:

| Variable Name | Default / Example Value | Used By | Purpose |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql://postgres:postgres@postgres:5432/clahan_academy?sslmode=disable` | All Backend Services | PostgreSQL database connection string |
| `REDIS_URL` | `redis://redis:6379` | Auth, Admin, Exam, Proctoring, Notifications | Redis cache and task broker connection |
| `JWT_ACCESS_SECRET`| `super_secret_access_token_key` | Auth, Admin, Student, Exam, Proctoring | Secret key for signing and validating session tokens |
| `AI_SERVICE_URL` | `http://ai-service:8000` | Exam, Proctoring | Base endpoint for the Python AI Service |
| `JUDGE0_URL` | `http://judge0-api:2358` | Exam | Base endpoint for the Judge0 compilation sandbox |
| `OLLAMA_URL` | `http://ollama-service:11434` | AI Service | Base endpoint for local LLM requests |
| `SMTP_HOST` | `smtp.gmail.com` | Notification Service | Outgoing SMTP host for email dispatches |
| `SMTP_PORT` | `587` | Notification Service | Outgoing SMTP port (587 for TLS, 465 for SSL) |
| `SMTP_USER` | `aiexamplatform123@gmail.com` | Notification Service | SMTP username |
| `SMTP_PASS` | `zmso iaml jdkh wpxn` | Notification Service | SMTP app password |

---

## 🚀 8. Setup & Deployment Guide

### Local Development Setup
To start all services concurrently for development:

1. **Install Node.js & Python dependencies**:
   ```bash
   # In each backend directory
   npm install

   # In the frontend directory
   npm install

   # In the AI directory
   pip install -r requirements.txt
   ```
2. **Start the local infrastructure**:
   Ensure PostgreSQL, Redis, Ollama, and Judge0 are running on their default ports.
3. **Start the services**:
   ```bash
   # Start the service in each folder
   npm run dev
   ```

### Production Deployment (Docker Compose)
Deploy the full application stack using the following command:
```bash
docker-compose up --build -d
```
When the containers start, the system automatically initializes the database schema. The Auth Service seeds the default administrator credentials:
* **Admin Login Email**: `admin@clahan.com`
* **Admin Temporary Password**: `Admin@123`
