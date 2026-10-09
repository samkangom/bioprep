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

See `CLAUDE.md` for product rules and the build-out plan to use with Claude Code.

## Claude-powered Socratic tutor locally
```bash
cd server && npm install && ANTHROPIC_API_KEY=sk-ant-... npm start   # :8787
cd .. && cp .env.example .env.local && npm run dev
```
Without `VITE_API_URL` the app uses the built-in scripted tutor.
