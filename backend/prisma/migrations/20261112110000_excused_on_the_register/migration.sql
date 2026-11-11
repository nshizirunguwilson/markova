-- A fourth mark on the register: an absence the school has accepted.
-- On its own in this migration: Postgres will not let a new enum value be
-- used in the transaction that adds it.
ALTER TYPE "AttendanceStatus" ADD VALUE IF NOT EXISTS 'EXCUSED';
