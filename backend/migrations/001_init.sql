CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('Open', 'In Progress', 'Closed Pending Approval', 'Closed Accepted');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE rag_status AS ENUM ('Red', 'Amber', 'Green');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE risk_impact AS ENUM ('Low', 'Medium', 'High', 'Critical');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE risk_probability AS ENUM ('Low', 'Medium', 'High');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE risk_status AS ENUM ('Open', 'Mitigated', 'Closed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE decision_status AS ENUM ('Pending', 'Approved', 'Rejected', 'Deferred');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('Admin', 'User');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  manager_id uuid REFERENCES users(id),
  level int NOT NULL CHECK (level BETWEEN 1 AND 5),
  is_active boolean NOT NULL DEFAULT true,
  role user_role NOT NULL DEFAULT 'User',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS groups (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dashboards (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  description text,
  primary_owner_id uuid NOT NULL REFERENCES users(id),
  secondary_owner_id uuid REFERENCES users(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dashboard_groups (
  dashboard_id uuid NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY (dashboard_id, group_id)
);

CREATE TABLE IF NOT EXISTS dashboard_access (
  dashboard_id uuid NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  can_view boolean NOT NULL DEFAULT true,
  can_edit boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dashboard_id, user_id)
);

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY,
  account_name text NOT NULL UNIQUE,
  account_type text,
  region text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY,
  dashboard_id uuid NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dashboard_id, name)
);

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY,
  dashboard_id uuid NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id),
  account_id uuid NOT NULL REFERENCES accounts(id),
  item_details text NOT NULL,
  owner_id uuid NOT NULL REFERENCES users(id),
  created_by uuid NOT NULL REFERENCES users(id),
  target_date date NOT NULL,
  sla_days int,
  status task_status NOT NULL DEFAULT 'Open',
  rag_status rag_status NOT NULL DEFAULT 'Green',
  publish_flag boolean NOT NULL DEFAULT false,
  aging_days int NOT NULL DEFAULT 0,
  closure_requested_at timestamptz,
  closure_approved_by uuid REFERENCES users(id),
  closure_approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_archived boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS risks (
  id uuid PRIMARY KEY,
  dashboard_id uuid NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id),
  risk_title text NOT NULL,
  risk_description text,
  risk_owner uuid NOT NULL REFERENCES users(id),
  impact_level risk_impact NOT NULL,
  probability risk_probability NOT NULL,
  risk_score int NOT NULL DEFAULT 0,
  mitigation_plan text,
  target_mitigation_date date,
  status risk_status NOT NULL DEFAULT 'Open',
  publish_flag boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  is_archived boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS decisions (
  id uuid PRIMARY KEY,
  dashboard_id uuid NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id),
  decision_title text NOT NULL,
  decision_context text,
  decision_owner uuid NOT NULL REFERENCES users(id),
  decision_deadline date NOT NULL,
  impact_area text,
  status decision_status NOT NULL DEFAULT 'Pending',
  publish_flag boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  decision_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_archived boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS publishing_snapshots (
  id uuid PRIMARY KEY,
  dashboard_id uuid NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  cycle_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  content_json jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS escalations (
  id uuid PRIMARY KEY,
  dashboard_id uuid NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  rule_name text NOT NULL,
  message text NOT NULL,
  notified_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS escalation_rules (
  id uuid PRIMARY KEY,
  dashboard_id uuid NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  rule_name text NOT NULL,
  condition_json jsonb NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  changed_by uuid NOT NULL REFERENCES users(id),
  old_value jsonb,
  new_value jsonb,
  timestamp timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_dashboard ON tasks (dashboard_id);
CREATE INDEX IF NOT EXISTS idx_risks_dashboard ON risks (dashboard_id);
CREATE INDEX IF NOT EXISTS idx_decisions_dashboard ON decisions (dashboard_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log (entity_type, entity_id);
