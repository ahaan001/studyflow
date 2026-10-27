-- Abuse throttle for the studyflow-signup Edge Function. Stores only a salted hash of the caller's IP, pruned after a day.
create table if not exists public.studyflow_signup_log (
  id         bigint generated always as identity primary key,
  ip_hash    text not null,
  created_at timestamptz not null default now()
);
create index if not exists studyflow_signup_log_ip_time on public.studyflow_signup_log (ip_hash, created_at);
alter table public.studyflow_signup_log enable row level security;
revoke all on public.studyflow_signup_log from anon, authenticated;
