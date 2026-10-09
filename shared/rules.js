// Product rules shared by the browser, the API and the tests. Keep in sync with the SQL in supabase/migrations
// (tests/db/rules.test.js fails if they drift apart).
export const APP_NAME = 'BioPrep'
export const UNLOCK_PRICE = 100 // Rs per test
export const FREE_EXPLANATIONS = 2 // free plan: total full explanations (Socratic session + video)
export const MARKS = { correct: 4, wrong: -1 }
export const TUTOR_SECONDS = 120 // attempt timer per question
export const TUTOR_MAX_TURNS = 5 // the tutor wraps up at student message 5 at the latest
export const MAX_HINTS = 3
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024
