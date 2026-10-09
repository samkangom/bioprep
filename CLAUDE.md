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
- `src/tutor.js` Claude Socratic tutor (prompts + calls) with a scripted keyword fallback. `server/` is the Claude proxy.
- `src/ui.jsx` icons, modal, donut and bar charts. `src/styles.css` design tokens (light + dark).

## Next steps, in order
1. **Backend + DB** (Supabase or Postgres + Node). Tables: users, questions, socratic_steps, tests, test_questions, attempts, attempt_answers, unlocks, free_explanation_uses. Replace the store actions with API calls and keep the same names.
2. **Real auth**: phone OTP (e.g. Firebase/MSG91). Roles `student`, `teacher`, `admin` enforced server-side. Never trust the client for unlock checks.
3. **Payments**: Razorpay (UPI + cards) for the Rs 100 per test unlock. Create an order on the server, verify the webhook, then insert into `unlocks`.
4. **Video storage**: upload MP4s to object storage (S3/R2/Supabase Storage), save the URL in `questions.video`. Serve with signed URLs, and only after the server confirms the user may open that explanation.
5. **Socratic tutor (Claude)**: DONE in the prototype. `src/tutor.js` builds the prompts and asks Claude for JSON `{verdict, reply, step, established, choices, done}` each turn, plus a wrap-up `{strength, gap, tip}`. In the published artifact it uses the page `sample` capability. Locally, `server/index.js` is a proxy that holds `ANTHROPIC_API_KEY` (set `VITE_API_URL`). **Before launch**: move prompt building to the server, send only `{questionId, messages}`, and look up the question and correct answer in the DB so secret answers never ship to the browser. Add auth and per-user quotas. The scripted keyword tutor stays as an offline fallback.
6. **Admin**: CSV import (columns: subject, chapter, difficulty, question, optA..optD, correct, ncert, explanation, ask1, keys1, hint1, ask2, keys2, hint2), image upload for question diagrams, real analytics from `attempts`.
7. **Localisation**: Hindi and Manipuri (language select in the header is a placeholder).
8. **Physics and Chemistry**: reuse the same schema; add a `subject` filter. Turn on the cards in `Home.jsx`.

## Conventions
- Colours only from CSS tokens in `src/styles.css`; support light and dark.
- Real buttons and labels, 44px tap targets, visible focus. Never convey correct/incorrect by colour alone (icon + text).
- Sample numbers in admin are labelled "Sample data". Do not invent real-looking stats.

## Commands
- `npm install`, `npm run dev` (http://localhost:5173), `npm run build` (single-file `dist/index.html`)
