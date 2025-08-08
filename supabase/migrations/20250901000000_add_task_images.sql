create table if not exists task_images (
  id text primary key,
  task_id text references tasks(id) on delete cascade,
  thumbhash text not null,
  created_at timestamptz default now()
);
