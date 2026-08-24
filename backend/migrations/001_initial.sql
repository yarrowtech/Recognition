CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  external_id text UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS face_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  embedding bytea NOT NULL,
  model_name text NOT NULL,
  model_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cameras (
  id text PRIMARY KEY,
  name text NOT NULL,
  location text,
  source text NOT NULL DEFAULT 'browser',
  type text NOT NULL DEFAULT 'webcam',
  status text NOT NULL DEFAULT 'enabled',
  configuration jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  camera_id text NOT NULL REFERENCES cameras(id),
  track_id integer NOT NULL,
  label text NOT NULL DEFAULT 'Unknown',
  started_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  ended_at timestamptz,
  duration_seconds integer,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'lost', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS presence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  camera_id text NOT NULL REFERENCES cameras(id),
  track_id integer,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS ai_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id text NOT NULL REFERENCES cameras(id),
  analysis_type text NOT NULL DEFAULT 'manual',
  prompt text NOT NULL,
  response text NOT NULL,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_person_idx ON sessions(person_id);
CREATE INDEX IF NOT EXISTS sessions_camera_started_idx ON sessions(camera_id, started_at DESC);
CREATE INDEX IF NOT EXISTS events_camera_time_idx ON presence_events(camera_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS events_person_time_idx ON presence_events(person_id, occurred_at DESC);

INSERT INTO cameras (id, name, location)
VALUES ('CAM01', 'Primary webcam', 'Local workstation')
ON CONFLICT (id) DO NOTHING;
