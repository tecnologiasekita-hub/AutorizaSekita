import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { User, Mail, Building2, Save, Shield } from 'lucide-react'

const roleLabel = { solicitante: 'Solicitante', supervisor: 'Supervisor', diretor: 'Diretor' }
const roleClass = { solicitante: 'badge-solicitante', supervisor: 'badge-supervisor', diretor: 'badge-diretor' }

export default function Perfil() {
  const { profile, updateProfile } = useAuth()
  const [form, setForm]       = useState({ nome: profile?.nome || '' })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError]     = useState('')

  async function handleSave() {
    if (!form.nome.trim()) return setError('Nome é obrigatório.')
    setLoading(true)
    setError('')
    const { error: err } = await updateProfile(form)
    if (err) setError('Erro ao salvar. Tente novamente.')
    else {
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    }
    setLoading(false)
  }

  return (
    <div style={{ maxWidth: 500, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }} className="fade-in">
      <div>
        <h1 style={{ fontFamily: 'var(--font-body)', fontSize: 24, fontWeight: 700, color: 'var(--green-brand)' }}>
          Meu Perfil
        </h1>
        <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 2 }}>Gerencie suas informações pessoais</p>
      </div>

      {/* Avatar card */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 28, color: 'white',
          flexShrink: 0,
        }}>
          {profile?.nome?.charAt(0)?.toUpperCase() || 'U'}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{profile?.nome}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
            <span className={`badge ${roleClass[profile?.role]}`}>
              {roleLabel[profile?.role]}
            </span>
            {profile?.departamento && (
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{profile.departamento}</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{profile?.email}</div>
        </div>
      </div>

      {/* Edit form */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h3 style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-2)' }}>Editar informações</h3>

        <div className="input-group">
          <label><User size={11} style={{ display: 'inline', marginRight: 5 }} />Nome completo</label>
          <input
            className="input"
            value={form.nome}
            onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
            placeholder="Seu nome completo"
          />
        </div>

        <div className="input-group">
          <label><Mail size={11} style={{ display: 'inline', marginRight: 5 }} />E-mail</label>
          <input className="input" value={profile?.email || ''} disabled />
        </div>

        <div className="input-group">
          <label><Building2 size={11} style={{ display: 'inline', marginRight: 5 }} />Departamento</label>
          <input className="input" value={profile?.departamento || '—'} disabled />
        </div>

        <div className="input-group">
          <label><Shield size={11} style={{ display: 'inline', marginRight: 5 }} />Perfil de acesso</label>
          <input className="input" value={roleLabel[profile?.role] || ''} disabled />
        </div>

        {error && (
          <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: 13, color: 'var(--red)' }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ background: 'var(--green-bg)', border: '1px solid var(--green-border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: 13, color: 'var(--green)' }}>
            ✓ Perfil atualizado com sucesso!
          </div>
        )}

        <button className="btn btn-primary" onClick={handleSave} disabled={loading} style={{ alignSelf: 'flex-start' }}>
          {loading
            ? <span className="spinner" style={{ width: 14, height: 14, borderTopColor: 'white' }} />
            : <Save size={14} />}
          {loading ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </div>
    </div>
  )
}
