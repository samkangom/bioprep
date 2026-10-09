// Privacy policy facts shared by the sign-up form, the policy page and the API/DB rules.
// Bump POLICY_VERSION whenever the policy text changes in a way that needs fresh consent.
export const POLICY_VERSION = '2026-10-09'
export const MIN_AGE = 13 // keep equal to the check in complete_signup (supabase/migrations/..._privacy_consent.sql)
export const ADULT_AGE = 18

export const ageOn = (isoDate, now = new Date()) => {
  const d = new Date(isoDate + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
  return age
}

const env = import.meta.env || {}
export const COMPANY = env.VITE_COMPANY_NAME || 'BioPrep'
export const SUPPORT_EMAIL = env.VITE_SUPPORT_EMAIL || ''

// Retention periods, mirrored by public.purge_old_data().
export const RETENTION = { tutorSessionsDays: 30, aiUsageDays: 90, abandonedAttemptsDays: 7 }
