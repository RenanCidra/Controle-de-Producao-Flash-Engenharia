-- Add revocable access sessions without modifying existing accounts or operational data.
CREATE TABLE IF NOT EXISTS auth_sessions (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_hash text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  expires_at timestamp NOT NULL,
  revoked_at timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_hash_unique
  ON auth_sessions (session_hash);

CREATE INDEX IF NOT EXISTS auth_sessions_user_expiry_idx
  ON auth_sessions (user_id, expires_at);
