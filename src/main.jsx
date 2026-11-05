import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Error boundary — turns a white-screen crash into a visible, recoverable message.
// Essential here because the production console is cleared by the anti-devtools
// script, so a thrown error would otherwise leave only a blank page.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Best-effort log; may be cleared by the security script but harmless.
    try { console.error('App crashed:', error, info) } catch {}
  }

  handleReset = () => {
    // Clear potentially-corrupt local state, then reload fresh.
    try {
      localStorage.removeItem('garment-library')
    } catch {}
    window.location.reload()
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif', padding: 24,
        }}>
          <div style={{
            maxWidth: 560, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
            padding: 28, boxShadow: '0 8px 30px rgba(15,23,42,.08)',
          }}>
            <h2 style={{ margin: '0 0 8px', color: '#0f172a', fontSize: 18 }}>Something went wrong</h2>
            <p style={{ margin: '0 0 16px', color: '#475569', fontSize: 14 }}>
              The page hit an error and could not finish loading. This is often caused by an
              outdated cached version after an update. Reloading usually fixes it.
            </p>
            <pre style={{
              background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12,
              fontSize: 12, color: '#b91c1c', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              maxHeight: 160, overflow: 'auto', margin: '0 0 16px',
            }}>{String(this.state.error?.stack || this.state.error?.message || this.state.error)}</pre>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={this.handleReset} style={{
                background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>Reload the app</button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
