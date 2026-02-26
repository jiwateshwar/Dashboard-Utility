-- Migration 005: Remove rag_status from tasks; seed fixed categories

-- Drop rag_status column from tasks
ALTER TABLE tasks DROP COLUMN IF EXISTS rag_status;

-- Drop the rag_status enum type (only used by tasks)
DROP TYPE IF EXISTS rag_status;

-- Seed "Highlights" category for all existing dashboards that don't have it
INSERT INTO categories (id, dashboard_id, name, is_active)
SELECT gen_random_uuid(), d.id, 'Highlights', true
FROM dashboards d
WHERE NOT EXISTS (
  SELECT 1 FROM categories c WHERE c.dashboard_id = d.id AND c.name = 'Highlights'
);

-- Seed "Lowlights" category for all existing dashboards that don't have it
INSERT INTO categories (id, dashboard_id, name, is_active)
SELECT gen_random_uuid(), d.id, 'Lowlights', true
FROM dashboards d
WHERE NOT EXISTS (
  SELECT 1 FROM categories c WHERE c.dashboard_id = d.id AND c.name = 'Lowlights'
);
