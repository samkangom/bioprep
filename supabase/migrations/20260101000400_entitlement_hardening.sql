-- Stage 3: free vs paid rules, enforced below the API as well.
-- The API calls private.open_explanation (security definer, service connection). These additions make sure that
-- even a client holding a valid user JWT and talking to PostgREST directly cannot get more than the rules allow.

-- 1. free_explanation_uses: a client may only insert a use for a question it attempted and cannot exceed the cap
--    (policy from the core migration + guard trigger). Clients can never update or delete uses (no grant).
-- 2. unlocks: no write grant for clients at all (already revoked); only service role / admin_grant_unlock write.
-- 3. tutor_sessions / ai_usage: select only; no write grant.

-- Convenience for the UI and for tests: what can this user do right now? (Read-only, own data only.)
create function public.my_entitlements() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'free_limit', private.free_explanation_limit(),
    'free_used', (select count(*) from public.free_explanation_uses f where f.user_id = auth.uid()),
    'unlocked_tests', coalesce((select jsonb_agg(u.test_id) from public.unlocks u where u.user_id = auth.uid() and u.revoked_at is null), '[]'::jsonb))
$$;
revoke all on function public.my_entitlements() from public, anon, authenticated;
grant execute on function public.my_entitlements() to authenticated;

-- Revoking an unlock (refunds, stage 5) must also stop paid access to explanations from being served.
-- private.open_explanation and private.has_paid_access already filter on revoked_at is null.
