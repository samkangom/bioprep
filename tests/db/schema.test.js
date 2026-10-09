import { describe, it, expect, beforeAll } from 'vitest'
import { bootDb, asRole, addUser } from '../../dev/pg.js'
import { buildSeed } from '../../scripts/gen-seed.mjs'
import { FREE_EXPLANATIONS, TUTOR_SECONDS } from '../../shared/rules.js'
import fs from 'node:fs'

let db, student, student2, teacher, admin
const q = (tx, sql, params) => tx.query(sql, params).then((r) => r.rows)

beforeAll(async () => {
  db = await bootDb({ seed: true })
  student = await addUser(db, '919800000001')
  student2 = await addUser(db, '919800000002')
  teacher = await addUser(db, '919800000003', 'teacher')
  admin = await addUser(db, '919800000004', 'admin')
})

const as = (uid) => (fn) => asRole(db, uid ? { sub: uid } : null, fn)
const rejects = async (p, re) => {
  let err
  try { await p } catch (e) { err = e }
  expect(err, 'expected the statement to fail').toBeTruthy()
  if (re) expect(String(err.message)).toMatch(re)
}

describe('migrations and seed', () => {
  it('seed.sql is up to date with src/data.js', () => {
    expect(fs.readFileSync('supabase/seed.sql', 'utf8')).toBe(buildSeed())
  })
  it('seeds 10 questions, 3 tests and a profile per auth user', async () => {
    const c = async (t) => Number((await db.query(`select count(*) n from public.${t}`)).rows[0].n)
    expect(await c('questions')).toBe(10)
    expect(await c('question_secrets')).toBe(10)
    expect(await c('socratic_steps')).toBe(20)
    expect(await c('tests')).toBe(3)
    expect(await c('profiles')).toBe(4)
  })
  it('keeps the free-explanation limit in sync with shared/rules.js', async () => {
    const { rows } = await db.query('select private.free_explanation_limit() n')
    expect(rows[0].n).toBe(FREE_EXPLANATIONS)
    expect((await db.query('select private.tutor_seconds() n')).rows[0].n).toBe(TUTOR_SECONDS)
  })
})

describe('row-level security: reading', () => {
  it('anonymous users can read nothing', async () => {
    await rejects(as(null)((tx) => q(tx, 'select * from public.questions')), /permission denied/)
    await rejects(as(null)((tx) => q(tx, 'select * from public.tests')), /permission denied/)
  })
  it('students read published questions and tests only', async () => {
    await db.query(`insert into public.questions (subject, chapter, text, options, status) values ('Botany','x','Draft?', '["a","b","c","d"]', 'draft')`)
    await db.query(`insert into public.tests (title, published) values ('Hidden test', false)`)
    const qs = await as(student)((tx) => q(tx, 'select text, status from public.questions'))
    expect(qs).toHaveLength(10)
    expect(qs.every((r) => r.status === 'published')).toBe(true)
    const ts = await as(student)((tx) => q(tx, 'select title from public.tests'))
    expect(ts.map((t) => t.title).sort()).toEqual(['Biology Mock 1', 'Botany Sprint', 'Zoology Sprint'])
  })
  it('students cannot read correct answers, explanations or Socratic prompts', async () => {
    expect(await as(student)((tx) => q(tx, 'select * from public.question_secrets'))).toHaveLength(0)
    expect(await as(student)((tx) => q(tx, 'select * from public.socratic_steps'))).toHaveLength(0)
    expect(await as(teacher)((tx) => q(tx, 'select * from public.question_secrets'))).toHaveLength(10)
  })
  it('students see the questions of published tests only', async () => {
    const hidden = (await db.query(`select id from public.tests where title='Hidden test'`)).rows[0].id
    await db.query(`insert into public.test_questions (test_id, question_id, position) select $1, id, 1 from public.questions limit 1`, [hidden])
    const tq = await as(student)((tx) => q(tx, 'select distinct test_id from public.test_questions'))
    expect(tq.some((r) => r.test_id === hidden)).toBe(false)
  })
  it('profiles: you see your own row, admins see all, nobody else does', async () => {
    expect(await as(student)((tx) => q(tx, 'select id from public.profiles'))).toHaveLength(1)
    expect(await as(teacher)((tx) => q(tx, 'select id from public.profiles'))).toHaveLength(1)
    expect(await as(admin)((tx) => q(tx, 'select id from public.profiles'))).toHaveLength(4)
  })
})

describe('row-level security: writing', () => {
  it('students cannot write questions, tests or secrets', async () => {
    await rejects(as(student)((tx) => tx.query(`insert into public.questions (subject, chapter, text, options) values ('Botany','x','y','["a","b","c","d"]')`)), /row-level security/)
    await rejects(as(student)((tx) => tx.query(`insert into public.tests (title) values ('mine')`)), /row-level security/)
    expect((await as(student)((tx) => tx.query(`update public.questions set text = 'hacked'`))).affectedRows).toBe(0)
    await rejects(as(student)((tx) => tx.query(`update public.question_secrets set correct = 0`)).then((r) => { if (!r.affectedRows) throw new Error('no rows') }), /no rows/)
  })
  it('students cannot make themselves staff', async () => {
    await rejects(as(student)((tx) => tx.query(`update public.profiles set role = 'admin' where id = $1`, [student])), /permission denied/)
    await rejects(as(student)((tx) => tx.query(`select public.admin_set_role($1, 'admin')`, [student])), /forbidden/)
  })
  it('students cannot create unlocks or attempts directly', async () => {
    const t = (await db.query(`select id from public.tests limit 1`)).rows[0].id
    await rejects(as(student)((tx) => tx.query(`insert into public.unlocks (user_id, test_id) values ($1, $2)`, [student, t])), /permission denied/)
    await rejects(as(student)((tx) => tx.query(`insert into public.attempts (user_id, test_id, score) values ($1, $2, 999)`, [student, t])), /permission denied/)
    await rejects(as(student)((tx) => tx.query(`delete from public.unlocks`)), /permission denied/)
  })
  it('teachers and admins can write through the RPCs; students and anon cannot call them', async () => {
    const payload = { subject: 'Botany', chapter: 'Cell Cycle', text: 'Teacher Q', options: ['a', 'b', 'c', 'd'], correct: 2, explanation: 'because', status: 'draft' }
    await rejects(as(student)((tx) => tx.query('select public.admin_upsert_question($1::jsonb)', [JSON.stringify(payload)])), /forbidden/)
    await rejects(as(null)((tx) => tx.query('select public.admin_upsert_question($1::jsonb)', [JSON.stringify(payload)])), /permission denied/)
    const id = (await as(teacher)((tx) => q(tx, 'select public.admin_upsert_question($1::jsonb) id', [JSON.stringify(payload)])))[0].id
    expect(id).toBeTruthy()
    const full = (await as(teacher)((tx) => q(tx, 'select public.admin_get_question($1) j', [id])))[0].j
    expect(full.correct).toBe(2)
    await rejects(as(student)((tx) => tx.query('select public.admin_get_question($1)', [id])), /forbidden/)
  })
  it('refuses to publish an incomplete question or a test with draft questions', async () => {
    const bad = { subject: 'Botany', chapter: 'c', text: 't', options: ['a', 'b', 'c', 'd'], correct: 0, explanation: 'e', status: 'published', socratic: [{ ask: 'one?' }] }
    await rejects(as(teacher)((tx) => tx.query('select public.admin_upsert_question($1::jsonb)', [JSON.stringify(bad)])), /two guiding questions/)
    const draft = (await db.query(`select id from public.questions where status = 'draft' limit 1`)).rows[0].id
    await rejects(as(teacher)((tx) => tx.query('select public.admin_upsert_test($1::jsonb)', [JSON.stringify({ title: 'T', published: true, qids: [draft] })])), /must be published/)
  })
  it('a staff-built test keeps question order', async () => {
    const ids = (await db.query(`select id from public.questions where status = 'published' order by text limit 3`)).rows.map((r) => r.id)
    const tid = (await as(teacher)((tx) => q(tx, 'select public.admin_upsert_test($1::jsonb) id', [JSON.stringify({ title: 'Ordered', published: true, duration: 3, price: 50, qids: [ids[2], ids[0], ids[1]] })])))[0].id
    const rows = await as(student)((tx) => q(tx, 'select question_id from public.test_questions where test_id = $1 order by position', [tid]))
    expect(rows.map((r) => r.question_id)).toEqual([ids[2], ids[0], ids[1]])
  })
})

describe('attempts and scoring', () => {
  const sprint = async () => (await db.query(`select id from public.tests where title = 'Zoology Sprint'`)).rows[0].id
  const secrets = async (tid) => (await db.query(`select tq.question_id id, s.correct from public.test_questions tq join public.question_secrets s using (question_id) where tq.test_id = $1 order by tq.position`, [tid])).rows

  it('scores +4 / -1 / 0 on the server', async () => {
    const tid = await sprint()
    const sec = await secrets(tid)
    const att = (await as(student)((tx) => q(tx, 'select public.start_attempt($1) id', [tid])))[0].id
    // 3 right, 1 wrong, 1 skipped
    const answers = { [sec[0].id]: sec[0].correct, [sec[1].id]: sec[1].correct, [sec[2].id]: sec[2].correct, [sec[3].id]: (sec[3].correct + 1) % 4 }
    const times = { [sec[0].id]: 12, [sec[1].id]: 30.4, [sec[2].id]: 'junk' }
    const res = (await as(student)((tx) => q(tx, 'select public.submit_attempt($1, $2::jsonb, $3::jsonb) r', [att, JSON.stringify(answers), JSON.stringify(times)])))[0].r
    expect(res).toMatchObject({ correct: 3, wrong: 1, skipped: 1, score: 11, max: 20 })
    const rows = await as(student)((tx) => q(tx, 'select question_id, selected, is_correct, time_seconds from public.attempt_answers where attempt_id = $1', [att]))
    expect(rows).toHaveLength(5)
    expect(rows.find((r) => r.question_id === sec[1].id).time_seconds).toBe(30)
    expect(rows.find((r) => r.question_id === sec[2].id).time_seconds).toBe(0)
    expect(rows.find((r) => r.question_id === sec[4].id).selected).toBeNull()
  })
  it('ignores out-of-range answers and is idempotent on double submit', async () => {
    const tid = await sprint()
    const sec = await secrets(tid)
    const att = (await as(student)((tx) => q(tx, 'select public.start_attempt($1) id', [tid])))[0].id
    const answers = { [sec[0].id]: 9, [sec[1].id]: -1, [sec[2].id]: 'x' }
    const a = (await as(student)((tx) => q(tx, 'select public.submit_attempt($1, $2::jsonb, $3::jsonb) r', [att, JSON.stringify(answers), '{}'])))[0].r
    const b = (await as(student)((tx) => q(tx, 'select public.submit_attempt($1, $2::jsonb, $3::jsonb) r', [att, JSON.stringify({ [sec[0].id]: sec[0].correct }), '{}'])))[0].r
    expect(a).toMatchObject({ correct: 0, wrong: 0, skipped: 5, score: 0 })
    expect(b.score).toBe(0)
  })
  it("another student cannot submit or read someone else's attempt", async () => {
    const tid = await sprint()
    const att = (await as(student)((tx) => q(tx, 'select public.start_attempt($1) id', [tid])))[0].id
    await rejects(as(student2)((tx) => tx.query(`select public.submit_attempt($1, '{}', '{}')`, [att])), /attempt_not_found/)
    expect(await as(student2)((tx) => q(tx, 'select * from public.attempts where id = $1', [att]))).toHaveLength(0)
    expect(await as(student)((tx) => q(tx, 'select * from public.attempts where id = $1', [att]))).toHaveLength(1)
  })
  it('rejects a submission long after the test duration', async () => {
    const tid = await sprint()
    const att = (await as(student)((tx) => q(tx, 'select public.start_attempt($1) id', [tid])))[0].id
    await db.query(`update public.attempts set started_at = now() - interval '20 minutes' where id = $1`, [att])
    await rejects(as(student)((tx) => tx.query(`select public.submit_attempt($1, '{}', '{}')`, [att])), /attempt_expired/)
  })
  it('cannot start an attempt on an unpublished test', async () => {
    const hidden = (await db.query(`select id from public.tests where title='Hidden test'`)).rows[0].id
    await rejects(as(student)((tx) => tx.query('select public.start_attempt($1)', [hidden])), /test_not_found/)
  })
})

describe('free explanations', () => {
  it('allows only questions you attempted, only for yourself, and only two in total', async () => {
    const tid = (await db.query(`select id from public.tests where title = 'Botany Sprint'`)).rows[0].id
    const qids = (await db.query(`select question_id from public.test_questions where test_id = $1 order by position`, [tid])).rows.map((r) => r.question_id)
    const s3 = await addUser(db, '919800000009')
    const ins = (uid, qid) => as(uid)((tx) => tx.query('insert into public.free_explanation_uses (user_id, question_id) values ($1, $2)', [uid, qid]))
    await rejects(ins(s3, qids[0]), /row-level security/) // not attempted yet
    const att = (await as(s3)((tx) => q(tx, 'select public.start_attempt($1) id', [tid])))[0].id
    await as(s3)((tx) => tx.query(`select public.submit_attempt($1, '{}', '{}')`, [att]))
    await rejects(as(s3)((tx) => tx.query('insert into public.free_explanation_uses (user_id, question_id) values ($1, $2)', [student, qids[0]])), /row-level security/)
    await ins(s3, qids[0])
    await ins(s3, qids[1])
    await rejects(ins(s3, qids[2]), /free_limit_reached/)
    // even a privileged connection cannot exceed the cap
    await rejects(db.query('insert into public.free_explanation_uses (user_id, question_id) values ($1, $2)', [s3, qids[3]]), /free_limit_reached/)
    expect(await as(s3)((tx) => q(tx, 'select * from public.free_explanation_uses'))).toHaveLength(2)
  })
})

describe('entitlement rules below the API', () => {
  const explain = (uid, att, qid) => db.query('select private.open_explanation($1, $2, $3) r', [uid, att, qid]).then((r) => r.rows[0].r)
  async function submitted(uid, title) {
    const tid = (await db.query('select id from public.tests where title = $1', [title])).rows[0].id
    const att = (await as(uid)((tx) => q(tx, 'select public.start_attempt($1) id', [tid])))[0].id
    await as(uid)((tx) => tx.query(`select public.submit_attempt($1, '{}', '{}')`, [att]))
    const qids = (await db.query('select question_id from public.test_questions where test_id = $1 order by position', [tid])).rows.map((r) => r.question_id)
    return { tid, att, qids }
  }

  it('gives two free explanations in total across tests, then refuses', async () => {
    const u = await addUser(db, '919800010001')
    const bot = await submitted(u, 'Botany Sprint')
    const zoo = await submitted(u, 'Zoology Sprint')
    expect((await explain(u, bot.att, bot.qids[0])).access).toBe('free')
    expect((await explain(u, zoo.att, zoo.qids[0])).free_left).toBe(0)
    await rejects(explain(u, bot.att, bot.qids[1]), /paywall/)
    // already-spent questions stay open
    expect((await explain(u, bot.att, bot.qids[0])).access).toBe('free')
    expect((await db.query('select count(*)::int n from public.free_explanation_uses where user_id = $1', [u])).rows[0].n).toBe(2)
  })

  it('an unlock covers every question of that test only', async () => {
    const u = await addUser(db, '919800010002')
    const bot = await submitted(u, 'Botany Sprint')
    const zoo = await submitted(u, 'Zoology Sprint')
    await db.query('insert into public.unlocks (user_id, test_id) values ($1, $2)', [u, bot.tid])
    for (const qid of bot.qids) expect((await explain(u, bot.att, qid)).access).toBe('paid')
    expect((await db.query('select count(*)::int n from public.free_explanation_uses where user_id = $1', [u])).rows[0].n).toBe(0)
    // Zoology is not unlocked: free slots apply
    expect((await explain(u, zoo.att, zoo.qids[0])).access).toBe('free')
    expect((await explain(u, zoo.att, zoo.qids[1])).access).toBe('free')
    await rejects(explain(u, zoo.att, zoo.qids[2]), /paywall/)
  })

  it('a revoked unlock stops paid access', async () => {
    const u = await addUser(db, '919800010003')
    const bot = await submitted(u, 'Botany Sprint')
    await db.query('insert into public.unlocks (user_id, test_id) values ($1, $2)', [u, bot.tid])
    expect((await explain(u, bot.att, bot.qids[0])).access).toBe('paid')
    await db.query('update public.unlocks set revoked_at = now() where user_id = $1', [u])
    expect((await db.query('select private.has_paid_access($1, $2) b', [u, bot.qids[0]])).rows[0].b).toBe(false)
  })

  it('needs a submitted attempt of the same user that contained the question', async () => {
    const u = await addUser(db, '919800010004')
    const v = await addUser(db, '919800010005')
    const bot = await submitted(u, 'Botany Sprint')
    const zoo = await submitted(u, 'Zoology Sprint')
    await rejects(explain(v, bot.att, bot.qids[0]), /attempt_not_found/)
    await rejects(explain(u, bot.att, zoo.qids[0]), /question_not_in_attempt/)
    const tid = bot.tid
    const open = (await as(u)((tx) => q(tx, 'select public.start_attempt($1) id', [tid])))[0].id // never submitted
    await rejects(explain(u, open, bot.qids[0]), /attempt_not_found/)
  })

  it('concurrent opens cannot exceed the free limit', async () => {
    const u = await addUser(db, '919800010006')
    const bot = await submitted(u, 'Botany Sprint')
    const results = await Promise.allSettled(bot.qids.map((qid) => explain(u, bot.att, qid)))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2)
    expect((await db.query('select count(*)::int n from public.free_explanation_uses where user_id = $1', [u])).rows[0].n).toBe(2)
  })

  it('staff preview explanations without spending free slots', async () => {
    const bot = await submitted(teacher, 'Botany Sprint')
    for (const qid of bot.qids) expect((await explain(teacher, bot.att, qid)).access).toBe('staff')
    expect((await db.query('select count(*)::int n from public.free_explanation_uses where user_id = $1', [teacher])).rows[0].n).toBe(0)
  })

  it('clients cannot write entitlement or session tables, and cannot read other users', async () => {
    const u = await addUser(db, '919800010007')
    const other = await addUser(db, '919800010008')
    const bot = await submitted(other, 'Botany Sprint')
    await explain(other, bot.att, bot.qids[0])
    await rejects(as(u)((tx) => tx.query('update public.free_explanation_uses set user_id = $1', [u])), /permission denied/)
    await rejects(as(u)((tx) => tx.query('delete from public.free_explanation_uses')), /permission denied/)
    await rejects(as(u)((tx) => tx.query('insert into public.tutor_sessions (user_id, question_id, test_id, access) values ($1, $2, $3, $4)', [u, bot.qids[0], bot.tid, 'paid'])), /permission denied/)
    await rejects(as(u)((tx) => tx.query('update public.tutor_sessions set status = $1', ['finished'])), /permission denied/)
    await rejects(as(u)((tx) => tx.query('select private.open_explanation($1, $2, $3)', [u, bot.att, bot.qids[0]])), /permission denied/)
    expect(await as(u)((tx) => q(tx, 'select * from public.tutor_sessions'))).toHaveLength(0)
    expect(await as(u)((tx) => q(tx, 'select * from public.free_explanation_uses'))).toHaveLength(0)
    expect(await as(u)((tx) => q(tx, 'select * from public.ai_usage'))).toHaveLength(0)
  })

  it('my_entitlements reports only your own state', async () => {
    const u = await addUser(db, '919800010009')
    const bot = await submitted(u, 'Botany Sprint')
    await explain(u, bot.att, bot.qids[0])
    await db.query('insert into public.unlocks (user_id, test_id) values ($1, $2)', [u, bot.tid])
    const e = (await as(u)((tx) => q(tx, 'select public.my_entitlements() e')))[0].e
    expect(e).toMatchObject({ free_limit: 2, free_used: 1, unlocked_tests: [bot.tid] })
  })
})
