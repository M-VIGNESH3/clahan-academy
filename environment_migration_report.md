# Environment Variable Migration Report

This report documents the environment variable migration and configuration refactoring completed across all microservices in the Clahan Academy codebase.

## 1. Discovered Environment Variables

The following configuration variables were identified across the microservices during Phase 1:

| Service Name | Environment Variable Key | Default / Fallback Value | Purpose |
| :--- | :--- | :--- | :--- |
| **auth-service** | `PORT` | `4001` | Service API port |
| | `DATABASE_URL` | `postgresql://postgres:postgres@postgres:5432/clahan_academy?sslmode=disable` | Database connection string |
| | `REDIS_URL` | `redis://redis:6379` | Redis connection URL |
| | `JWT_ACCESS_SECRET` | `super_secret_access_token_key` | JWT access token key |
| | `JWT_REFRESH_SECRET` | `super_secret_refresh_token_key` | JWT refresh token key |
| | `RATE_LIMIT_MAX` | `10000` | Rate limiter threshold |
| **admin-service** | `PORT` | `4002` | Service API port |
| | `DATABASE_URL` | `postgresql://postgres:postgres@postgres:5432/clahan_academy?sslmode=disable` | Database connection string |
| | `REDIS_URL` | `redis://redis:6379` | Redis connection URL |
| | `JWT_ACCESS_SECRET` | `super_secret_access_token_key` | JWT access token key |
| | `RATE_LIMIT_MAX` | `10000` | Rate limiter threshold |
| **student-service** | `PORT` | `4003` | Service API port |
| | `DATABASE_URL` | `postgresql://postgres:postgres@postgres:5432/clahan_academy?sslmode=disable` | Database connection string |
| | `JWT_ACCESS_SECRET` | `super_secret_access_token_key` | JWT access token key |
| | `RATE_LIMIT_MAX` | `10000` | Rate limiter threshold |
| **exam-service** | `PORT` | `4004` | Service API port |
| | `DATABASE_URL` | `postgresql://postgres:postgres@postgres:5432/clahan_academy?sslmode=disable` | Database connection string |
| | `REDIS_URL` | `redis://redis:6379` | Redis connection URL |
| | `JWT_ACCESS_SECRET` | `super_secret_access_token_key` | JWT access token key |
| | `AI_SERVICE_URL` | `http://ai-service:8000` | AI service endpoint |
| | `JUDGE0_URL` | `http://judge0-api:2358` | Judge0 compiler endpoint |
| | `RATE_LIMIT_MAX` | `10000` | Rate limiter threshold |
| **proctoring-service** | `PORT` | `4005` | Service API/Socket port |
| | `DATABASE_URL` | `postgresql://postgres:postgres@postgres:5432/clahan_academy?sslmode=disable` | Database connection string |
| | `JWT_ACCESS_SECRET` | `super_secret_access_token_key` | JWT access token key |
| | `AI_SERVICE_URL` | `http://ai-service:8000` | AI service endpoint |
| | `REDIS_URL` | `redis://redis:6379` | Redis connection URL |
| | `TAB_SWITCH_LIMIT` | `3` | Maximum allowed tab switches |
| | `MOBILE_PHONE_LIMIT` | `5` | Consec. frames for mobile detection |
| | `BOOK_LIMIT` | `8` | Consec. frames for book detection |
| | `MULTIPLE_FACES_LIMIT` | `5` | Consec. frames for multiple faces |
| | `NO_FACE_TIMEOUT_MS` | `10000` | Duration for face loss timeout |
| | `FULLSCREEN_EXIT_LIMIT` | `3` | Maximum allowed fullscreen exits |
| **notification-service** | `PORT` | `4006` | Service API port |
| | `REDIS_URL` | `redis://redis:6379` | Redis connection URL |
| | `SMTP_HOST` | `smtp.gmail.com` | SMTP Server Host |
| | `SMTP_PORT` | `465` / `587` | SMTP Server Port |
| | `SMTP_USER` | `aiexamplatform123@gmail.com` | SMTP Auth Username |
| | `SMTP_PASS` | `zmso iaml jdkh wpxn` | SMTP Auth Password |
| | `SMTP_FROM` | `aiexamplatform123@gmail.com` | Default sender email |
| | `FRONTEND_URL` | `https://clahanacademy.com` | Frontend domain link |
| | `SENDGRID_API_KEY` | *(Empty)* | Twilio Sendgrid API Key |
| | `SENDGRID_FROM` | `noreply@clahanacademy.com` | Twilio Sendgrid verified sender |
| **ai-service** | `PORT` | `8000` | FastAPI uvicorn port |
| | `OLLAMA_URL` | `http://ollama-service:11434` | Ollama model service endpoint |

---

## 2. Hardcoded Values Removed & Configured

* **Proctoring Rules / Limits**:
  Discovered hardcoded counts for proctoring violations in `proctoring-service/src/index.ts` were extracted and mapped to the environment:
  * Tab switch count: `3` -> `TAB_SWITCH_LIMIT`
  * Mobile phone consecutive detections: `5` -> `MOBILE_PHONE_LIMIT`
  * Book consecutive detections: `8` -> `BOOK_LIMIT`
  * Multiple faces consecutive detections: `5` -> `MULTIPLE_FACES_LIMIT`
  * No face detection timeout: `10000ms` -> `NO_FACE_TIMEOUT_MS`
  * Fullscreen exit count: `3` -> `FULLSCREEN_EXIT_LIMIT`
* **Python Environment Loading**:
  * Added `python-dotenv` to `ai-service/requirements.txt`.
  * Configured `ai-service/main.py` to run `load_dotenv()` at startup.

---

## 3. Files Modified

1. **`docker-compose.yml`**:
   * Removed duplicated `environment:` variable declarations for all custom microservices.
   * Configured `env_file:` directives pointing to each service's individual `.env` file.
2. **`auth-service/src/index.ts`**: Loaded `dotenv` config at entry point.
3. **`admin-service/src/index.ts`**: Loaded `dotenv` config at entry point.
4. **`student-service/src/index.ts`**: Loaded `dotenv` config at entry point.
5. **`exam-service/src/index.ts`**: Loaded `dotenv` config at entry point.
6. **`proctoring-service/src/index.ts`**: Loaded `dotenv` config at entry point; mapped hardcoded limits to dynamic constants.
7. **`ai-service/main.py`**: Configured to load `.env` variables using `python-dotenv`.
8. **`ai-service/requirements.txt`**: Added `python-dotenv` dependency.

---

## 4. Service-Specific Env Files Created

The following per-service configuration files were generated with no raw secrets/passwords exposed in their `.env.example` equivalents:

* **`auth-service/.env`** & **`auth-service/.env.example`**
* **`admin-service/.env`** & **`admin-service/.env.example`**
* **`student-service/.env`** & **`student-service/.env.example`**
* **`exam-service/.env`** & **`exam-service/.env.example`**
* **`proctoring-service/.env`** & **`proctoring-service/.env.example`**
* **`notification-service/.env`** & **`notification-service/.env.example`**
* **`ai-service/.env`** & **`ai-service/.env.example`**
* **`frontend-service/.env`** & **`frontend-service/.env.example`**
