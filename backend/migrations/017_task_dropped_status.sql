-- Migration 017: Add Dropped to the task_status enum (treated as closed+accepted)
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'Dropped';
