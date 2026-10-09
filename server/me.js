import { HttpError } from './tutor.js'

/**
 * Account endpoints for the signed-in student.
 *  GET    /api/me/export  everything we hold about them, as JSON (right of access)
 *  DELETE /api/me         erase the account and its data (right to erasure); body { confirm: "DELETE" }
 * Deleting the auth user cascades to profile, attempts, answers, unlocks, free uses, revision items, consent,
 * tutor sessions and usage rows. Payment rows are kept for accounting but detached from the person (user_id -> null).
 */
export function registerMe(app, ctx, { auth, limited, wrap }) {
  const { db } = ctx

  app.get('/api/me/export', auth, limited, wrap(async (req, res) => {
    const id = req.user.id
    const one = async (sql) => (await db.query(sql, [id])).rows
    const [profile] = await one('select id, name, phone, exam_year, birth_year, is_minor, language, role, created_at from public.profiles where id = $1')
    if (!profile) throw new HttpError(404, 'not_found')
    const out = {
      exported_at: new Date().toISOString(),
      profile,
      parental_consent: (await one('select guardian_name, guardian_phone, relationship, policy_version, consented_at from public.parental_consents where user_id = $1'))[0] || null,
      attempts: await one(`select a.id, t.title as test, a.started_at, a.submitted_at, a.correct, a.wrong, a.skipped, a.score, a.max_score,
          coalesce((select jsonb_agg(jsonb_build_object('question_id', aa.question_id, 'selected', aa.selected, 'is_correct', aa.is_correct, 'seconds', aa.time_seconds))
                    from public.attempt_answers aa where aa.attempt_id = a.id), '[]'::jsonb) as answers
        from public.attempts a join public.tests t on t.id = a.test_id where a.user_id = $1 order by a.started_at`),
      unlocks: await one('select test_id, source, created_at, revoked_at from public.unlocks where user_id = $1'),
      payments: await one('select razorpay_order_id, razorpay_payment_id, amount_paise, currency, status, method, created_at, paid_at, refunded_at from public.payments where user_id = $1 order by created_at'),
      free_explanations_used: await one('select question_id, created_at from public.free_explanation_uses where user_id = $1'),
      revision_list: await one('select question_id, created_at from public.revision_items where user_id = $1'),
      note: 'Tutor conversations are not stored. AI usage rows hold token counts only and are deleted after 90 days.',
    }
    res.set('Cache-Control', 'no-store').json(out)
  }))

  app.delete('/api/me', auth, limited, wrap(async (req, res) => {
    if (req.body?.confirm !== 'DELETE') throw new HttpError(400, 'confirm_required')
    if (!ctx.opts.deleteUser) throw new HttpError(503, 'not_configured')
    const { rows: [me] } = await db.query('select role from public.profiles where id = $1', [req.user.id])
    if (me?.role === 'admin') {
      const { rows: [c] } = await db.query(`select count(*)::int as n from public.profiles where role = 'admin'`)
      if (c.n <= 1) throw new HttpError(409, 'last_admin')
    }
    await ctx.opts.deleteUser(req.user.id)
    res.json({ deleted: true })
  }))
}
