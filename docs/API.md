# API surface

All public responses use `{ "data": ... }`; errors use `{ "error": "..." }`. FastAPI exposes interactive AI documentation at `http://localhost:8000/docs`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | API, database, and AI health |
| GET/POST | `/api/people` | List or create identities |
| GET/PATCH/DELETE | `/api/people/:id` | Read, edit, or privacy-delete an identity |
| POST | `/api/people/:id/faces` | Validate and enroll one face image |
| DELETE | `/api/people/:id/faces/:faceId` | Delete a biometric profile |
| GET | `/api/people/:id/sessions` | Person session history |
| GET/POST | `/api/cameras` | List or create cameras |
| PATCH/DELETE | `/api/cameras/:id` | Edit or remove a camera |
| GET | `/api/sessions` | Paginated history; supports `page`, `limit`, `cameraId`, `personId`, `from`, `to` |
| GET | `/api/analytics/overview?days=7` | Persistent session metrics and chart series |
| GET | `/api/live` | Current in-memory tracks |
| POST | `/api/live/disconnect` | Mark a browser camera disconnected |
| POST | `/api/ai/analyze` | On-demand, rate-limited VLM scene analysis |
| GET | `/api/ai/analyses` | Recent stored VLM analyses |

The service-only `/internal/*` routes require `x-service-token`. They are the only API boundary that carries embeddings; browsers never receive these values.

WebSocket connects at `/ws` and emits `person.entered`, `person.updated`, `person.recognized`, `person.left`, `occupancy.updated`, `ai.analysis`, and `system.connected`.
