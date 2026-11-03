CREATE TABLE IF NOT EXISTS feedback_submissions (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('IDEA', 'BUG', 'QUESTION', 'OTHER')),
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  description TEXT NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 3000),
  source_screen TEXT CHECK (source_screen IS NULL OR length(source_screen) <= 120),
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'IN_REVIEW', 'PLANNED', 'COMPLETED', 'DECLINED')),
  submitter_uid TEXT NOT NULL,
  submitter_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feedback_submissions_status_created_idx ON feedback_submissions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_submissions_submitter_idx ON feedback_submissions(submitter_uid, created_at DESC);
