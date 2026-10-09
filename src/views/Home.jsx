import { useApp } from '../store.jsx'
import { Icon, inr } from '../ui.jsx'
import { FREE_EXPLANATIONS } from '../data'

export default function Home() {
  const { user, tests, questions, attempts, isUnlocked, freeLeft, go, setPaywall, t } = useApp()
  const first = (user?.name || '').split(' ')[0]
  const botany = questions.filter((q) => q.subject === 'Botany' && q.status === 'published').length
  const zoology = questions.filter((q) => q.subject === 'Zoology' && q.status === 'published').length
  const last = (id) => attempts.find((a) => a.testId === id)

  return (
    <div className="wrap stack" style={{ gap: 24 }}>
      <div className="stack" style={{ gap: 6 }}>
        <span className="eyebrow">{t('home.eyebrow')}</span>
        <h1>{t('home.hello', { name: first })}</h1>
      </div>

      <div className="banner">
        <span className="row" style={{ gap: 8 }}>
          <Icon n="bolt" />
          {freeLeft > 0
            ? <span>{t('home.freePlan', { left: freeLeft, total: FREE_EXPLANATIONS })}</span>
            : <span>{t('home.freeUsed', { price: inr(100) })}</span>}
        </span>
      </div>

      <section className="stack" aria-label="Subjects">
        <h2>{t('home.subjects')}</h2>
        <div className="grid c3">
          <div className="card subject lift">
            <div className="row between"><h3>{t('home.biology')}</h3><span className="pill primary">{t('home.live')}</span></div>
            <p className="muted small">{t('home.ncert')}</p>
            <div className="chips">
              <span className="pill">{t('home.botany', { n: botany })}</span>
              <span className="pill">{t('home.zoology', { n: zoology })}</span>
            </div>
          </div>
          {['Physics', 'Chemistry'].map((s) => (
            <div className="card subject locked" key={s}>
              <div className="row between"><h3>{s}</h3><span className="pill accent"><Icon n="lock" s={14} />{t('home.comingSoon')}</span></div>
              <p className="muted small">{t('home.building')}</p>
              <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={(e) => { e.currentTarget.textContent = t('home.notified'); e.currentTarget.disabled = true }}>{t('home.notify')}</button>
            </div>
          ))}
        </div>
      </section>

      <section className="stack" aria-label="Tests">
        <h2>{t('home.tests')}</h2>
        <div className="grid c3">
          {tests.filter((x) => x.published).map((tt) => {
            const a = last(tt.id)
            const un = isUnlocked(tt.id)
            return (
              <article className="card stack" key={tt.id}>
                <div className="row between">
                  <span className="pill">{tt.kind}</span>
                  {un ? <span className="pill good"><Icon n="check" s={14} />{t('home.unlocked')}</span> : <span className="pill accent">{t('home.forSolutions', { price: inr(tt.price) })}</span>}
                </div>
                <h3>{tt.title}</h3>
                <div className="row muted small" style={{ gap: 14 }}>
                  <span>{t('home.questions', { n: tt.qids.length })}</span><span className="row" style={{ gap: 4 }}><Icon n="clock" s={14} />{t('home.minutes', { n: tt.duration })}</span>
                </div>
                {a && <p className="small">{t('home.lastScore', { score: `${a.score}/${a.max}` })}</p>}
                <div className="row" style={{ marginTop: 'auto' }}>
                  <button className="btn primary" onClick={() => go('instructions', { testId: tt.id })}>{a ? t('home.retake') : t('home.startTest')}</button>
                  {a && <button className="btn" onClick={() => go('result', { attemptId: a.id })}>{t('home.viewResult')}</button>}
                  {!un && <button className="btn ghost sm" onClick={() => setPaywall(tt.id)}>{t('home.unlock')}</button>}
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}
