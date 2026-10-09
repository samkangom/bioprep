import { Component } from 'react'

// Last line of defence: a render crash shows a recoverable message instead of a blank page.
export default class ErrorBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error) { console.error('[ui]', error) }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="state err" role="alert" style={{ minHeight: '60vh' }}>
        <h1 style={{ fontSize: 22 }}>Something went wrong</h1>
        <p className="muted">Your answers in a running test are safe on this page only until you leave it. Reload to continue.</p>
        <button className="btn primary" onClick={() => window.location.reload()}>Reload</button>
      </div>
    )
  }
}
