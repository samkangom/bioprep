# BioPrep: NEET Biology prototype

```bash
npm install
npm run dev      # open http://localhost:5173
npm run build    # dist/index.html, one self-contained file
```

## Try it
1. Sign in with any 10-digit number and any 4-digit code, or use "Skip as student".
2. Turn on **Demo speed ×20** in the header so timers run fast.
3. Start *Biology Mock 1*, answer a few questions, submit (or let the timer end).
4. On the result page tap **Explain**. Chat with the tutor, tap an option or type, or use "Demo: fill a sample answer", or wait out the 2:00 timer.
5. Open a third explanation: the paywall appears (free plan = 2). Pay with the demo checkout to unlock the test.
6. Switch to **Admin** (header) to add a question, upload an MP4 and build a test. "Reset demo" is in the footer.

Uploaded videos last for the browser session only. Everything else is saved in localStorage.
That is the offline **mock mode**: it is what you get when no Supabase variables are set (or `VITE_USE_MOCK=1`).

See `CLAUDE.md` for product rules and the build-out plan to use with Claude Code.

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

## Claude-powered Socratic tutor locally
```bash
cd server && npm install && ANTHROPIC_API_KEY=sk-ant-... npm start   # :8787
cd .. && cp .env.example .env.local && npm run dev
```
Without `VITE_API_URL` the app uses the built-in scripted tutor.
