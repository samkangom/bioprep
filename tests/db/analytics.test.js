import { describe, it, expect, beforeAll } from 'vitest'
import { bootDb, asRole, addUser } from '../../dev/pg.js'

let db, admin, teacher, student, tests
const as = (uid) => (fn) => asRole(db, { sub: uid }, fn)
const rpc = (uid, sql, params = []) => as(uid)((tx) => tx.query(`select ${sql} r`, params)).then((r) => r.rows[0].r)

async function attempt(uid, title, pick) { // pick(questionIdx, correctIdx) -> selected | undefined
  const tid = tests[title]
  const att = (await as(uid)((tx) => tx.query('select public.start_attempt($1) id', [tid]))).rows[0].id
  const qs = (await db.query('select tq.question_id id, s.correct from public.test_questions tq join public.question_secrets s using (question_id) where tq.test_id = $1 order by tq.position', [tid])).rows
  const answers = {}, times = {}
  qs.forEach((q, i) => { const a = pick(i, q.correct); if (a !== undefined) answers[q.id] = a; times[q.id] = 10 * (i + 1) })
  await as(uid)((tx) => tx.query('select public.submit_attempt($1, $2::jsonb, $3::jsonb)', [att, JSON.stringify(answers), JSON.stringify(times)]))
  return att
}

beforeAll(async () => {
  db = await bootDb({ seed: true })
  admin = await addUser(db, '919800020001', 'admin')
  teacher = await addUser(db, '919800020002', 'teacher')
  student = await addUser(db, '919800020003')
  tests = Object.fromEntries((await db.query('select id, title from public.tests')).rows.map((t) => [t.title, t.id]))
})

describe('admin analytics', () => {
  it('returns empty, honest results before any attempt', async () => {
    expect(await rpc(admin, 'public.admin_test_stats()')).toEqual([])
    expect(await rpc(admin, 'public.admin_question_stats(1, 10)')).toEqual([])
    expect(await rpc(admin, 'public.admin_revenue()')).toMatchObject({ gross_paise: 0, paid_count: 0, by_month: [] })
  })

  it('computes average score per test, hardest questions and time per question from real attempts', async () => {
    const s2 = await addUser(db, '919800020004')
    await attempt(student, 'Botany Sprint', (i, c) => c) // 5/5 -> 20
    await attempt(s2, 'Botany Sprint', (i, c) => (i < 2 ? c : (c + 1) % 4)) // 2 right, 3 wrong -> 8-3 = 5
    await attempt(student, 'Zoology Sprint', () => undefined) // all skipped -> 0

    const stats = await rpc(admin, 'public.admin_test_stats()')
    const bot = stats.find((t) => t.title === 'Botany Sprint')
    expect(bot).toMatchObject({ attempts: 2, students: 2, avg_score: 12.5, avg_max: 20, avg_pct: 62.5 })
    expect(stats.find((t) => t.title === 'Zoology Sprint')).toMatchObject({ attempts: 1, avg_score: 0 })
    expect(stats.find((t) => t.title === 'Biology Mock 1')).toBeUndefined() // no attempts, no row

    const qs = await rpc(admin, 'public.admin_question_stats(2, 50)')
    expect(qs).toHaveLength(5) // only Botany questions have >= 2 answers
    expect(qs[0].pct_correct).toBeLessThanOrEqual(qs[1].pct_correct) // hardest first
    const q1 = qs.find((q) => /reaction centre/.test(q.text))
    expect(q1).toMatchObject({ shown: 2, answered: 2, correct: 2, pct_correct: 100, avg_seconds: 10 })
    const q5 = qs.find((q) => /Bolting/.test(q.text))
    expect(q5).toMatchObject({ correct: 1, pct_correct: 50, avg_seconds: 50 })
    expect(await rpc(admin, 'public.admin_question_stats(3, 50)')).toEqual([]) // minimum answers filter
  })

  it('counts revenue from captured payments, net of refunds, by month', async () => {
    const t = tests['Botany Sprint']
    const mk = async (order, pay, status) => (await db.query(`insert into public.payments (user_id, test_id, amount_paise, razorpay_order_id, razorpay_payment_id, status, paid_at) values ($1, $2, 10000, $3, $4, $5, now()) returning id`, [student, t, order, pay, status])).rows[0].id
    await mk('o1', 'p1', 'paid'); await mk('o2', 'p2', 'paid'); await mk('o3', 'p3', 'refunded')
    await db.query(`insert into public.payments (user_id, test_id, amount_paise, razorpay_order_id, status) values ($1, $2, 10000, 'o4', 'created')`, [student, t])
    const r = await rpc(admin, 'public.admin_revenue()')
    expect(r).toMatchObject({ gross_paise: 30000, refunded_paise: 10000, paid_count: 3 })
    expect(r.by_month).toHaveLength(1)
    expect(r.by_month[0]).toMatchObject({ net_paise: 20000, count: 3 })
  })

  it('is staff-only, and revenue and users are admin-only', async () => {
    await expect(rpc(student, 'public.admin_test_stats()')).rejects.toThrow(/forbidden/)
    await expect(rpc(student, 'public.admin_overview()')).rejects.toThrow(/forbidden/)
    await expect(rpc(teacher, 'public.admin_revenue()')).rejects.toThrow(/forbidden/)
    await expect(rpc(teacher, 'public.admin_users()')).rejects.toThrow(/forbidden/)
    expect(await rpc(teacher, 'public.admin_test_stats()')).toHaveLength(2)
    const ov = await rpc(teacher, 'public.admin_overview()')
    expect(ov).toMatchObject({ tests: 3, questions: 10, students: null, active_unlocks: null })
    expect((await rpc(admin, 'public.admin_overview()')).students).toBe(2)
  })

  it('lists users with masked phone numbers; admin can grant a manual unlock and change roles', async () => {
    const users = await rpc(admin, 'public.admin_users()')
    const me = users.find((u) => u.id === student)
    expect(me.phone).toBe('9198xxxx0003')
    expect(me.attempts).toBe(2)
    await as(admin)((tx) => tx.query('select public.admin_grant_unlock($1, $2)', [student, tests['Zoology Sprint']]))
    expect((await rpc(admin, 'public.admin_users()')).find((u) => u.id === student).unlocked_tests).toBe(1)
    expect((await db.query(`select source from public.unlocks where user_id = $1`, [student])).rows[0].source).toBe('manual')
    await as(admin)((tx) => tx.query(`select public.admin_set_role($1, 'teacher')`, [student]))
    expect((await db.query('select role from public.profiles where id = $1', [student])).rows[0].role).toBe('teacher')
    await expect(as(admin)((tx) => tx.query(`select public.admin_set_role($1, 'student')`, [admin]))).rejects.toThrow(/own role/)
  })
})
