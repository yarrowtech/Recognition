# Sentinel Vision MVP

A local-first people-monitoring MVP that samples webcam frames in the browser, sends them directly to a FastAPI computer-vision service, and stores compact presence events and sessions through an Express API. Raw video is not continuously recorded and biometric embeddings are never returned through public APIs.

## What is implemented

- Multi-face detection and ArcFace-compatible embeddings with InsightFace
- Velocity/IoU face tracking with stable temporary `trackId` values and a configurable occlusion grace period
- Configurable cosine-similarity recognition; low-confidence faces remain Unknown
- Identity creation, image quality validation, enrollment, and privacy deletion
- Timestamp-based entry/exit sessions persisted in PostgreSQL
- Redis occupancy cache with graceful degradation if Redis is unavailable
- WebSocket occupancy, entry, update, recognition, exit, and AI-analysis events
- Browser webcam preview with bounding boxes and known/unknown counters
- Dashboard, live, people, person detail, history, analytics, cameras, and settings routes
- Rate-limited, on-demand Qwen2.5-VL analysis through Ollama, outside the tracking loop
- Docker Compose and focused grace-period/tracker tests

## Architecture

```text
Browser webcam ── sampled JPEG frames ──> FastAPI / InsightFace / tracker
       │                                      │
       │ REST + WebSocket metadata            │ compact observations
       v                                      v
React dashboard <────────────────────── Express API
                                              │
                                        PostgreSQL + Redis

Selected frame ── manual request ──> Express ──> Ollama / Qwen2.5-VL
```

Node never sits in the high-frequency frame path. `trackId` is camera-local and temporary; `personId` is the durable identity. Qwen is used only for high-level scene description.

## Prerequisites

- Node.js 22+
- Python 3.10–3.12 (3.11 recommended; current InsightFace/ONNX wheels may not support Python 3.14)
- PostgreSQL 16+
- Redis 7+
- Ollama 0.7+ for optional visual analysis
- A browser that supports `navigator.mediaDevices.getUserMedia` on `localhost` or HTTPS

InsightFace model packs may carry research/non-commercial licensing restrictions. Confirm model and biometric-processing rights before production use. A production deployment must also satisfy applicable consent, notice, retention, access-control, and biometric/privacy laws.

## Local setup

Start only the data services:

```bash
docker compose up -d postgres redis
```

Set up the API:

```bash
cd backend
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

Set up the AI service in another terminal:

```bash
cd ai-service
cp .env.example .env
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
```

The first InsightFace startup downloads the configured model pack. Start the frontend:

```bash
cd Frontend
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`, create a person, enroll a clear face image, and start the camera on `/live`. The `INTERNAL_SERVICE_TOKEN` value must match in `backend/.env` and `ai-service/.env`.

## Ollama

Ollama runs separately. The verified Ollama library tag is `qwen2.5vl:7b` (without a hyphen between `2.5` and `vl`):

```bash
ollama pull qwen2.5vl:7b
ollama list
```

Set `OLLAMA_BASE_URL` and `OLLAMA_MODEL` in `ai-service/.env`. A missing service or model produces a visible 503 response; it does not interrupt detection or tracking.

## Docker

```bash
cp backend/.env.example .env
docker compose up --build
```

The dashboard is at `http://localhost:8080`. Ollama is expected on the host and is reached through `host.docker.internal`.

GPU passthrough requires a working NVIDIA driver and NVIDIA Container Toolkit; it is not automatic:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
```

Check ONNX Runtime provider selection in the AI service logs. If the CUDA provider cannot initialize, the configured CPU provider is attempted. RTX 5080 support depends on compatible host drivers, CUDA runtime, NVIDIA Container Toolkit, and ONNX Runtime builds.

## Environment variables

| Variable | Service | Default / purpose |
| --- | --- | --- |
| `DATABASE_URL` | API | PostgreSQL connection string |
| `REDIS_URL` | API | Transient occupancy cache |
| `AI_SERVICE_URL` | API | FastAPI base URL |
| `CORS_ORIGIN` | API / AI | Comma-separated allowed web origins |
| `INTERNAL_SERVICE_TOKEN` | API / AI | Shared service credential; replace outside local development |
| `TRACK_LOST_GRACE_SECONDS` | API / AI | Session and tracker occlusion grace, default 7 seconds |
| `FACE_MATCH_THRESHOLD` | AI | Minimum cosine similarity, default 0.45; calibrate for your model/cameras |
| `FACE_DETECTION_THRESHOLD` | AI | Face detector confidence floor |
| `FACE_MODEL_NAME` | AI | InsightFace model pack, default `buffalo_l` |
| `AI_PROCESS_FPS` / `VITE_AI_PROCESS_FPS` | AI / web | Target sampled-frame rate, default 24 |
| `OLLAMA_BASE_URL` | AI | Ollama endpoint |
| `OLLAMA_MODEL` | AI | Default `qwen2.5vl:7b` |
| `QWEN_MIN_INTERVAL_SECONDS` | AI | Minimum time between VLM calls |
| `RETENTION_DAYS` | API | Retention-policy input for deployment cleanup jobs |

Never place database credentials, service tokens, or biometric data in `VITE_*` variables.

## Tests and checks

```bash
cd backend && npm run build && npm test
cd Frontend && npm run lint && npm run build
cd ai-service && .venv/bin/pytest -q
```

API routes and event names are listed in [docs/API.md](docs/API.md). FastAPI/OpenAPI documentation is available at `http://localhost:8000/docs` while the AI service runs.

## Database schema

The migration creates `people`, `face_profiles`, `cameras`, `sessions`, `presence_events`, and `ai_analyses`. Face vectors are stored as private `bytea`; public queries intentionally omit them. Foreign keys delete face profiles with a person and anonymize retained sessions. Indexes cover person history and camera/time queries.

## Known MVP limitations

- One browser webcam is wired into the live page; the schema and pipeline are camera-keyed, but RTSP ingestion is not included.
- Tracking is a lightweight face tracker, not a full body ReID tracker. Long occlusions and adversarial crossings can create a new track; identities are never merged solely from track IDs.
- Enrollment currently accepts uploads rather than guided multi-angle capture.
- Authentication/RBAC, zones, camera add/edit UI, periodic Qwen jobs, data-retention scheduling, CSV generation, and exact peak-concurrency SQL are deferred.
- InsightFace model licensing and recognition thresholds must be validated against the intended population and jurisdiction.
- Frontend route modules are JavaScript because the existing starter was JavaScript; shared generated TypeScript/Pydantic contracts are a follow-up hardening task.

## Recommended next steps

1. Add authentication and an explicit biometric-consent/retention workflow before any real deployment.
2. Calibrate thresholds with representative, consented validation data and add liveness/anti-spoofing.
3. Replace the lightweight tracker with ByteTrack/DeepSORT plus body detection for crowded or long-occlusion scenes.
4. Add RTSP worker processes, camera health heartbeats, and per-camera backpressure.
5. Add integration tests against temporary PostgreSQL/Redis containers and browser camera fixtures.
# Recognition
