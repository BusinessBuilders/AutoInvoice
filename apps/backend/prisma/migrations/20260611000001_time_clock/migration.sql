-- TimeEntry already exists in production (created by the April time-clock
-- session, matching .planning/spec §3.3, including the partial unique index
-- TimeEntry_userId_open_unique enforcing one open entry per user).
-- This migration adds only the GPS stamp columns (2026-06-11 decision:
-- location at punch events, not continuous tracking).
ALTER TABLE "TimeEntry" ADD COLUMN IF NOT EXISTS "clockInLat"  DECIMAL(65,30);
ALTER TABLE "TimeEntry" ADD COLUMN IF NOT EXISTS "clockInLng"  DECIMAL(65,30);
ALTER TABLE "TimeEntry" ADD COLUMN IF NOT EXISTS "clockOutLat" DECIMAL(65,30);
ALTER TABLE "TimeEntry" ADD COLUMN IF NOT EXISTS "clockOutLng" DECIMAL(65,30);
