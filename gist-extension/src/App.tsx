// src/App.tsx
import './index.css'

function App() {
  return (
    <>
      <header style={{ marginBottom: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 12px rgba(16, 185, 129, 0.4)' }}></div>
          <h1>Gist Extension Active</h1>
        </div>
        <p style={{ fontSize: '18px', maxWidth: '600px' }}>
          Your AI reading assistant is ready. Highlight text on any page and trigger an instant, contextual explanation.
        </p>
      </header>

      <section style={{ 
        background: '#141414', 
        border: '1px solid var(--border)', 
        borderRadius: '8px', 
        padding: '24px',
        marginBottom: '24px'
      }}>
        <h2 style={{ fontSize: '16px', marginBottom: '16px' }}>How to use Gist</h2>
        <ol style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-muted)', lineHeight: '1.8' }}>
          <li>Select any confusing text or code block on a webpage.</li>
          <li>Press <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>E</kbd> on your keyboard.</li>
          <li>Or right-click the selection and choose <strong>"Gist this"</strong>.</li>
          <li>Read the instant, tailored explanation in the precision popover.</li>
        </ol>
      </section>

      <section style={{ 
        display: 'flex', 
        gap: '16px',
        fontSize: '14px'
      }}>
        <a href="#" style={{ 
          padding: '8px 16px', 
          background: '#ffffff', 
          color: '#000000', 
          borderRadius: '4px',
          fontWeight: 600
        }}>
          Extension Settings
        </a>
        <a href="#" style={{ 
          padding: '8px 16px', 
          background: 'transparent', 
          border: '1px solid var(--border)',
          color: 'var(--text)', 
          borderRadius: '4px' 
        }}>
          Documentation
        </a>
      </section>
    </>
  )
}

export default App
