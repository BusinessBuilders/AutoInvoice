-- vision_reader must keep SELECT on all tables (Wealth OS contract).
-- The original ALTER DEFAULT PRIVILEGES (20260531000002) only covers objects
-- created by the role that ran that migration; Business OS tables are created
-- by the application role, so grant explicitly and fix defaults going forward.
GRANT SELECT ON TABLE "RevenueEvent" TO vision_reader;
GRANT SELECT ON TABLE "Activity" TO vision_reader;

-- Future tables created by the current (application) role are auto-granted.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO vision_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO vision_reader;
