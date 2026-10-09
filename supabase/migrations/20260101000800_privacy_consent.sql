-- Privacy: under-18 handling (parental consent), minimal data, and data retention.
--
-- Data we keep per student: phone (login), name, exam year, birth YEAR (not the full date), is_minor, language.
-- For minors we also keep a consent record (guardian name, guardian phone, policy version, time).
-- Tutor chats are never stored. ai_usage keeps counts only. Both are purged on a schedule below.

alter table public.profiles
  add column birth_year int check (birth_year between 1950 and 2030),
  add column is_minor boolean not null default false;

create table public.parental_consents (
  user_id         uuid primary key references public.profiles (id) on delete cascade,
  guardian_name   text not null check (char_length(guardian_name) between 2 and 80),
  guardian_phone  text not null check (guardian_phone ~ '^[6-9][0-9]{9}$'),
  relationship    text not null check (relationship in ('mother', 'father', 'legal guardian')),
  policy_version  text not null,
  consented_at    timestamptz not null default now()
);
alter table public.parental_consents enable row level security;
create policy consents_select on public.parental_consents for select to authenticated
  using (user_id = auth.uid() or private.is_admin());
revoke all on public.parental_consents from anon, authenticated;
grant select on public.parental_consents to authenticated;

-- Sign-up completion, replacing complete_profile. The server decides is_minor from the birth date it was given;
-- the full date is not stored. A minor cannot finish sign-up without a guardian consent record.
-- (The age is computed as of today; a person is a minor until their 18th birthday.)
create function public.complete_signup(
  p_name text, p_exam_year int, p_birth_date date,
  p_guardian_name text default null, p_guardian_phone text default null, p_relationship text default null,
  p_consent boolean default false, p_policy_version text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_age int;
  v_minor boolean;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_birth_date is null or p_birth_date > current_date or p_birth_date < date '1950-01-01' then
    raise exception 'invalid_birth_date' using errcode = 'P0001';
  end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'name_required' using errcode = 'P0001'; end if;
  v_age := extract(year from age(current_date, p_birth_date));
  if v_age < 13 then raise exception 'too_young' using errcode = 'P0001'; end if; -- minimum age 13 (MIN_AGE in src/privacy.js)
  v_minor := v_age < 18;
  if not p_consent then raise exception 'policy_consent_required' using errcode = 'P0001'; end if; -- accepted the privacy policy
  if v_minor and (btrim(coalesce(p_guardian_name, '')) = '' or coalesce(p_guardian_phone, '') !~ '^[6-9][0-9]{9}$'
                  or p_relationship not in ('mother', 'father', 'legal guardian')) then
    raise exception 'guardian_consent_required' using errcode = 'P0001';
  end if;

  update public.profiles
     set name = left(btrim(p_name), 80), exam_year = p_exam_year, birth_year = extract(year from p_birth_date)::int,
         is_minor = v_minor, onboarded = true
   where id = v_uid;

  if v_minor then
    insert into public.parental_consents (user_id, guardian_name, guardian_phone, relationship, policy_version)
    values (v_uid, left(btrim(p_guardian_name), 80), p_guardian_phone, p_relationship, coalesce(p_policy_version, 'unknown'))
    on conflict (user_id) do update
       set guardian_name = excluded.guardian_name, guardian_phone = excluded.guardian_phone,
           relationship = excluded.relationship, policy_version = excluded.policy_version, consented_at = now();
  end if;
end $$;
revoke all on function public.complete_signup(text, int, date, text, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.complete_signup(text, int, date, text, text, text, boolean, text) to authenticated;

-- Retired: the old sign-up function skipped the age and consent step.
drop function public.complete_profile(text, int);

-- Data retention. Run daily (pg_cron on Supabase: select cron.schedule('bioprep-purge', '17 3 * * *', 'select public.purge_old_data()')).
--   * tutor session rows (counters only) older than 30 days
--   * AI usage rows older than 90 days
--   * attempts that were started but never submitted, older than 7 days
--   * processed webhook event ids older than 60 days
create function public.purge_old_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a int; b int; c int; d int;
begin
  delete from public.tutor_sessions where started_at < now() - interval '30 days'; get diagnostics a = row_count;
  delete from public.ai_usage where created_at < now() - interval '90 days'; get diagnostics b = row_count;
  delete from public.attempts where submitted_at is null and started_at < now() - interval '7 days'; get diagnostics c = row_count;
  delete from public.payment_events where created_at < now() - interval '60 days'; get diagnostics d = row_count;
  return jsonb_build_object('tutor_sessions', a, 'ai_usage', b, 'abandoned_attempts', c, 'payment_events', d);
end $$;
revoke all on function public.purge_old_data() from public, anon, authenticated;

-- Right to erasure. Called by the API after it has deleted the auth user (which cascades to profile, attempts,
-- unlocks, free uses, revision items, consent, tutor sessions and usage). Payment rows are kept for the
-- accounting records the law requires, but are detached from the person (user_id becomes null via ON DELETE SET NULL).
-- Nothing else to do here: this comment documents the behaviour and tests/db/privacy.test.js enforces it.
