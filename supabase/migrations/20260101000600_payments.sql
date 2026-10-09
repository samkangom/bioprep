-- Payments. Rows are written only by the API (service connection): order creation and the verified Razorpay webhook.
-- Students can read their own payments (payment history); admins can read all and flag refunds.

create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references public.profiles (id) on delete set null, -- kept (anonymised) if the account is deleted
  test_id             uuid references public.tests (id) on delete set null,
  amount_paise        int not null check (amount_paise > 0),
  currency            text not null default 'INR',
  status              text not null default 'created' check (status in ('created', 'paid', 'failed', 'refunded')),
  razorpay_order_id   text not null unique,
  razorpay_payment_id text unique,
  method              text,
  refund_flag         boolean not null default false,
  refund_note         text,
  refund_flagged_by   uuid references public.profiles (id) on delete set null,
  refund_flagged_at   timestamptz,
  refund_id           text,
  created_at          timestamptz not null default now(),
  paid_at             timestamptz,
  refunded_at         timestamptz
);
create index payments_user_idx on public.payments (user_id, created_at desc);
create index payments_status_idx on public.payments (status, created_at desc);

-- Link an unlock to the payment that created it.
alter table public.unlocks add column payment_id uuid references public.payments (id) on delete set null;

-- Processed webhook events, for idempotency (Razorpay retries deliveries).
create table public.payment_events (
  event_id    text primary key,
  event_type  text not null,
  created_at  timestamptz not null default now()
);

alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
create policy payments_select on public.payments for select to authenticated
  using (user_id = auth.uid() or private.is_admin());
revoke all on public.payments, public.payment_events from anon, authenticated;
grant select on public.payments to authenticated;

-- Admin: flag (or clear) a payment for refund. Flagging does not move money or revoke access; the refund itself
-- is issued in the Razorpay dashboard. When Razorpay reports refund.processed the webhook marks it refunded and
-- revokes the unlock.
create function public.admin_flag_refund(p_payment uuid, p_flag boolean, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.payments
     set refund_flag = p_flag,
         refund_note = case when p_flag then left(btrim(coalesce(p_note, '')), 500) else null end,
         refund_flagged_by = case when p_flag then auth.uid() else null end,
         refund_flagged_at = case when p_flag then now() else null end
   where id = p_payment and status in ('paid', 'refunded');
  if not found then raise exception 'payment_not_found' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.admin_flag_refund(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_flag_refund(uuid, boolean, text) to authenticated;

-- Called by the webhook handler (service connection only), in one transaction per event.
-- Returns what happened so the API can log it. Idempotent on event id and on payment id.
create function private.apply_payment_captured(p_event text, p_order text, p_payment text, p_amount int, p_currency text, p_method text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_pay public.payments%rowtype;
begin
  insert into public.payment_events (event_id, event_type) values (p_event, 'payment.captured') on conflict do nothing;
  if not found then return 'duplicate_event'; end if;

  select * into v_pay from public.payments where razorpay_order_id = p_order for update;
  if not found then delete from public.payment_events where event_id = p_event; return 'unknown_order'; end if;
  if v_pay.status in ('paid', 'refunded') then return 'already_paid'; end if;
  -- The webhook amount must equal what we asked Razorpay to charge for this order.
  if v_pay.amount_paise <> p_amount or v_pay.currency <> p_currency then return 'amount_mismatch'; end if;
  if v_pay.user_id is null or v_pay.test_id is null then return 'orphaned'; end if;

  update public.payments
     set status = 'paid', razorpay_payment_id = p_payment, method = p_method, paid_at = now()
   where id = v_pay.id;
  insert into public.unlocks (user_id, test_id, source, payment_id)
  values (v_pay.user_id, v_pay.test_id, 'payment', v_pay.id)
  on conflict (user_id, test_id) do update set revoked_at = null, payment_id = excluded.payment_id, source = 'payment';
  return 'unlocked';
end $$;

create function private.apply_payment_failed(p_event text, p_order text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.payment_events (event_id, event_type) values (p_event, 'payment.failed') on conflict do nothing;
  if not found then return 'duplicate_event'; end if;
  update public.payments set status = 'failed' where razorpay_order_id = p_order and status = 'created';
  return 'failed';
end $$;

create function private.apply_refund_processed(p_event text, p_payment text, p_refund text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_pay public.payments%rowtype;
begin
  insert into public.payment_events (event_id, event_type) values (p_event, 'refund.processed') on conflict do nothing;
  if not found then return 'duplicate_event'; end if;
  select * into v_pay from public.payments where razorpay_payment_id = p_payment for update;
  if not found then delete from public.payment_events where event_id = p_event; return 'unknown_payment'; end if;
  update public.payments set status = 'refunded', refund_id = p_refund, refunded_at = now() where id = v_pay.id;
  update public.unlocks set revoked_at = now() where payment_id = v_pay.id and revoked_at is null;
  return 'refunded';
end $$;

revoke all on function private.apply_payment_captured(text, text, text, int, text, text), private.apply_payment_failed(text, text),
  private.apply_refund_processed(text, text, text) from public, anon, authenticated;
