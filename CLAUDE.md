# BioPrep: NEET (UG) Biology test-prep web app

Clickable prototype. React 18 + Vite, no backend. State lives in `src/store.jsx` (React context, mirrored to localStorage). All seed data is in `src/data.js`.

## Product rules (do not change without asking)
- Subjects: Biology live (Botany + Zoology). Physics and Chemistry are "Coming soon".
- Roles: Student and Admin/Teacher (header switch is demo-only; replace with real auth + roles).
- Test: timed, +4 / -1 / 0 marking, question palette, mark for review, auto-submit at 00:00.
- Results: score, accuracy, correct/incorrect/skipped, Botany vs Zoology, chapter bars, time per question, review table.
- Solution screen: Socratic chat (2-3 guiding questions, 2:00 attempt timer per question) beside a video panel. Video unlocks after the guided questions finish, the timer ends, or "Show me the answer". Paid users also get "Skip to video".
- Monetisation: Rs 100 per test unlocks all solutions and videos in that test. Free plan: 2 full explanations in total (`FREE_EXPLANATIONS` in `src/data.js`). Gating logic: `canExplain` / `openExplanation` in `src/store.jsx`.

## Layout
- `src/views/` Auth, Home, TestFlow (Instructions + TestRun), Result, Solution (Socratic + Video), Paywall, Profile, Admin
- `src/store.jsx` React context. Same action names as the prototype; every action goes through `src/backend/` (`mock.js` = offline localStorage, `remote.js` = Supabase). `USE_MOCK` in `src/config.js` picks one.
- `shared/rules.js` product constants used by browser, API and tests (free explanations, marks, timer). `supabase/migrations/*.sql` is the source of truth for the database; `supabase/seed.sql` is generated from `src/data.js` (`npm run gen:seed`).
- `dev/` local stack for development and tests only: PGlite (real Postgres + RLS) plus a small Supabase stand-in (`npm run dev:stack`). Never deploy it.
- `server/` Node API (Express). `app.js` routes, `tutor.js` tutor service, `claude.js` Anthropic wrapper, `auth.js` token check. Dependencies are injected so tests use PGlite and a fake Claude. `src/tutorDriver.js` + `src/api.js` are the browser side; `src/tutor.js` is only the offline mock helper.
- `src/ui.jsx` icons, modal, charts, loading and error states. `src/styles.css` design tokens (light + dark).

## Status
Work follows the 7-stage launch plan. Update this list in every stage.
1. **DONE: database and auth.** Migrations for profiles, questions (+ `question_secrets`), socratic_steps, tests, test_questions, attempts, attempt_answers, unlocks, free_explanation_uses, revision_items. RLS: students read published questions/tests and their own attempts; only teachers/admins write questions and tests; students cannot read correct answers, explanations or Socratic prompts. Scoring in `submit_attempt`. Phone OTP login. Store runs on Supabase or the offline mock.
2. **DONE: secure Claude tutor.** `server/` (Express): `POST /api/explain/open`, `/api/tutor/turn`, `/api/tutor/finish`, `/api/tutor/wrapup`, `GET /api/explain/:questionId`. Prompts built server-side from the DB (`shared/tutor-core.js`); replies validated and checked for answer leaks; scripted fallback with a 3-level hint ladder; per-student daily limit and token logging (`ai_usage`); server-held 2:00 timer (`tutor_sessions`, no chat content stored). Browser drivers: `src/tutorDriver.js` (api vs offline mock).
3. NEXT: free vs paid rules on the server (API checks + RLS). The core gate (`private.open_explanation`) already exists from stage 2; stage 3 hardens and tests it.
4. Videos: private bucket, 200 MB upload with progress, signed URLs.
5. Razorpay payments, webhook-only unlock, payment history, refund flag.
6. Admin: CSV import, diagram upload, real analytics.
7. Quality and launch: loading/error states, 390px layout, Hindi/Manipuri scaffolding, Playwright e2e, privacy policy, delete my data, parental consent, deploy.

## Decisions made while building (revisit if you disagree)
- `question_secrets` is a separate table because row-level security cannot hide columns. Everything a student must not see before the tutor session ends lives there or in `socratic_steps`.
- Question "Marks" input removed from the admin form: scoring is fixed +4 / -1 / 0 (product rule).
- In real mode the result review table does not show the correct option. It shows right/wrong/skipped (icon + text) and the answer appears with the explanation. Students can still see which of their picks were right, because that is the score.
- Attempts are created by `start_attempt` and scored by `submit_attempt`. A submission up to 5 minutes after the test duration is accepted (slow networks); later ones are refused.
- `node_modules/` was committed in the prototype; it is now untracked and git-ignored.

## Conventions
- Colours only from CSS tokens in `src/styles.css`; support light and dark.
- Real buttons and labels, 44px tap targets, visible focus. Never convey correct/incorrect by colour alone (icon + text).
- Sample numbers in admin are labelled "Sample data". Do not invent real-looking stats.
- Anything secret stays out of `VITE_*` variables. Student-facing tables get RLS; privileged writes go through SQL functions or the API.

## Commands
- `npm install`, `npm run dev` (http://localhost:5173), `npm run build` (normal bundle in `dist/`), `npm run build:single` (single-file `dist/index.html`)
- `npm test` (vitest: database/RLS tests with PGlite, backend integration tests), `npm run dev:stack` (local backend, see README)
