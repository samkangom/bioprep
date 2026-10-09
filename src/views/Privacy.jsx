import { useApp } from '../store.jsx'
import { Icon } from '../ui.jsx'
import { COMPANY, SUPPORT_EMAIL, RETENTION, MIN_AGE, POLICY_VERSION } from '../privacy'

// Plain-language privacy policy. Have it reviewed by a lawyer before launch (see docs/LAUNCH.md): in particular the
// retention of payment records, the grievance contact and the parental-consent method.
export default function Privacy() {
  const { go, user } = useApp()
  const contact = SUPPORT_EMAIL ? <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> : 'the support contact shown in the app'
  const H = ({ children }) => <h2 style={{ fontSize: 20, marginTop: 8 }}>{children}</h2>
  return (
    <div className="wrap narrow stack" style={{ gap: 14 }}>
      <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => { if (window.history.length > 1 && !user) window.close(); go('home') }}><Icon n="back" s={16} />Back</button>
      <span className="eyebrow">Version {POLICY_VERSION}</span>
      <h1>Privacy policy</h1>
      <p>{COMPANY} helps students prepare for NEET (UG) Biology with timed tests and guided explanations. This page says what we collect, why, who sees it, how long we keep it, and how to delete it. We try to collect as little as we can.</p>

      <H>What we collect</H>
      <ul className="stack" style={{ gap: 6, paddingLeft: 20, margin: 0 }}>
        <li><b>Your account:</b> mobile number (to sign you in with a one-time code), name, NEET year, language and birth year. We use your date of birth only to work out your age and then keep just the year.</li>
        <li><b>Your prep:</b> the tests you take, your answers, scores and time per question, questions you save to revise, and which tests you have unlocked.</li>
        <li><b>Payments:</b> when you unlock a test, Razorpay takes the payment. We receive the order and payment ids, amount and status. We never see or store your card or UPI details.</li>
        <li><b>Tutor sessions:</b> to answer you, the tutor sends your short messages to our AI provider (Anthropic) together with the question. <b>We do not store the conversation.</b> We keep only counts (turns, hints and token numbers) so we can apply limits and costs.</li>
      </ul>

      <H>Why we use it</H>
      <p>To sign you in, score your tests, show your results, let you open explanations and videos you are entitled to, take payment, keep the service safe from abuse (for example daily limits), and fix problems. We do not sell your data and we do not show advertising.</p>

      <H>Students under 18</H>
      <p>You must be at least {MIN_AGE}. If you are under 18, a parent or legal guardian has to agree when you sign up. We keep their name, mobile number, relationship and the time they agreed, only as a record of that consent. We do not profile children for advertising or send marketing to them. Anyone aged under 18 (or their guardian) can ask us to delete the account at any time.</p>

      <H>Who handles your data for us</H>
      <ul className="stack" style={{ gap: 6, paddingLeft: 20, margin: 0 }}>
        <li>Supabase: database, sign-in and file storage.</li>
        <li>Anthropic: the AI tutor (messages for the current question only).</li>
        <li>Razorpay: payments.</li>
        <li>An SMS provider: delivering your one-time code.</li>
        <li>Our web and server hosts.</li>
      </ul>
      <p>These providers may process data outside India. They act on our instructions.</p>

      <H>How long we keep it</H>
      <ul className="stack" style={{ gap: 6, paddingLeft: 20, margin: 0 }}>
        <li>Tutor session counters: {RETENTION.tutorSessionsDays} days. AI usage counts: {RETENTION.aiUsageDays} days.</li>
        <li>Tests you started but never submitted: {RETENTION.abandonedAttemptsDays} days.</li>
        <li>Your account, attempts, answers, saved questions and unlocks: until you delete your account.</li>
        <li>Payment records: kept without your name or number attached, for as long as accounting and tax law require.</li>
      </ul>

      <H>Your choices</H>
      <ul className="stack" style={{ gap: 6, paddingLeft: 20, margin: 0 }}>
        <li><b>See your data:</b> Profile, Privacy, “Download my data”.</li>
        <li><b>Delete your data:</b> Profile, Privacy, “Delete my account and data”. This removes your account, attempts, answers, unlocks, saved questions and consent record. It cannot be undone, and unlocked tests are lost.</li>
        <li><b>Correct something or ask a question:</b> contact {contact}.</li>
      </ul>

      <H>Contact</H>
      <p>For privacy questions or complaints write to {contact}. If you are not satisfied with our answer you can complain to the Data Protection Board of India.</p>
      <p className="small muted">We will tell you in the app if this policy changes in a way that needs your consent again.</p>
    </div>
  )
}
