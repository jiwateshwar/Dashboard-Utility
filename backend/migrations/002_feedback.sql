CREATE TABLE IF NOT EXISTS feedback (
  id          uuid primary key default uuid_generate_v4(),
  type        text not null check (type in ('Bug', 'Idea')),
  title       text not null,
  description text,
  status      text not null default 'Open' check (status in ('Open', 'In Review', 'Done')),
  created_by  uuid not null references users(id),
  created_at  timestamptz not null default now()
);
