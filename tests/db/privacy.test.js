import { describe, it, expect, beforeAll } from 'vitest'
import { bootDb, asRole, addUser } from '../../dev/pg.js'
import { MIN_AGE, ageOn, RETENTION } from '../../src/privacy.js'

let db
const as = (uid) => (fn) => asRole(db, { sub: uid }, fn)
const years = (n) => { const d = new Date(); d.setFullYear(d.getFullYear() - n); d.setDate(d.getDate() - 2); return d.toISOString().slice(0, 10) }
const signup = (uid, args) => as(uid)((tx) => tx.query(
  'select public.complete_signup($1, $2, $3::date, $4, $5, $6, $7, $8)',
  [args.name ?? 'Asha', 2027, args.dob, args.gname ?? null, args.gphone ?? null, args.rel ?? null, args.consent ?? true, 'v1']))
const profile = async (uid) => (await db.query('select * from public.profiles where id = $1', [uid])).rows[0]
const rejects = async (p, re) => { let e; try { await p } catch (x) { e = x } expect(e, 'expected failure').toBeTruthy(); expect(String(e.message)).toMatch(re) }

beforeAll(async () => { db = await bootDb({ seed: true }) })

describe('sign-up, age and parental consent', () => {
  it('matches the age rules used by the browser', () => {
    expect(MIN_AGE).toBe(13)
    expect(ageOn('2000-06-15', new Date('2026-06-14T10:00:00'))).toBe(25)
    expect(ageOn('2000-06-15', new Date('2026-06-15T10:00:00'))).toBe(26)
  })

  it('an adult needs the policy tick only, stores birth YEAR not the date, and no consent record', async () => {
    const u = await addUser(db, '919800030001')
    await signup(u, { dob: years(19) })
    const p = await profile(u)
    expect(p).toMatchObject({ onboarded: true, is_minor: false, name: 'Asha' })
    expect(p.birth_year).toBe(new Date(years(19)).getFullYear())
    expect(Object.keys(p)).not.toContain('birth_date')
    expect((await db.query('select count(*)::int n from public.parental_consents where user_id = $1', [u])).rows[0].n).toBe(0)
  })

  it('a minor cannot finish sign-up without a complete guardian consent', async () => {
    const u = await addUser(db, '919800030002')
    await rejects(signup(u, { dob: years(16) }), /guardian_consent_required/)
    await rejects(signup(u, { dob: years(16), gname: 'Sita Devi', gphone: '12345', rel: 'mother' }), /guardian_consent_required/)
    await rejects(signup(u, { dob: years(16), gname: 'Sita Devi', gphone: '9822222222', rel: 'neighbour' }), /guardian_consent_required/)
    expect((await profile(u)).onboarded).toBe(false)
    await signup(u, { dob: years(16), gname: 'Sita Devi', gphone: '9822222222', rel: 'mother' })
    expect(await profile(u)).toMatchObject({ onboarded: true, is_minor: true })
    const [c] = (await as(u)((tx) => tx.query('select * from public.parental_consents'))).rows
    expect(c).toMatchObject({ guardian_name: 'Sita Devi', guardian_phone: '9822222222', relationship: 'mother', policy_version: 'v1' })
  })

  it('turning exactly 18 today is an adult; one day short is a minor', async () => {
    const d18 = new Date(); d18.setFullYear(d18.getFullYear() - 18)
    const a = await addUser(db, '919800030003'), b = await addUser(db, '919800030004')
    await signup(a, { dob: d18.toISOString().slice(0, 10) })
    expect((await profile(a)).is_minor).toBe(false)
    d18.setDate(d18.getDate() + 1)
    await rejects(signup(b, { dob: d18.toISOString().slice(0, 10) }), /guardian_consent_required/)
  })

  it('refuses under the minimum age, future dates, and a missing policy acceptance', async () => {
    const u = await addUser(db, '919800030005')
    await rejects(signup(u, { dob: years(12), gname: 'G G', gphone: '9822222222', rel: 'father' }), /too_young/)
    await rejects(signup(u, { dob: '2999-01-01' }), /invalid_birth_date/)
    await rejects(signup(u, { dob: years(20), consent: false }), /policy_consent_required/)
    await rejects(signup(u, { dob: years(20), name: '  ' }), /name_required/)
  })

  it('students cannot edit their consent, age flag or role directly', async () => {
    const u = await addUser(db, '919800030006')
    await signup(u, { dob: years(15), gname: 'Ram Lal', gphone: '9822222222', rel: 'father' })
    await rejects(as(u)((tx) => tx.query('update public.profiles set is_minor = false where id = $1', [u])), /permission denied/)
    await rejects(as(u)((tx) => tx.query('update public.profiles set birth_year = 1990 where id = $1', [u])), /permission denied/)
    await rejects(as(u)((tx) => tx.query(`update public.parental_consents set guardian_name = 'X'`)), /permission denied/)
    await rejects(as(u)((tx) => tx.query('delete from public.parental_consents')), /permission denied/)
  })
})

describe('retention and erasure', () => {
  it('purges old tutor sessions, AI usage, abandoned attempts and webhook ids; keeps recent ones', async () => {
    const u = await addUser(db, '919800030010')
    const tid = (await db.query(`select id from public.tests limit 1`)).rows[0].id
    const qid = (await db.query(`select question_id from public.test_questions where test_id = $1 limit 1`, [tid])).rows[0].question_id
    const old = `now() - interval '${RETENTION.tutorSessionsDays + 1} days'`
    await db.query(`insert into public.tutor_sessions (user_id, question_id, test_id, access, status, finish_reason, started_at) values ($1, $2, $3, 'free', 'finished', 'skip', ${old})`, [u, qid, tid])
    await db.query(`insert into public.tutor_sessions (user_id, question_id, test_id, access) values ($1, $2, $3, 'free')`, [u, qid, tid])
    await db.query(`insert into public.ai_usage (user_id, kind, source, created_at) values ($1, 'turn', 'claude', now() - interval '${RETENTION.aiUsageDays + 1} days'), ($1, 'turn', 'claude', now())`, [u])
    await db.query(`insert into public.attempts (user_id, test_id, started_at) values ($1, $2, now() - interval '${RETENTION.abandonedAttemptsDays + 1} days'), ($1, $2, now())`, [u, tid])
    await db.query(`insert into public.payment_events (event_id, event_type, created_at) values ('old', 'x', now() - interval '61 days'), ('new', 'x', now())`)
    const r = (await db.query('select public.purge_old_data() r')).rows[0].r
    expect(r).toEqual({ tutor_sessions: 1, ai_usage: 1, abandoned_attempts: 1, payment_events: 1 })
    expect((await db.query('select count(*)::int n from public.tutor_sessions where user_id = $1', [u])).rows[0].n).toBe(1)
    await rejects(as(u)((tx) => tx.query('select public.purge_old_data()')), /permission denied/)
  })

  it('deleting the auth user erases everything personal and keeps payments as anonymous accounting rows', async () => {
    const u = await addUser(db, '919800030011')
    await signup(u, { dob: years(15), gname: 'Ram Lal', gphone: '9822222222', rel: 'father' })
    const tid = (await db.query(`select id from public.tests where title = 'Botany Sprint'`)).rows[0].id
    const att = (await as(u)((tx) => tx.query('select public.start_attempt($1) id', [tid]))).rows[0].id
    await as(u)((tx) => tx.query(`select public.submit_attempt($1, '{}', '{}')`, [att]))
    const qid = (await db.query(`select question_id from public.test_questions where test_id = $1 limit 1`, [tid])).rows[0].question_id
    await db.query('select private.open_explanation($1, $2, $3)', [u, att, qid])
    await db.query('insert into public.revision_items (user_id, question_id) values ($1, $2)', [u, qid])
    await db.query('insert into public.ai_usage (user_id, kind, source) values ($1, $2, $3)', [u, 'turn', 'claude'])
    const pay = (await db.query(`insert into public.payments (user_id, test_id, amount_paise, razorpay_order_id, razorpay_payment_id, status, paid_at) values ($1, $2, 10000, 'order_gone', 'pay_gone', 'paid', now()) returning id`, [u, tid])).rows[0].id
    await db.query('insert into public.unlocks (user_id, test_id, payment_id) values ($1, $2, $3)', [u, tid, pay])

    await db.query('delete from auth.users where id = $1', [u])
    for (const t of ['profiles:id', 'attempts:user_id', 'unlocks:user_id', 'free_explanation_uses:user_id', 'revision_items:user_id', 'parental_consents:user_id', 'tutor_sessions:user_id', 'ai_usage:user_id']) {
      const [table, col] = t.split(':')
      expect((await db.query(`select count(*)::int n from public.${table} where ${col} = $1`, [u])).rows[0].n, table).toBe(0)
    }
    expect((await db.query('select count(*)::int n from public.attempt_answers where attempt_id = $1', [att])).rows[0].n).toBe(0)
    const [p] = (await db.query('select user_id, status, amount_paise from public.payments where id = $1', [pay])).rows
    expect(p).toEqual({ user_id: null, status: 'paid', amount_paise: 10000 })
  })
})
