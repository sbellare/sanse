-- Run only against the intended production PostgreSQL database.
-- These statements are additive and never drop or truncate existing data.
BEGIN;

CREATE TABLE IF NOT EXISTS inquiry_deliveries (
  id uuid PRIMARY KEY,
  status varchar(12) NOT NULL,
  name text,
  email text,
  project text,
  stage text,
  message text,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inquiry_deliveries_status_check
    CHECK (status IN ('pending', 'sending', 'delivered', 'failed')),
  CONSTRAINT inquiry_deliveries_attempts_check
    CHECK (attempts >= 0 AND attempts <= 5)
);

CREATE INDEX IF NOT EXISTS inquiry_deliveries_retry_idx
  ON inquiry_deliveries (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS inquiry_deliveries_lease_idx
  ON inquiry_deliveries (status, lease_until);
CREATE INDEX IF NOT EXISTS inquiry_deliveries_terminal_age_idx
  ON inquiry_deliveries (status, created_at);

CREATE TABLE IF NOT EXISTS inquiry_rate_limits (
  address text PRIMARY KEY,
  submissions timestamptz[] NOT NULL,
  expires_at timestamptz NOT NULL,
  last_request_allowed boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS inquiry_rate_limits_expiry_idx
  ON inquiry_rate_limits (expires_at);

COMMIT;
