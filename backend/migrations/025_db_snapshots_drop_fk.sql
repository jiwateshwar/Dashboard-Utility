-- db_snapshots is deliberately excluded from the snapshot/restore table
-- registry (it's the backup system's own bookkeeping and must survive a
-- restore). But its `created_by -> users(id)` foreign key meant Postgres's
-- `TRUNCATE ... CASCADE` (used during restore) swept db_snapshots into the
-- cascade too — TRUNCATE CASCADE truncates ANY table with a FK into the
-- truncated set, regardless of that FK's ON DELETE behavior, silently
-- wiping the safety-net snapshot the restore had just taken along with all
-- other snapshot history. Drop the FK; `created_by` stays as a plain uuid
-- (still joinable to users.id for display, just without a hard constraint).

ALTER TABLE db_snapshots DROP CONSTRAINT IF EXISTS db_snapshots_created_by_fkey;
