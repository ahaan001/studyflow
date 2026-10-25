-- StudyFlow: one row per saved document per user (meta, subjects, tasks, ... and one per note).
create table if not exists public.studyflow_docs (
  user_id    uuid not null references auth.users (id) on delete cascade,
  doc_id     text not null check (char_length(doc_id) between 1 and 64),
  body       jsonb not null default '{}'::jsonb check (octet_length(body::text) < 1000000),
  updated_at timestamptz not null default now(),
  primary key (user_id, doc_id)
);

alter table public.studyflow_docs enable row level security;

create policy "studyflow_docs: read own"   on public.studyflow_docs for select to authenticated using ((select auth.uid()) = user_id);
create policy "studyflow_docs: insert own" on public.studyflow_docs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "studyflow_docs: update own" on public.studyflow_docs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "studyflow_docs: delete own" on public.studyflow_docs for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.studyflow_docs from anon;
grant select, insert, update, delete on public.studyflow_docs to authenticated;

create or replace function public.studyflow_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger studyflow_docs_touch
  before update on public.studyflow_docs
  for each row execute function public.studyflow_touch();
