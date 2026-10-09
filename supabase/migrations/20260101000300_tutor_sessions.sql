-- Tutor sessions, AI usage logging and the single gate that decides who may open an explanation.
-- Sessions hold NO chat content (data minimisation): only counters and state.

create function private.tutor_seconds() returns int
language sql immutable as $$ select 120 $$; -- keep equal to TUTOR_SECONDS in shared/rules.js

create table public.tutor_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  question_id    uuid not null references public.questions (id) on delete cascade,
  test_id        uuid not null references public.tests (id) on delete cascade,
  access         text not null check (access in ('paid', 'free', 'staff')),
  status         text not null default 'active' check (status in ('active', 'finished')),
  finish_reason  text check (finish_reason in ('done', 'timeout', 'skip')),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  paused_ms      int not null default 0,   -- time spent waiting on the model; the 2:00 timer does not run during it
  turns          int not null default 0,
  hints          int not null default 0,
  step           smallint not null default 1,
  script_idx     smallint not null default 0,
  check ((status = 'finished') = (finish_reason is not null))
);
create unique index tutor_sessions_one_active on public.tutor_sessions (user_id, question_id) where status = 'active';
create index tutor_sessions_lookup on public.tutor_sessions (user_id, question_id, started_at desc);

-- Token-use log: counts and timings only, never prompts or replies.
create table public.ai_usage (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  question_id    uuid references public.questions (id) on delete set null,
  kind           text not null check (kind in ('turn', 'wrapup')),
  source         text not null check (source in ('claude', 'scripted', 'limited', 'error')),
  model          text,
  input_tokens   int not null default 0,
  output_tokens  int not null default 0,
  latency_ms     int not null default 0,
  created_at     timestamptz not null default now()
);
create index ai_usage_user_day on public.ai_usage (user_id, created_at desc);

alter table public.tutor_sessions enable row level security;
alter table public.ai_usage enable row level security;
create policy tutor_sessions_select on public.tutor_sessions for select to authenticated
  using (user_id = auth.uid() or private.is_admin());
create policy ai_usage_admin_select on public.ai_usage for select to authenticated
  using (private.is_admin());
revoke all on public.tutor_sessions, public.ai_usage from anon, authenticated;
grant select on public.tutor_sessions, public.ai_usage to authenticated;

-- The one entitlement gate. Called by the API (service connection) with the verified user id.
--   staff           -> access 'staff' (previewing, never consumes a free slot)
--   test unlocked   -> access 'paid'
--   already free    -> access 'free' (re-opening a question you already spent a slot on)
--   slot available  -> consumes a slot, access 'free'
--   otherwise       -> raises 'paywall'
-- It also requires a submitted attempt that contained the question, then creates or resumes the tutor session.
create function private.open_explanation(p_user uuid, p_attempt uuid, p_question uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_test uuid;
  v_role public.user_role;
  v_access text;
  v_used int;
  v_sess public.tutor_sessions%rowtype;
begin
  select test_id into v_test from public.attempts
   where id = p_attempt and user_id = p_user and submitted_at is not null;
  if v_test is null then raise exception 'attempt_not_found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.attempt_answers where attempt_id = p_attempt and question_id = p_question) then
    raise exception 'question_not_in_attempt' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtext('explain:' || p_user::text));

  select role into v_role from public.profiles where id = p_user;
  if v_role in ('teacher', 'admin') then
    v_access := 'staff';
  elsif exists (select 1 from public.unlocks u where u.user_id = p_user and u.test_id = v_test and u.revoked_at is null) then
    v_access := 'paid';
  elsif exists (select 1 from public.free_explanation_uses f where f.user_id = p_user and f.question_id = p_question) then
    v_access := 'free';
  elsif (select count(*) from public.free_explanation_uses f where f.user_id = p_user) < private.free_explanation_limit() then
    insert into public.free_explanation_uses (user_id, question_id) values (p_user, p_question);
    v_access := 'free';
  else
    raise exception 'paywall' using errcode = 'P0001', detail = v_test::text;
  end if;

  -- Resume the active session, else reuse a finished one (the student already earned the explanation), else start.
  select * into v_sess from public.tutor_sessions
   where user_id = p_user and question_id = p_question
   order by (status = 'active') desc, started_at desc limit 1;
  if not found then
    insert into public.tutor_sessions (user_id, question_id, test_id, access)
    values (p_user, p_question, v_test, v_access) returning * into v_sess;
  elsif v_sess.status = 'active' and v_sess.access <> v_access then
    update public.tutor_sessions set access = v_access where id = v_sess.id returning * into v_sess;
  end if;

  select count(*) into v_used from public.free_explanation_uses where user_id = p_user;
  return jsonb_build_object(
    'session_id', v_sess.id, 'test_id', v_test, 'access', v_access, 'status', v_sess.status, 'step', v_sess.step,
    'seconds_left', greatest(0, round(private.tutor_seconds() - extract(epoch from (now() - v_sess.started_at)) + v_sess.paused_ms / 1000.0))::int,
    'free_left', greatest(0, private.free_explanation_limit() - v_used));
end $$;

-- Does this user have paid access to the test that contains the question (any test they attempted)?
create function private.has_paid_access(p_user uuid, p_question uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.attempts a
    join public.attempt_answers aa on aa.attempt_id = a.id
    join public.unlocks u on u.test_id = a.test_id and u.user_id = a.user_id and u.revoked_at is null
    where a.user_id = p_user and a.submitted_at is not null and aa.question_id = p_question
  )
$$;

-- Service-role only: nothing here is callable by clients.
revoke all on function private.open_explanation(uuid, uuid, uuid), private.has_paid_access(uuid, uuid) from public, anon, authenticated;
