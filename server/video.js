import { HttpError, latestSession } from './tutor.js'

/**
 * POST /api/video-url { questionId } -> { url, expiresIn } | { url: null }
 * Allowed only when the student is entitled AND the tutor session allows it:
 *   - finished session (any access): the explanation, and so the video, is earned
 *   - paid test or staff: may skip to the video before the session ends ("Skip to video")
 * A free student mid-session gets 403. The URL is signed server-side and expires quickly.
 */
export async function videoUrl({ db, storage, videoTtl }, userId, questionId) {
  const s = await latestSession(db, userId, questionId)
  if (!s) throw new HttpError(403, 'not_allowed')
  let allowed = s.status === 'finished'
  if (!allowed && s.access === 'staff') allowed = true
  if (!allowed && s.access === 'paid') {
    const { rows } = await db.query('select private.has_paid_access($1, $2) as ok', [userId, questionId])
    allowed = rows[0].ok === true
  }
  if (!allowed) throw new HttpError(403, 'not_allowed')
  // A revoked unlock must not keep serving videos from an old finished session of a paid test.
  if (s.access === 'paid') {
    const { rows } = await db.query('select private.has_paid_access($1, $2) as ok', [userId, questionId])
    if (!rows[0].ok) throw new HttpError(403, 'not_allowed')
  }
  const { rows } = await db.query('select video_path from public.question_secrets where question_id = $1', [questionId])
  const path = rows[0]?.video_path
  if (!path) return { url: null }
  if (!storage) throw new HttpError(503, 'storage_unavailable')
  const ttl = videoTtl || 600
  return { url: await storage.signedUrl('videos', path, ttl), expiresIn: ttl }
}
