-- Migration 010: Add employee_id to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id VARCHAR(10);
