-- BioPrep core schema.
-- Design rules
--   * Anything a student must not see before finishing the tutor session (correct answer, explanation, whys,
--     video path, Socratic keys/hints) lives in tables that students cannot read: question_secrets, socratic_steps.
--   * Students never write scores, unlocks or free-use rows directly. Scoring and entitlement run in SECURITY DEFINER
--     functions or in the API (service role).
--   * Helpers live in the `private` schema, which PostgREST does not expose.

create schema if not exists private;

create type public.user_role as enum ('student', 'teacher', 'admin');
create type public.question_status as enum ('draft', 'published');

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        public.user_role not null default 'student',
  name        text not null default '' check (char_length(name) <= 80),
  phone       text,
  exam_year   int check (exam_year between 2025 and 2040),
  language    text not null default 'en' check (language in ('en', 'hi', 'mni')),
  onboarded   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Role helpers. SECURITY DEFINER so policies on profiles itself cannot recurse.
create function private.app_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.role from public.profiles p where p.id = auth.uid()), 'student'::public.user_role)
$$;
create function private.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.app_role() in ('teacher', 'admin')
$$;
create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.app_role() = 'admin'
$$;

-- A profile row is created for every new auth user. Role is never taken from client-supplied metadata.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, phone) values (new.id, new.phone) on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- questions
-- Public part: safe to show while a student is taking the test.
create table public.questions (
  id          uuid primary key default gen_random_uuid(),
  subject     text not null check (subject in ('Botany', 'Zoology', 'Physics', 'Chemistry')),
  chapter     text not null check (char_length(chapter) between 1 and 200),
  difficulty  text not null default 'Medium' check (difficulty in ('Easy', 'Medium', 'Hard')),
  text        text not null check (char_length(text) between 1 and 2000),
  options     jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  image_path  text,
  option_style text not null default 'ABCD' check (option_style in ('ABCD', 'abcd', '1234', 'roman', 'ROMAN', 'hindi')),
  image_alt   text check (char_length(image_alt) <= 300),
  status      public.question_status not null default 'draft',
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index questions_status_idx on public.questions (status, subject);
create trigger questions_touch before update on public.questions
  for each row execute function private.touch_updated_at();

-- Secret part: correct answer, explanation, video. Students have no policy here.
create table public.question_secrets (
  question_id  uuid primary key references public.questions (id) on delete cascade,
  correct      smallint not null check (correct between 0 and 3),
  explanation  text not null default '',
  why_wrong    jsonb not null default '[]'::jsonb,
  recap        jsonb not null default '{}'::jsonb,
  ncert        text not null default '',
  caption      text not null default '',
  video_path   text
);

-- Guiding questions for the Socratic tutor (2 to 3 per question). Keys, hints and `good` are secret prompts.
create table public.socratic_steps (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references public.questions (id) on delete cascade,
  position     smallint not null check (position between 1 and 3),
  ask          text not null check (char_length(ask) between 1 and 500),
  keys         text[] not null default '{}',
  hint         text not null default '',
  good         text not null default '',
  sample       text not null default '',
  choices      text[] not null default '{}',
  unique (question_id, position)
);

-- ---------------------------------------------------------------- tests
create table public.tests (
  id                uuid primary key default gen_random_uuid(),
  title             text not null check (char_length(title) between 1 and 120),
  kind              text not null default 'Custom',
  duration_minutes  int not null default 10 check (duration_minutes between 1 and 600),
  price_inr         int not null default 100 check (price_inr >= 0),
  published         boolean not null default false,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger tests_touch before update on public.tests
  for each row execute function private.touch_updated_at();

create table public.test_questions (
  test_id      uuid not null references public.tests (id) on delete cascade,
  question_id  uuid not null references public.questions (id) on delete restrict,
  position     int not null check (position >= 1),
  primary key (test_id, question_id),
  unique (test_id, position) deferrable initially deferred
);

-- ---------------------------------------------------------------- attempts
create table public.attempts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  test_id       uuid not null references public.tests (id) on delete cascade,
  started_at    timestamptz not null default now(),
  submitted_at  timestamptz,
  correct       int,
  wrong         int,
  skipped       int,
  score         int,
  max_score     int
);
create index attempts_user_idx on public.attempts (user_id, started_at desc);
create index attempts_test_idx on public.attempts (test_id) where submitted_at is not null;

create table public.attempt_answers (
  attempt_id    uuid not null references public.attempts (id) on delete cascade,
  question_id   uuid not null references public.questions (id) on delete cascade,
  selected      smallint check (selected between 0 and 3), -- null = skipped
  is_correct    boolean,
  time_seconds  int not null default 0 check (time_seconds between 0 and 7200),
  primary key (attempt_id, question_id)
);
create index attempt_answers_question_idx on public.attempt_answers (question_id);

-- ---------------------------------------------------------------- entitlement tables
create table public.unlocks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  test_id     uuid not null references public.tests (id) on delete cascade,
  source      text not null default 'payment' check (source in ('payment', 'manual')),
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  unique (user_id, test_id)
);

create table public.free_explanation_uses (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  question_id  uuid not null references public.questions (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, question_id)
);

create table public.revision_items (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  question_id  uuid not null references public.questions (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, question_id)
);
