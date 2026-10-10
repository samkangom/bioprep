# BioPrep: NEET Biology test prep

```bash
npm install
npm run dev           # open http://localhost:5173 (offline demo until you configure Supabase, see below)
npm run build         # normal bundle in dist/ (what Vercel serves)
npm run build:single  # dist/index.html as one self-contained file, for sharing the offline demo
npm test              # unit, database and API tests
npm run test:e2e      # browser tests (desktop and 390px)
```

Going live? Follow `docs/LAUNCH.md`.

## Try the offline demo
1. Sign in with any 10-digit number and any 4-digit code, or use "Skip as student".
2. Turn on **Demo speed ×20** in the header so timers run fast.
3. Start *Biology Mock 1*, answer a few questions, submit (or let the timer end).
4. On the result page tap **Explain**. Chat with the tutor, tap an option or type, or use "Demo: fill a sample answer", or wait out the 2:00 timer.
5. Open a third explanation: the paywall appears (free plan = 2). Pay with the demo checkout to unlock the test.
6. Switch to **Admin** (header) to add a question, upload an MP4 and build a test. "Reset demo" is in the footer.

Uploaded videos last for the browser session only. Everything else is saved in localStorage.
That is the offline **mock mode**: it is what you get when no Supabase variables are set (or `VITE_USE_MOCK=1`).

See `CLAUDE.md` for product rules, what is done and what is next.

## Real mode: Supabase
Everything real (accounts, scoring, entitlement) lives in `supabase/migrations/`. Scoring runs in SQL, and students cannot read
correct answers, explanations or tutor prompts at all (row-level security). Tests: `npm test`.

**Without a Supabase account** (local stack: PGlite + a small Supabase stand-in, in memory):
```bash
npm run dev:stack            # prints VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
# put them in .env.local, then
npm run dev                  # sign in with any 6-9xxxxxxxxx number, code 123456. Admin: 9999999999
```
**With Supabase** (hosted project or `supabase start`): `supabase link`, `supabase db push` (runs the migrations), then run
`supabase/seed.sql` once, and set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Enable the Phone provider and an SMS provider in
the dashboard. Make your first admin in the SQL editor: `update profiles set role = 'admin' where phone = '91XXXXXXXXXX';`

## Claude tutor
The tutor runs on the API (`server/`). The browser sends `{questionId, messages, kind, hintLevel}`; the server loads the question,
correct answer and secret prompts from the database, builds the prompt (`shared/tutor-core.js`), calls Claude, validates the JSON and
returns only `{verdict, reply, step, established, choices, done}`. The answer and explanation come from `GET /api/explain/:questionId`,
and only after the server has marked the session finished (guided questions done, 2:00 timer over, or "Show me the answer").
Without `ANTHROPIC_API_KEY`, or when Claude fails or hits the daily limit, the scripted keyword tutor answers instead.

```bash
npm run dev:stack            # starts the database, auth stand-in and the API on :8787 (scripted tutor)
ANTHROPIC_API_KEY=sk-ant-... npm run dev:stack   # same, with Claude (Haiku 5.5 by default)
```
Production API: set the variables in `.env.example` (API section) and run `npm run api`.
