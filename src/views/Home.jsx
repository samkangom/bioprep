import { useApp } from '../store.jsx'
import { Icon, inr } from '../ui.jsx'
import { FREE_EXPLANATIONS } from '../data'

export default function Home() {
  const { user, tests, questions, attempts, isUnlocked, freeLeft, go, setPaywall } = useApp()
  const first = (user?.name || 'there').split(' ')[0]
  const botany = questions.filter((q) => q.subject === 'Botany' && q.status === 'published').length
  const zoology = questions.filter((q) => q.subject === 'Zoology' && q.status === 'published').length
  const last = (id) => attempts.find((a) => a.testId === id)

  return (
    <div className="wrap stack" style={{ gap: 24 }}>
      <div className="stack" style={{ gap: 6 }}>
        <span className="eyebrow">Your prep</span>
        <h1>Hello, {first}</h1>
      </div>

      <div className="banner">
        <span className="row" style={{ gap: 8 }}>
          <Icon n="bolt" />
          {freeLeft > 0
            ? <span><b>Free plan:</b> {freeLeft} of {FREE_EXPLANATIONS} full explanations left. Each one includes the guided questions and the video.</span>
            : <span><b>Free explanations used.</b> Unlock a test for {inr(100)} to open every solution and video in it.</span>}
        </span>
      </div>

      <section className="stack" aria-label="Subjects">
        <h2>Subjects</h2>
        <div className="grid c3">
          <div className="card subject lift">
            <div className="row between"><h3>Biology</h3><span className="pill primary">Live</span></div>
            <p className="muted small">Class 11 and 12 NCERT, NEET pattern.</p>
            <div className="chips">
              <span className="pill">Botany · {botany} questions</span>
              <span className="pill">Zoology · {zoology} questions</span>
            </div>
          </div>
          {['Physics', 'Chemistry'].map((s) => (
            <div className="card subject locked" key={s}>
              <div className="row between"><h3>{s}</h3><span className="pill accent"><Icon n="lock" s={14} />Coming soon</span></div>
              <p className="muted small">We are building this next.</p>
              <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={(e) => { e.currentTarget.textContent = 'We will let you know'; e.currentTarget.disabled = true }}>Notify me</button>
            </div>
          ))}
        </div>
      </section>

      <section className="stack" aria-label="Tests">
        <h2>Biology tests</h2>
        <div className="grid c3">
          {tests.filter((t) => t.published).map((t) => {
            const a = last(t.id)
            const un = isUnlocked(t.id)
            return (
              <article className="card stack" key={t.id}>
                <div className="row between">
                  <span className="pill">{t.kind}</span>
                  {un ? <span className="pill good"><Icon n="check" s={14} />Solutions unlocked</span> : <span className="pill accent">{inr(t.price)} for solutions</span>}
                </div>
                <h3>{t.title}</h3>
                <div className="row muted small" style={{ gap: 14 }}>
                  <span>{t.qids.length} questions</span><span className="row" style={{ gap: 4 }}><Icon n="clock" s={14} />{t.duration} min</span>
                </div>
                {a && <p className="small">Last score: <b className="num">{a.score}/{a.max}</b></p>}
                <div className="row" style={{ marginTop: 'auto' }}>
                  <button className="btn primary" onClick={() => go('instructions', { testId: t.id })}>{a ? 'Retake test' : 'Start test'}</button>
                  {a && <button className="btn" onClick={() => go('result', { attemptId: a.id })}>View result</button>}
                  {!un && <button className="btn ghost sm" onClick={() => setPaywall(t.id)}>Unlock</button>}
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}
