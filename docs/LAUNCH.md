# Launch checklist

Everything below needs an account or a decision that only you can make. Code and tests are done; none of the real
services (Supabase, Razorpay, Anthropic, Vercel, Render) were reachable from the build environment, so **do the
test-mode run in step 7 before taking real money.**

## 1. Supabase
1. Create a project. Note the project URL, the `anon` key, the `service_role` key and the database connection string.
2. `supabase link --project-ref <ref>` then `supabase db push` (applies `supabase/migrations/*.sql` in order).
   The migrations were written but never applied to a hosted project. If one fails, fix the file (nothing is deployed yet) and push again.
3. Seed the sample questions once (SQL editor: paste `supabase/seed.sql`), or import your own through the admin CSV import.
4. Authentication > Providers > **Phone**: enable it and connect an SMS provider (Twilio Verify, or MSG91 through a Send SMS hook).
   For Indian numbers the provider needs a DLT-registered sender and template. Set the OTP length to 6.
5. Make the first admin (SQL editor), after signing in once with that phone: `update profiles set role = 'admin' where phone = '91XXXXXXXXXX';`
   Teachers and further admins can then be set from Admin > Users and plans.
6. Storage: the `videos` (private, 200 MB, mp4) and `diagrams` (public, 5 MB) buckets are created by migration `...0500`. Check them in the dashboard.
7. Schedule data retention: Database > Extensions > enable `pg_cron`, then
   `select cron.schedule('bioprep-purge', '17 3 * * *', 'select public.purge_old_data()');`
8. Database > Backups: turn on daily backups (paid plan) before you hold real student data.

## 2. API (Render, or any Node host)
- `render.yaml` is a blueprint; or build the `Dockerfile`. Set the variables from `.env.example` (API section) in the host's dashboard.
- `ALLOWED_ORIGINS` must list your frontend origin(s), comma separated. `DATABASE_URL` needs the `postgres` role (service connection).
- Health check: `GET /health`. Without `ANTHROPIC_API_KEY` the tutor runs on the scripted guide; without `RAZORPAY_*` payments return 503.
- Run a single instance first. The per-minute burst limiter is in memory; the daily Claude limit is in the database and holds across instances.

## 3. Frontend (Vercel)
- Import the repo. Build command `npm run build`, output `dist` (see `vercel.json`).
- Environment variables (public by design): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`, optionally `VITE_SUPPORT_EMAIL`, `VITE_COMPANY_NAME`.
- Do **not** set `VITE_USE_MOCK`. The privacy policy is served at `/#/privacy` (use this URL in app-store and Razorpay forms).

## 4. Razorpay
1. Use **test keys** (`rzp_test_...`). In the dashboard enable UPI and cards for the account.
2. Settings > Webhooks > add `https://<api-host>/api/payments/webhook`, choose a secret (this is `RAZORPAY_WEBHOOK_SECRET`) and tick
   `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`.
3. Go live only after step 7, with live keys and a live webhook. KYC and settlement are on Razorpay's side.
4. Refunds: flag in Admin > Payments, issue the refund in the Razorpay dashboard; the webhook then marks it refunded and revokes the unlock.

## 5. Anthropic
`ANTHROPIC_API_KEY` on the API host only. Default model `claude-haiku-5-5` at `low` effort. Watch the `ai_usage` table (token counts per student per day).
Tune `TUTOR_DAILY_LIMIT` (Claude turns per student per 24 hours; the scripted guide answers beyond it).

## 6. Decisions and reviews only you can do
- **Legal review of `src/views/Privacy.jsx`** and of how you collect consent from under-18 students. The app records a guardian's name,
  number and consent tick entered on the student's device. It does **not** verify the guardian (for example by sending them an OTP).
  Whether that is enough under the DPDP Act is a legal question; verified consent needs an SMS provider and a flow for the guardian's phone.
- Name a grievance contact and set `VITE_SUPPORT_EMAIL`. Check the stated retention of payment records against your accountant's advice.
- Minimum age is 13 (`MIN_AGE` in `src/privacy.js`, mirrored in `complete_signup`). Change both together if you disagree.
- Hindi strings (`src/i18n/hi.js`) are a first draft: get a native review. Meiteilon (`src/i18n/mni.js`) is empty on purpose; hand it to a translator, then set `ready: true`.
  Only the shell, sign-in and home screens use `t()` so far; wrap the remaining screens the same way.

## 7. Test-mode run (do this before real money)
Sign up with a real phone, take a test, finish two free explanations, hit the paywall, pay with Razorpay test UPI/card,
confirm the unlock appears (webhook), refund it from the Razorpay dashboard, and confirm the unlock is revoked.
Upload a small MP4 as admin and confirm it plays for a student only after the tutor session ends.
Then delete the test account from Profile > Privacy and confirm the data is gone.

## Known limits
- Video uploads use a single request (no resume). A dropped connection on a 200 MB file starts over.
- Guardian consent is recorded, not verified (see step 6).
- Rate limiting for bursts is per API instance.
- `dev/` (PGlite + Supabase stand-in) is for development and tests only. Do not deploy it.
