import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { ArrowLeft, Send } from 'lucide-react'
import { STATUS, URGENCY, URGENCY_META } from '../lib/workflow'

const CATEGORIAS = [
  'Compras e Suprimentos',
  'Viagens e Despesas',
  'Contratação de Serviços',
  'Infraestrutura',
  'Marketing',
  'RH e Pessoal',
  'TI e Tecnologia',
  'Outros',
]

const URGENCIAS = [
  { value: URGENCY.LOW, label: URGENCY_META[URGENCY.LOW].label, color: URGENCY_META[URGENCY.LOW].color },
  { value: URGENCY.NORMAL, label: URGENCY_META[URGENCY.NORMAL].label, color: URGENCY_META[URGENCY.NORMAL].color },
  { value: URGENCY.HIGH, label: URGENCY_META[URGENCY.HIGH].label, color: URGENCY_META[URGENCY.HIGH].color },
  { value: URGENCY.CRITICAL, label: 'Crítica', color: URGENCY_META[URGENCY.CRITICAL].color },
]

export default function NovaSolicitacao() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    titulo: '',
    descricao: '',
    valor: '',
    categoria: '',
    urgencia: URGENCY.NORMAL,
  })

  function setField(key, value) {
    setForm(current => ({ ...current, [key]: value }))
    setError('')
  }

  const flowSteps = profile?.role === 'diretor'
    ? [{ label: 'Você cria', active: true }, { label: 'Autoaprovado', green: true }]
    : profile?.role === 'supervisor'
      ? [{ label: 'Você cria', active: true }, { label: 'Diretor aprova' }, { label: 'Concluído', green: true }]
      : [{ label: 'Você cria', active: true }, { label: 'Supervisor' }, { label: 'Diretor' }, { label: 'Concluído', green: true }]

  async function handleSubmit() {
    if (!form.titulo.trim() || !form.descricao.trim()) {
      setError('Título e descrição são obrigatórios.')
      return
    }

    setLoading(true)

    try {
      const isSupervisor = profile?.role === 'supervisor'
      const isDirector = profile?.role === 'diretor'

      const payload = {
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim(),
        valor: form.valor ? parseFloat(form.valor) : null,
        categoria: form.categoria || null,
        urgencia: form.urgencia,
        solicitante_id: profile.id,
        status: isDirector ? STATUS.APPROVED : isSupervisor ? STATUS.SUPERVISOR_APPROVED : STATUS.PENDING,
      }

      if (isSupervisor) {
        payload.supervisor_id = profile.id
        payload.supervisor_aprovado_em = new Date().toISOString()
      }

      if (isDirector) {
        payload.diretor_id = profile.id
        payload.diretor_aprovado_em = new Date().toISOString()
      }

      const { data, error: submitError } = await supabase.from('solicitacoes').insert(payload).select().single()

      if (submitError) {
        setError('Erro ao criar a solicitação. Tente novamente.')
        return
      }

      await supabase.from('historico').insert({
        solicitacao_id: data.id,
        usuario_id: profile.id,
        descricao: `Solicitação criada por ${profile.nome}`,
      })

      navigate(`/solicitacao/${data.id}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }} className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}><ArrowLeft size={15} /></button>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 26, fontWeight: 400, color: 'var(--green-brand)' }}>Nova solicitação</h1>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 2 }}>Preencha os detalhes para iniciar o fluxo de aprovação</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20, background: 'var(--green-pale)', borderColor: 'var(--green-pale-2)' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--green-brand)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Seu fluxo de aprovação</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {flowSteps.map((step, index) => (
            <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FlowChip {...step} />
              {index < flowSteps.length - 1 && <span style={{ color: 'var(--text-3)', fontSize: 13 }}>-&gt;</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="input-group">
          <label>Título *</label>
          <input className="input" placeholder="Ex: Compra de equipamentos de TI" value={form.titulo} onChange={event => setField('titulo', event.target.value)} maxLength={120} />
        </div>

        <div className="input-group">
          <label>Descrição *</label>
          <textarea className="input" rows={4} placeholder="Descreva o motivo e os detalhes..." value={form.descricao} onChange={event => setField('descricao', event.target.value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }} className="grid-auto-fit">
          <div className="input-group">
            <label>Valor estimado (R$)</label>
            <input className="input" type="number" min="0" step="0.01" placeholder="0,00" value={form.valor} onChange={event => setField('valor', event.target.value)} />
          </div>
          <div className="input-group">
            <label>Categoria</label>
            <select className="input" value={form.categoria} onChange={event => setField('categoria', event.target.value)}>
              <option value="">Selecione...</option>
              {CATEGORIAS.map(categoria => <option key={categoria} value={categoria}>{categoria}</option>)}
            </select>
          </div>
        </div>

        <div className="input-group">
          <label>Urgência</label>
          <div style={{ display: 'flex', gap: 8 }} className="urgencia-grid">
            {URGENCIAS.map(urgencia => (
              <button
                key={urgencia.value}
                type="button"
                onClick={() => setField('urgencia', urgencia.value)}
                style={{
                  flex: 1,
                  padding: '9px 0',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${form.urgencia === urgencia.value ? urgencia.color : 'var(--border)'}`,
                  background: form.urgencia === urgencia.value ? `${urgencia.color}15` : 'var(--bg-2)',
                  color: form.urgencia === urgencia.value ? urgencia.color : 'var(--text-3)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                  transition: 'all 0.15s',
                }}
              >
                {urgencia.label}
              </button>
            ))}
          </div>
        </div>

        {error && <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: 13, color: 'var(--red)' }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }} className="action-buttons">
          <button className="btn btn-outline" onClick={() => navigate(-1)}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? <span className="spinner" style={{ width: 14, height: 14, borderTopColor: 'white' }} /> : <Send size={14} />}
            {loading ? 'Enviando...' : 'Enviar solicitação'}
          </button>
        </div>
      </div>
    </div>
  )
}

function FlowChip({ label, active, green }) {
  return (
    <span style={{
      padding: '4px 11px',
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 500,
      background: active ? 'var(--accent)' : green ? 'var(--green-bg)' : 'var(--bg-2)',
      color: active ? 'white' : green ? 'var(--green)' : 'var(--text-3)',
      border: green ? '1px solid var(--green-border)' : '1px solid transparent',
    }}>{label}</span>
  )
}

