-- Real analytics for the admin screens. All functions are staff-only (teachers see content analytics,
-- only admins see revenue and user counts). They read submitted attempts and captured payments, nothing is invented.

-- Average score per test (submitted attempts only).
create function public.admin_test_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'test_id', t.id, 'title', t.title, 'attempts', s.n, 'students', s.students,
      'avg_score', round(s.avg_score, 1), 'avg_max', s.avg_max, 'avg_pct', round(s.avg_score * 100.0 / nullif(s.avg_max, 0), 1),
      'avg_minutes', round(s.avg_seconds / 60.0, 1)) order by t.created_at)
    from public.tests t
    join lateral (
      select count(*)::int n, count(distinct a.user_id)::int students, avg(a.score)::numeric avg_score, avg(a.max_score)::numeric avg_max,
             avg((select sum(aa.time_seconds) from public.attempt_answers aa where aa.attempt_id = a.id))::numeric avg_seconds
      from public.attempts a where a.test_id = t.id and a.submitted_at is not null
    ) s on s.n > 0), '[]'::jsonb);
end $$;

-- Hardest questions: lowest share correct among those attempted. Needs a minimum number of answers to be meaningful.
create function public.admin_question_stats(p_min int default 1, p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(r order by (r ->> 'pct_correct')::numeric asc, (r ->> 'answered')::int desc)
    from (
      select jsonb_build_object(
        'question_id', q.id, 'text', q.text, 'subject', q.subject, 'chapter', q.chapter,
        'shown', count(*)::int, 'answered', count(*) filter (where aa.selected is not null)::int,
        'correct', count(*) filter (where aa.is_correct)::int, 'skipped', count(*) filter (where aa.selected is null)::int,
        'pct_correct', round(100.0 * count(*) filter (where aa.is_correct) / nullif(count(*) filter (where aa.selected is not null), 0), 1),
        'avg_seconds', round(avg(aa.time_seconds), 0)) as r
      from public.attempt_answers aa
      join public.attempts a on a.id = aa.attempt_id and a.submitted_at is not null
      join public.questions q on q.id = aa.question_id
      group by q.id
      having count(*) filter (where aa.selected is not null) >= greatest(p_min, 1)
      limit greatest(p_limit, 1)
    ) x), '[]'::jsonb);
end $$;

-- Revenue from unlocks: captured payments, net of refunds, by month, plus totals. Admin only.
create function public.admin_revenue() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'gross_paise', coalesce((select sum(amount_paise) from public.payments where status in ('paid', 'refunded')), 0),
    'refunded_paise', coalesce((select sum(amount_paise) from public.payments where status = 'refunded'), 0),
    'paid_count', (select count(*) from public.payments where status in ('paid', 'refunded')),
    'refund_flagged', (select count(*) from public.payments where refund_flag and status = 'paid'),
    'manual_unlocks', (select count(*) from public.unlocks where source = 'manual' and revoked_at is null),
    'by_month', coalesce((
      select jsonb_agg(jsonb_build_object('month', m, 'net_paise', net, 'count', n) order by m)
      from (select to_char(date_trunc('month', paid_at), 'YYYY-MM') m, sum(case when status = 'paid' then amount_paise else 0 end) net, count(*)::int n
              from public.payments where status in ('paid', 'refunded') and paid_at is not null group by 1) mm), '[]'::jsonb));
end $$;

-- Counts for the dashboard. Admin sees people counts; teachers get content counts only.
create function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'tests', (select count(*) from public.tests),
    'questions', (select count(*) from public.questions),
    'published_questions', (select count(*) from public.questions where status = 'published'),
    'attempts', (select count(*) from public.attempts where submitted_at is not null),
    'students', case when private.is_admin() then (select count(*) from public.profiles where role = 'student') end,
    'active_unlocks', case when private.is_admin() then (select count(*) from public.unlocks where revoked_at is null) end);
end $$;

-- Users and plans (admin only). Phone numbers are masked in the result; admins who need the full number
-- can read it from Supabase directly, which is audited there.
create function public.admin_users() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'role', p.role,
      'phone', regexp_replace(coalesce(p.phone, ''), '^(\d{2})(\d{2})\d{4}(\d{4})$', '\1\2xxxx\3'),
      'exam_year', p.exam_year, 'joined', p.created_at,
      'unlocked_tests', (select count(*) from public.unlocks u where u.user_id = p.id and u.revoked_at is null),
      'attempts', (select count(*) from public.attempts a where a.user_id = p.id and a.submitted_at is not null)) order by p.created_at desc)
    from (select * from public.profiles order by created_at desc limit 500) p), '[]'::jsonb);
end $$;

revoke all on function public.admin_test_stats(), public.admin_question_stats(int, int), public.admin_revenue(),
  public.admin_overview(), public.admin_users() from public, anon, authenticated;
grant execute on function public.admin_test_stats(), public.admin_question_stats(int, int), public.admin_revenue(),
  public.admin_overview(), public.admin_users() to authenticated;
