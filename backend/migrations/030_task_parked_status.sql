-- Migration 030: Add Parked to the task_status enum.
-- A parked task is still open (not closed) but on hold: it never counts as overdue.
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'Parked';
