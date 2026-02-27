-- Migration 009: Add SuperAdmin to the user_role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'SuperAdmin';
