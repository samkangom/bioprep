-- Functions, row-level security and grants.

-- ---------------------------------------------------------------- limits
create function private.free_explanation_limit() returns int
language sql immutable as $$ select 2 $$; -- keep equal to FREE_EXPLANATIONS in shared/rules.js

-- Has this user submitted an attempt that contained this question? Gate for any explanation access.
create function private.has_attempted(p_user uuid, p_question uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.attempts a
    join public.attempt_answers aa on aa.attempt_id = a.id
    where a.user_id = p_user and a.submitted_at is not null and aa.question_id = p_question
  )
$$;

-- Hard cap on free explanations, also enforced if a row is inserted through any other path.
create function private.guard_free_uses() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('free:' || new.user_id::text));
  if (select count(*) from public.free_explanation_uses f where f.user_id = new.user_id) >= private.free_explanation_limit() then
    raise exception 'free_limit_reached' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger free_uses_guard before insert on public.free_explanation_uses
  for each row execute function private.guard_free_uses();

-- ---------------------------------------------------------------- student RPCs
create function public.complete_profile(p_name text, p_exam_year int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  update public.profiles
     set name = left(btrim(coalesce(p_name, '')), 80), exam_year = p_exam_year, onboarded = true
   where id = auth.uid();
end $$;

create function public.start_attempt(p_test uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.tests t where t.id = p_test and (t.published or private.is_staff())) then
    raise exception 'test_not_found' using errcode = 'P0002';
  end if;
  insert into public.attempts (user_id, test_id) values (v_uid, p_test) returning id into v_id;
  return v_id;
end $$;

-- Scores an attempt on the server. The client never sees correct answers, so it cannot score itself.
-- p_answers: {"<question_id>": 0..3}   p_times: {"<question_id>": seconds}
create function public.submit_attempt(p_attempt uuid, p_answers jsonb, p_times jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_att public.attempts%rowtype;
  v_minutes int;
  v_total int;
  v_correct int;
  v_wrong int;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into v_att from public.attempts where id = p_attempt and user_id = v_uid for update;
  if not found then raise exception 'attempt_not_found' using errcode = 'P0002'; end if;

  if v_att.submitted_at is null then
    select duration_minutes into v_minutes from public.tests where id = v_att.test_id;
    -- The client auto-submits at 00:00. Allow 5 minutes for slow networks, refuse anything later.
    if now() > v_att.started_at + make_interval(mins => v_minutes) + interval '5 minutes' then
      raise exception 'attempt_expired' using errcode = 'P0001';
    end if;

    insert into public.attempt_answers (attempt_id, question_id, selected, is_correct, time_seconds)
    select p_attempt, tq.question_id, sel.v,
           case when sel.v is null then null else sel.v = qs.correct end,
           case when (p_times ->> tq.question_id::text) ~ '^\d{1,5}(\.\d+)?$'
                then least(round((p_times ->> tq.question_id::text)::numeric)::int, 7200) else 0 end
    from public.test_questions tq
    join public.question_secrets qs on qs.question_id = tq.question_id
    cross join lateral (
      select case when (p_answers ->> tq.question_id::text) ~ '^[0-3]$'
                  then (p_answers ->> tq.question_id::text)::smallint end as v
    ) sel
    where tq.test_id = v_att.test_id;

    select count(*), count(*) filter (where is_correct), count(*) filter (where is_correct is false)
      into v_total, v_correct, v_wrong
      from public.attempt_answers where attempt_id = p_attempt;

    -- Marking scheme: +4 correct, -1 wrong, 0 skipped (MARKS in shared/rules.js).
    update public.attempts
       set submitted_at = now(), correct = v_correct, wrong = v_wrong, skipped = v_total - v_correct - v_wrong,
           score = v_correct * 4 - v_wrong, max_score = v_total * 4
     where id = p_attempt;
  end if;

  return (select jsonb_build_object('id', a.id, 'test_id', a.test_id, 'correct', a.correct, 'wrong', a.wrong,
                                    'skipped', a.skipped, 'score', a.score, 'max', a.max_score,
                                    'submitted_at', a.submitted_at)
            from public.attempts a where a.id = p_attempt);
end $$;

-- ---------------------------------------------------------------- staff RPCs
create function public.admin_upsert_question(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := coalesce(nullif(p ->> 'id', '')::uuid, gen_random_uuid());
  v_status public.question_status := coalesce(nullif(p ->> 'status', ''), 'draft')::public.question_status;
  v_step jsonb;
  v_i int := 0;
  v_asks int;
begin
  if not private.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;

  if jsonb_typeof(p -> 'options') is distinct from 'array' or jsonb_array_length(p -> 'options') <> 4 then
    raise exception 'invalid_question: need exactly four options' using errcode = 'P0001';
  end if;

  if v_status = 'published' then
    if btrim(coalesce(p ->> 'text', '')) = '' or btrim(coalesce(p ->> 'chapter', '')) = '' then
      raise exception 'invalid_question: question text and chapter are required' using errcode = 'P0001';
    end if;
    if exists (select 1 from jsonb_array_elements_text(p -> 'options') o where btrim(o) = '') then
      raise exception 'invalid_question: all four options are required' using errcode = 'P0001';
    end if;
    if btrim(coalesce(p ->> 'explanation', '')) = '' then
      raise exception 'invalid_question: an explanation is required to publish' using errcode = 'P0001';
    end if;
    select count(*) into v_asks from jsonb_array_elements(coalesce(p -> 'socratic', '[]'::jsonb)) s
     where btrim(coalesce(s ->> 'ask', '')) <> '';
    if v_asks < 2 then
      raise exception 'invalid_question: add at least two guiding questions to publish' using errcode = 'P0001';
    end if;
  end if;

  insert into public.questions (id, subject, chapter, difficulty, text, options, option_style, image_path, image_alt, status, created_by)
  values (v_id, p ->> 'subject', btrim(coalesce(p ->> 'chapter', '')), coalesce(nullif(p ->> 'difficulty', ''), 'Medium'),
          btrim(coalesce(p ->> 'text', '')), p -> 'options', coalesce(nullif(p ->> 'optionStyle', ''), 'ABCD'), nullif(p ->> 'imagePath', ''), left(nullif(btrim(coalesce(p ->> 'imageAlt', '')), ''), 300), v_status, auth.uid())
  on conflict (id) do update
     set subject = excluded.subject, chapter = excluded.chapter, difficulty = excluded.difficulty, text = excluded.text,
         options = excluded.options, option_style = excluded.option_style, image_path = excluded.image_path, image_alt = excluded.image_alt, status = excluded.status;

  insert into public.question_secrets (question_id, correct, explanation, why_wrong, recap, ncert, caption, video_path)
  values (v_id, coalesce((p ->> 'correct')::int, 0), coalesce(p ->> 'explanation', ''),
          coalesce(p -> 'whyWrong', '[]'::jsonb), coalesce(p -> 'recap', '{}'::jsonb),
          coalesce(p ->> 'ncert', ''), coalesce(p ->> 'caption', ''), nullif(p ->> 'videoPath', ''))
  on conflict (question_id) do update
     set correct = excluded.correct, explanation = excluded.explanation, why_wrong = excluded.why_wrong,
         recap = excluded.recap, ncert = excluded.ncert, caption = excluded.caption, video_path = excluded.video_path;

  delete from public.socratic_steps where question_id = v_id;
  for v_step in select * from jsonb_array_elements(coalesce(p -> 'socratic', '[]'::jsonb)) loop
    continue when btrim(coalesce(v_step ->> 'ask', '')) = '';
    v_i := v_i + 1;
    exit when v_i > 3;
    insert into public.socratic_steps (question_id, position, ask, keys, hint, good, sample, choices)
    values (v_id, v_i, btrim(v_step ->> 'ask'),
            array(select jsonb_array_elements_text(coalesce(v_step -> 'keys', '[]'::jsonb))),
            coalesce(v_step ->> 'hint', ''), coalesce(v_step ->> 'good', ''), coalesce(v_step ->> 'sample', ''),
            array(select jsonb_array_elements_text(coalesce(v_step -> 'choices', '[]'::jsonb))));
  end loop;
  return v_id;
end $$;

-- Full question for the editor, including secrets. Staff only.
create function public.admin_get_question(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return (
    select jsonb_build_object(
      'id', q.id, 'subject', q.subject, 'chapter', q.chapter, 'difficulty', q.difficulty, 'text', q.text,
      'options', q.options, 'optionStyle', q.option_style, 'imagePath', q.image_path, 'imageAlt', q.image_alt, 'status', q.status,
      'correct', s.correct, 'explanation', s.explanation, 'whyWrong', s.why_wrong, 'recap', s.recap,
      'ncert', s.ncert, 'caption', s.caption, 'videoPath', s.video_path,
      'socratic', (select coalesce(jsonb_agg(jsonb_build_object(
                     'ask', t.ask, 'keys', to_jsonb(t.keys), 'hint', t.hint, 'good', t.good,
                     'sample', t.sample, 'choices', to_jsonb(t.choices)) order by t.position), '[]'::jsonb)
                   from public.socratic_steps t where t.question_id = q.id))
    from public.questions q left join public.question_secrets s on s.question_id = q.id
    where q.id = p_id);
end $$;

create function public.admin_upsert_test(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := coalesce(nullif(p ->> 'id', '')::uuid, gen_random_uuid());
  v_pub boolean := coalesce((p ->> 'published')::boolean, false);
  v_qids jsonb := coalesce(p -> 'qids', '[]'::jsonb);
begin
  if not private.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if btrim(coalesce(p ->> 'title', '')) = '' then
    raise exception 'invalid_test: a title is required' using errcode = 'P0001';
  end if;
  if v_pub then
    if jsonb_array_length(v_qids) = 0 then
      raise exception 'invalid_test: add at least one question before publishing' using errcode = 'P0001';
    end if;
    if exists (select 1 from jsonb_array_elements_text(v_qids) x
               left join public.questions q on q.id = x::uuid
               where q.id is null or q.status <> 'published') then
      raise exception 'invalid_test: every question in a published test must be published' using errcode = 'P0001';
    end if;
  end if;

  insert into public.tests (id, title, kind, duration_minutes, price_inr, published, created_by)
  values (v_id, btrim(p ->> 'title'), coalesce(nullif(p ->> 'kind', ''), 'Custom'),
          coalesce((p ->> 'duration')::int, 10), coalesce((p ->> 'price')::int, 100), v_pub, auth.uid())
  on conflict (id) do update
     set title = excluded.title, kind = excluded.kind, duration_minutes = excluded.duration_minutes,
         price_inr = excluded.price_inr, published = excluded.published;

  delete from public.test_questions where test_id = v_id;
  insert into public.test_questions (test_id, question_id, position)
  select v_id, x::uuid, n from jsonb_array_elements_text(v_qids) with ordinality as t(x, n);
  return v_id;
end $$;

create function public.admin_set_role(p_user uuid, p_role public.user_role) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'cannot change your own role' using errcode = 'P0001'; end if;
  update public.profiles set role = p_role where id = p_user;
end $$;

create function public.admin_grant_unlock(p_user uuid, p_test uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.unlocks (user_id, test_id, source) values (p_user, p_test, 'manual')
  on conflict (user_id, test_id) do update set revoked_at = null;
end $$;

-- ---------------------------------------------------------------- row-level security
alter table public.profiles             enable row level security;
alter table public.questions            enable row level security;
alter table public.question_secrets     enable row level security;
alter table public.socratic_steps       enable row level security;
alter table public.tests                enable row level security;
alter table public.test_questions       enable row level security;
alter table public.attempts             enable row level security;
alter table public.attempt_answers      enable row level security;
alter table public.unlocks              enable row level security;
alter table public.free_explanation_uses enable row level security;
alter table public.revision_items       enable row level security;

-- profiles: read your own row (admins read all). Update only name/exam_year/language (column grant below).
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or private.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- questions: students read published only; staff read and write everything.
create policy questions_student_read on public.questions for select to authenticated
  using (status = 'published');
create policy questions_staff_all on public.questions for all to authenticated
  using (private.is_staff()) with check (private.is_staff());

-- secrets and Socratic prompts: staff only. Students get them through the API after the tutor session ends.
create policy secrets_staff_all on public.question_secrets for all to authenticated
  using (private.is_staff()) with check (private.is_staff());
create policy steps_staff_all on public.socratic_steps for all to authenticated
  using (private.is_staff()) with check (private.is_staff());

-- tests: students read published only; only staff write.
create policy tests_student_read on public.tests for select to authenticated
  using (published);
create policy tests_staff_all on public.tests for all to authenticated
  using (private.is_staff()) with check (private.is_staff());
create policy test_questions_read on public.test_questions for select to authenticated
  using (exists (select 1 from public.tests t where t.id = test_id and t.published) or private.is_staff());
create policy test_questions_staff_write on public.test_questions for all to authenticated
  using (private.is_staff()) with check (private.is_staff());

-- attempts: your own only. No insert/update policy: they are created and scored by start_attempt/submit_attempt.
create policy attempts_select on public.attempts for select to authenticated
  using (user_id = auth.uid() or private.is_admin());
create policy attempt_answers_select on public.attempt_answers for select to authenticated
  using (exists (select 1 from public.attempts a where a.id = attempt_id and (a.user_id = auth.uid() or private.is_admin())));

-- unlocks: read your own. Rows are inserted by the payment webhook (service role) or admin_grant_unlock only.
create policy unlocks_select on public.unlocks for select to authenticated
  using (user_id = auth.uid() or private.is_admin());

-- free explanations: read your own. Insert allowed only for yourself, only for a question you attempted;
-- the cap of two is enforced by the guard trigger so it also holds under concurrent requests.
create policy free_uses_select on public.free_explanation_uses for select to authenticated
  using (user_id = auth.uid() or private.is_admin());
create policy free_uses_insert on public.free_explanation_uses for insert to authenticated
  with check (user_id = auth.uid() and private.has_attempted(auth.uid(), question_id));

create policy revision_own on public.revision_items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- grants
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.app_role(), private.is_staff(), private.is_admin(), private.has_attempted(uuid, uuid)
  to authenticated;

grant select on public.profiles, public.questions, public.tests, public.test_questions, public.attempts,
                public.attempt_answers, public.unlocks, public.free_explanation_uses, public.revision_items
  to authenticated;
grant update (name, exam_year, language) on public.profiles to authenticated;
grant insert, delete on public.revision_items to authenticated;
grant insert on public.free_explanation_uses to authenticated;
grant select, insert, update, delete on public.question_secrets, public.socratic_steps to authenticated;
grant insert, update, delete on public.questions, public.tests, public.test_questions to authenticated;

grant execute on function
  public.complete_profile(text, int), public.start_attempt(uuid), public.submit_attempt(uuid, jsonb, jsonb),
  public.admin_upsert_question(jsonb), public.admin_get_question(uuid), public.admin_upsert_test(jsonb),
  public.admin_set_role(uuid, public.user_role), public.admin_grant_unlock(uuid, uuid)
  to authenticated;
