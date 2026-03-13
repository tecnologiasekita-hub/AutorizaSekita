import { useState } from 'react'
import logoSekita from '../assets/logo-sekita.png'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Mail, Lock, ArrowRight } from 'lucide-react'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [form, setForm]       = useState({ email: '', password: '' })

  function handleChange(e) { setForm(f => ({ ...f, [e.target.name]: e.target.value })); setError('') }

  async function handleSubmit() {
    if (!form.email || !form.password) return setError('Preencha todos os campos.')
    setLoading(true)
    const { error: err } = await signIn(form.email, form.password)
    if (err) { setError('E-mail ou senha incorretos. Fale com o administrador.'); setLoading(false) }
    else navigate('/dashboard')
  }

  return (
    <div style={styles.root} className="login-root">
      {/* Left — brand panel */}
      <div style={styles.brandPanel} className="login-brand-panel">
        <div style={styles.brandContent}>
          <div style={styles.logoWrap}>
            <img src={logoSekita} alt="Sekita Agronegócios" style={{ width: 160, objectFit: 'contain' }} />
          </div>

          <div style={styles.tagline}>
            <h2 style={styles.taglineTitle}>AutorizaSekita</h2>
            <p style={styles.taglineText}>Sistema interno de autorizações de compras e despesas.</p>
          </div>

          <div style={styles.flowCard}>
            <div style={styles.flowLabel}>Fluxo de aprovação</div>
            {[
              { num: '1', text: 'Solicitante cria o pedido' },
              { num: '2', text: 'Supervisor faz 1ª análise' },
              { num: '3', text: 'Diretor dá decisão final' },
            ].map(step => (
              <div key={step.num} style={styles.flowStep}>
                <div style={styles.flowNum}>{step.num}</div>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>{step.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — form */}
      <div style={styles.formPanel}>
        <div style={styles.formInner}>
          <div style={{ marginBottom: 32 }}>
            <h1 style={styles.formTitle}>Bem-vindo</h1>
            <p style={{ color: 'var(--text-3)', fontSize: 14, marginTop: 4 }}>
              Acesso restrito a colaboradores Sekita
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="input-group">
              <label>E-mail</label>
              <div style={{ position: 'relative' }}>
                <Mail size={15} style={styles.inputIcon} />
                <input className="input" name="email" type="email" placeholder="seu@sekita.com.br"
                  value={form.email} onChange={handleChange} style={{ paddingLeft: 38 }}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()} autoComplete="email" />
              </div>
            </div>

            <div className="input-group">
              <label>Senha</label>
              <div style={{ position: 'relative' }}>
                <Lock size={15} style={styles.inputIcon} />
                <input className="input" name="password" type="password" placeholder="••••••••"
                  value={form.password} onChange={handleChange} style={{ paddingLeft: 38 }}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()} autoComplete="current-password" />
              </div>
            </div>

            {error && (
              <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: 13, color: 'var(--red)' }}>
                {error}
              </div>
            )}

            <button className="btn btn-primary btn-lg w-full" onClick={handleSubmit} disabled={loading} style={{ marginTop: 4 }}>
              {loading ? <span className="spinner" style={{ borderTopColor: 'white', width: 16, height: 16 }} /> : <ArrowRight size={17} />}
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </div>

          <div style={styles.footNote}>
            🔒 Sua conta é criada pelo administrador do sistema.
          </div>
        </div>
      </div>
    </div>
  )
}

const styles = {
  root: {
    minHeight: '100vh',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
  },
  brandPanel: {
    background: 'var(--green-brand)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
    position: 'relative',
    overflow: 'hidden',
  },
  brandContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: 36,
    position: 'relative',
    zIndex: 1,
    maxWidth: 340,
    width: '100%',
  },
  logoWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },
  logoIcon: {
    width: 56, height: 56,
    background: 'rgba(255,255,255,0.15)',
    borderRadius: 16,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  logoName: {
    fontFamily: 'var(--font-body)',
        fontSize: 34,
    fontWeight: 400,
    color: '#fff',
    letterSpacing: '-0.02em',
    lineHeight: 1,
  },
  logoSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginTop: 3,
  },
  tagline: {},
  taglineTitle: {
    fontFamily: 'var(--font-body)',
        fontSize: 26,
    fontWeight: 400,
    color: '#fff',
    marginBottom: 8,
  },
  taglineText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 1.6,
  },
  flowCard: {
    background: 'rgba(0,0,0,0.15)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 'var(--radius)',
    padding: '18px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  flowLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  flowStep: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  flowNum: {
    width: 24, height: 24,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.15)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  formPanel: {
    background: 'var(--bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
  },
  formInner: {
    width: '100%',
    maxWidth: 360,
  },
  formTitle: {
    fontFamily: 'var(--font-body)',
        fontSize: 36,
    fontWeight: 400,
    color: 'var(--text)',
    letterSpacing: '-0.02em',
  },
  inputIcon: {
    position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
    color: 'var(--text-3)', pointerEvents: 'none',
  },
  footNote: {
    marginTop: 24,
    fontSize: 12,
    color: 'var(--text-3)',
    lineHeight: 1.5,
    padding: '12px 14px',
    background: 'var(--green-pale)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--green-pale-2)',
  },
}
