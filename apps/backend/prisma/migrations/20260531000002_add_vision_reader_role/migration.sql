-- Create read-only role for Vision Wealth OS
-- Password must be set via secret in production
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'vision_reader') THEN
    CREATE ROLE vision_reader NOINHERIT LOGIN PASSWORD 'change-me-in-secret';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE CURRENT_DATABASE TO vision_reader;
GRANT USAGE ON SCHEMA public TO vision_reader;

-- SELECT on all existing tables
GRANT SELECT ON ALL TABLES IN SCHEMA public TO vision_reader;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO vision_reader;

-- SELECT on future tables too
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO vision_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO vision_reader;

-- REVOKE direct access to reconciliation_log (accessed via SECURITY DEFINER function)
REVOKE ALL ON TABLE "reconciliation_log" FROM vision_reader;
REVOKE ALL ON TABLE "reconciliation_log" FROM PUBLIC;
