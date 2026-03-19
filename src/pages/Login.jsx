import { useState } from 'react'
import logoSekita from '../assets/logo-sekita-login.png'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Mail, Lock, ArrowRight } from 'lucide-react'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ email: '', password: '' })

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
    setError('')
  }

  async function handleSubmit() {
    if (!form.email || !form.password) return setError('Preencha todos os campos.')
    setLoading(true)
    const { error: err } = await signIn(form.email, form.password)
    if (err) {
      setError('E-mail ou senha incorretos. Fale com o administrador.')
      setLoading(false)
    } else {
      navigate('/dashboard')
    }
  }

  return (
    <div style={styles.root}>
      <div style={styles.card} className="fade-in">
        <div style={styles.brandBlock}>
          <img src={logoSekita} alt="Sekita Agronegocios" style={styles.logo} />
          <div style={styles.brandText}>
            <h1 style={styles.brandTitle}>AUTORIZASEKITA</h1>
            <p style={styles.brandDescription}>Sistema interno de autorizações</p>
          </div>
        </div>

        <div style={styles.formArea}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="input-group">
              <label>E-mail</label>
              <div style={{ position: 'relative' }}>
                <Mail size={15} style={styles.inputIcon} />
                <input
                  className="input"
                  name="email"
                  type="email"
                  placeholder="seu@sekita.com.br"
                  value={form.email}
                  onChange={handleChange}
                  style={{ paddingLeft: 38 }}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="input-group">
              <label>Senha</label>
              <div style={{ position: 'relative' }}>
                <Lock size={15} style={styles.inputIcon} />
                <input
                  className="input"
                  name="password"
                  type="password"
                  placeholder="........"
                  value={form.password}
                  onChange={handleChange}
                  style={{ paddingLeft: 38 }}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  autoComplete="current-password"
                />
              </div>
            </div>

            {error && (
              <div style={styles.errorBox}>
                {error}
              </div>
            )}

            <button className="btn btn-primary btn-lg w-full" onClick={handleSubmit} disabled={loading} style={{ marginTop: 4 }}>
              {loading ? <span className="spinner" style={{ borderTopColor: 'white', width: 16, height: 16 }} /> : <ArrowRight size={17} />}
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const styles = {
  root: {
    minHeight: '100vh',
    background: '#ffffff',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '20px 20px 32px',
  },
  card: {
    width: '100%',
    maxWidth: 430,
    background: '#e6efe8',
    border: '1px solid rgba(26,92,56,0.18)',
    borderRadius: 26,
    padding: '28px 32px 32px',
    boxShadow: '0 24px 70px rgba(26,92,56,0.12)',
  },
  brandBlock: {
    marginBottom: 18,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  logo: {
    width: 300,
    objectFit: 'contain',
    marginBottom: 8,
  },
  brandText: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    maxWidth: 280,
  },
  brandTitle: {
    fontSize: 29,
    lineHeight: 1,
    fontWeight: 800,
    color: 'var(--green-brand)',
    letterSpacing: '0.05em',
  },
  brandDescription: {
    fontSize: 14,
    color: 'var(--text-2)',
    lineHeight: 1.5,
  },
  formArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  inputIcon: {
    position: 'absolute',
    left: 13,
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--text-3)',
    pointerEvents: 'none',
  },
  errorBox: {
    background: 'var(--red-bg)',
    border: '1px solid var(--red-border)',
    borderRadius: 'var(--radius-sm)',
    padding: '10px 14px',
    fontSize: 13,
    color: 'var(--red)',
  },
}
