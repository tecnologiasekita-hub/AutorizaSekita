import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { ArrowLeft, CheckCircle, XCircle, User, MessageSquare, DollarSign, Tag, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const urgenciaColor = { baixa: 'var(--text-3)', normal: 'var(--blue)', alta: 'var(--yellow)', critica: 'var(--red)' }

const statusMap = {
  pendente:            { label: 'Pendente',        cls: 'badge-pendente',   dot: 'dot-pendente' },
  aprovado_supervisor: { label: 'Aguarda Diretor', cls: 'badge-supervisor', dot: 'dot-supervisor' },
  aprovado:            { label: 'Aprovado',         cls: 'badge-aprovado',   dot: 'dot-aprovado' },
  rejeitado:           { label: 'Rejeitado',        cls: 'badge-rejeitado',  dot: 'dot-rejeitado' },
}

export default function DetalhesSolicitacao() {
  const { id } = useParams()
  const { profile, isSupervisor, isDirector } = useAuth()
  const navigate = useNavigate()
  const [sol, setSol]           = useState(null)
  const [historico, setHistorico] = useState([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [comentario, setComentario] = useState('')
  const [motivo, setMotivo]         = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)

  useEffect(() => { fetchData() }, [id])

  async function fetchData() {
    setLoading(true)
    const [{ data: s }, { data: h }] = await Promise.all([
      supabase
        .from('solicitacoes')
        .select(`
          *,
          solicitante:profiles!solicitacoes_solicitante_id_fkey(id, nome, email, role, departamento),
          supervisor:profiles!solicitacoes_supervisor_id_fkey(id, nome),
          diretor:profiles!solicitacoes_diretor_id_fkey(id, nome)
        `)
        .eq('id', id)
        .single(),
      supabase
        .from('historico')
        .select('*, profiles(nome)')
        .eq('solicitacao_id', id)
        .order('created_at', { ascending: true }),
    ])
    setSol(s)
    setHistorico(h || [])
    setLoading(false)
  }

  async function addHistorico(descricao) {
    await supabase.from('historico').insert({
      solicitacao_id: id,
      usuario_id:     profile.id,
      descricao,
    })
  }

  const canActSupervisor = isSupervisor && sol?.status === 'pendente'
  const canActDirector   = isDirector && ['pendente', 'aprovado_supervisor'].includes(sol?.status)
  const canAct = canActSupervisor || canActDirector

  async function handleAprovar() {
    setSaving(true)
    const updates = isSupervisor
      ? { status: 'aprovado_supervisor', supervisor_id: profile.id, supervisor_comentario: comentario || null, supervisor_aprovado_em: new Date().toISOString() }
      : { status: 'aprovado', diretor_id: profile.id, diretor_comentario: comentario || null, diretor_aprovado_em: new Date().toISOString(), updated_at: new Date().toISOString() }

    await supabase.from('solicitacoes').update(updates).eq('id', id)
    await addHistorico(`Aprovado por ${profile.nome}${comentario ? `: ${comentario}` : ''}`)
    await supabase.from('notificacoes').insert({
      usuario_id:     sol.solicitante_id,
      solicitacao_id: id,
      mensagem: isSupervisor
        ? `Sua solicitação "${sol.titulo}" foi aprovada pelo Supervisor e aguarda o Diretor.`
        : `Sua solicitação "${sol.titulo}" foi totalmente aprovada! ✅`,
    })
    await fetchData()
    setComentario('')
    setSaving(false)
  }

  async function handleRejeitar() {
    if (!motivo.trim()) return
    setSaving(true)
    await supabase.from('solicitacoes').update({
      status: 'rejeitado',
      motivo_rejeicao: motivo,
      rejeitado_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    await addHistorico(`Rejeitado por ${profile.nome}: ${motivo}`)
    await supabase.from('notificacoes').insert({
      usuario_id:     sol.solicitante_id,
      solicitacao_id: id,
      mensagem: `Sua solicitação "${sol.titulo}" foi rejeitada. Motivo: ${motivo}`,
    })
    await fetchData()
    setMotivo('')
    setShowRejectForm(false)
    setSaving(false)
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>
  if (!sol) return <div style={{ color: 'var(--text-3)', padding: 40, textAlign: 'center' }}>Solicitação não encontrada.</div>

  const st = statusMap[sol.status] || statusMap.pendente

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }} className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginTop: 3 }}><ArrowLeft size={15} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 22, fontWeight: 400, color: 'var(--green-brand)' }}>{sol.titulo}</h1>
            <span className={`badge ${st.cls}`}><span className={`status-dot ${st.dot}`} />{st.label}</span>
          </div>
          <p style={{ color: 'var(--text-3)', fontSize: 12 }}>
            Criado em {format(new Date(sol.created_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        </div>
      </div>

      {/* Progress */}
      <ProgressTracker sol={sol} />

      {/* Details */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 style={s.cardTitle}>Detalhes</h3>
          <InfoRow icon={User} label="Solicitante" value={sol.solicitante?.nome || '—'} />
          {sol.solicitante?.departamento && <InfoRow icon={Tag} label="Departamento" value={sol.solicitante.departamento} />}
          {sol.valor != null && <InfoRow icon={DollarSign} label="Valor" value={`R$ ${Number(sol.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />}
          {sol.categoria && <InfoRow icon={Tag} label="Categoria" value={sol.categoria} />}
          <InfoRow icon={AlertTriangle} label="Urgência" value={sol.urgencia || 'normal'} valueStyle={{ color: urgenciaColor[sol.urgencia], textTransform: 'capitalize', fontWeight: 600 }} />
        </div>
        <div className="card">
          <h3 style={{ ...s.cardTitle, marginBottom: 10 }}>Descrição</h3>
          <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{sol.descricao}</p>
        </div>
      </div>

      {/* Pareceres */}
      {(sol.supervisor_id || sol.diretor_id || sol.status === 'rejeitado') && (
        <div className="card">
          <h3 style={{ ...s.cardTitle, marginBottom: 14 }}>Pareceres</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sol.supervisor_id && sol.supervisor && (
              <PareceBox tipo="Supervisor" nome={sol.supervisor.nome} comentario={sol.supervisor_comentario} data={sol.supervisor_aprovado_em} aprovado />
            )}
            {sol.diretor_id && sol.diretor && (
              <PareceBox tipo="Diretor" nome={sol.diretor.nome} comentario={sol.diretor_comentario} data={sol.diretor_aprovado_em} aprovado />
            )}
            {sol.status === 'rejeitado' && sol.motivo_rejeicao && (
              <PareceBox tipo="Rejeição" nome="" comentario={sol.motivo_rejeicao} data={sol.rejeitado_em} aprovado={false} />
            )}
          </div>
        </div>
      )}

      {/* Action */}
      {canAct && (
        <div className="card" style={{ borderColor: 'var(--border-light)', background: 'var(--bg-card-2)' }}>
          <h3 style={{ ...s.cardTitle, marginBottom: 14 }}>⚡ Ação do {canActSupervisor ? 'Supervisor' : 'Diretor'}</h3>
          {!showRejectForm ? (
            <>
              <div className="input-group" style={{ marginBottom: 14 }}>
                <label><MessageSquare size={12} style={{ display: 'inline', marginRight: 5 }} />Comentário (opcional)</label>
                <textarea className="input" rows={3} placeholder="Observação sobre sua decisão..." value={comentario} onChange={e => setComentario(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-success" onClick={handleAprovar} disabled={saving}>
                  {saving ? <span className="spinner" style={{ width: 14, height: 14, borderTopColor: 'var(--green)' }} /> : <CheckCircle size={15} />}
                  Aprovar
                </button>
                <button className="btn btn-danger" onClick={() => setShowRejectForm(true)} disabled={saving}>
                  <XCircle size={15} /> Rejeitar
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="input-group" style={{ marginBottom: 14 }}>
                <label>Motivo da rejeição *</label>
                <textarea className="input" rows={3} placeholder="Explique o motivo..." value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-danger" onClick={handleRejeitar} disabled={saving || !motivo.trim()}>
                  {saving ? <span className="spinner" style={{ width: 14, height: 14, borderTopColor: 'var(--red)' }} /> : <XCircle size={15} />}
                  Confirmar rejeição
                </button>
                <button className="btn btn-ghost" onClick={() => { setShowRejectForm(false); setMotivo('') }}>Cancelar</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Histórico */}
      {historico.length > 0 && (
        <div className="card">
          <h3 style={{ ...s.cardTitle, marginBottom: 16 }}>Histórico</h3>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {historico.map((h, i) => (
              <div key={h.id} style={{ display: 'flex', gap: 14, paddingBottom: i < historico.length - 1 ? 18 : 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: h.descricao?.startsWith('Aprovado') ? 'var(--green-bg)' : h.descricao?.startsWith('Rejeitado') ? 'var(--red-bg)' : 'var(--accent-glow)',
                    color:      h.descricao?.startsWith('Aprovado') ? 'var(--green)'   : h.descricao?.startsWith('Rejeitado') ? 'var(--red)'   : 'var(--accent)',
                    border:     `1px solid ${h.descricao?.startsWith('Aprovado') ? 'var(--green-border)' : h.descricao?.startsWith('Rejeitado') ? 'var(--red-border)' : 'rgba(124,106,255,0.25)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                  }}>
                    {h.descricao?.startsWith('Aprovado') ? '✓' : h.descricao?.startsWith('Rejeitado') ? '✗' : '●'}
                  </div>
                  {i < historico.length - 1 && <div style={{ width: 1, flex: 1, background: 'var(--border)', margin: '4px 0' }} />}
                </div>
                <div style={{ paddingTop: 4 }}>
                  <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{h.descricao}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
                    {format(new Date(h.created_at), "dd/MM/yyyy 'às' HH:mm")}
                    {h.profiles?.nome && ` · ${h.profiles.nome}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ProgressTracker({ sol }) {
  const skip_sup = sol.solicitante?.role === 'supervisor' || sol.solicitante?.role === 'diretor'
  const skip_dir = sol.solicitante?.role === 'diretor'

  const steps = [
    { label: 'Criado',     done: true, date: sol.created_at },
    { label: 'Supervisor', done: skip_sup || ['aprovado_supervisor','aprovado'].includes(sol.status), skip: skip_sup, date: sol.supervisor_aprovado_em },
    { label: 'Diretor',    done: skip_dir || sol.status === 'aprovado', skip: skip_dir, date: sol.diretor_aprovado_em },
    { label: sol.status === 'rejeitado' ? 'Rejeitado' : 'Aprovado', done: sol.status === 'aprovado', rejected: sol.status === 'rejeitado' },
  ]

  return (
    <div className="card" style={{ display: 'flex', alignItems: 'flex-start', overflow: 'auto' }}>
      {steps.map((step, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', flex: i < steps.length - 1 ? 1 : undefined, minWidth: 70 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              background: step.done ? 'var(--green-bg)' : step.rejected ? 'var(--red-bg)' : 'var(--bg-2)',
              color:      step.done ? 'var(--green)'   : step.rejected ? 'var(--red)'   : 'var(--text-3)',
              border: `2px solid ${step.done ? 'var(--green)' : step.rejected ? 'var(--red)' : 'var(--border)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
            }}>
              {step.done ? '✓' : step.rejected ? '✗' : step.skip ? '—' : '○'}
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: step.done ? 'var(--green)' : step.rejected ? 'var(--red)' : 'var(--text-3)', textAlign: 'center', whiteSpace: 'nowrap' }}>
              {step.label}
            </span>
            {step.date && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{format(new Date(step.date), 'dd/MM HH:mm')}</span>}
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 2, background: steps[i+1]?.done ? 'var(--green)' : 'var(--border)', margin: '16px 6px 0' }} />
          )}
        </div>
      ))}
    </div>
  )
}

function InfoRow({ icon: Icon, label, value, valueStyle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <Icon size={14} style={{ color: 'var(--text-3)', marginTop: 3, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 1 }}>{label}</div>
        <div style={{ fontSize: 13, color: 'var(--text)', ...valueStyle }}>{value}</div>
      </div>
    </div>
  )
}

function PareceBox({ tipo, nome, comentario, data, aprovado }) {
  return (
    <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: aprovado ? 'var(--green-bg)' : 'var(--red-bg)', border: `1px solid ${aprovado ? 'var(--green-border)' : 'var(--red-border)'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: comentario ? 6 : 0 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: aprovado ? 'var(--green)' : 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {aprovado ? '✓' : '✗'} {tipo}{nome ? ` · ${nome}` : ''}
        </span>
        {data && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{format(new Date(data), 'dd/MM HH:mm')}</span>}
      </div>
      {comentario && <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>{comentario}</p>}
    </div>
  )
}

const s = {
  cardTitle: { fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13, color: 'var(--text-2)', letterSpacing: '0.04em', textTransform: 'uppercase' }
}
