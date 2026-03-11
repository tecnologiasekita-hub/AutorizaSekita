import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { ArrowLeft, CheckCircle, XCircle, User, MessageSquare, DollarSign, Tag, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { STATUS, URGENCY_META, getStatusMeta, isPendingForDirector, isPendingForSupervisor } from '../lib/workflow'

export default function DetalhesSolicitacao() {
  const { id } = useParams()
  const { profile, isSupervisor, isDirector } = useAuth()
  const navigate = useNavigate()
  const [solicitacao, setSolicitacao] = useState(null)
  const [historico, setHistorico] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [comentario, setComentario] = useState('')
  const [motivo, setMotivo] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)

  useEffect(() => {
    fetchData()
  }, [id])

  async function fetchData() {
    setLoading(true)

    try {
      const [{ data: solicitacaoData }, { data: historicoData }] = await Promise.all([
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

      setSolicitacao(solicitacaoData)
      setHistorico(historicoData || [])
    } finally {
      setLoading(false)
    }
  }

  async function addHistorico(descricao) {
    await supabase.from('historico').insert({
      solicitacao_id: id,
      usuario_id: profile.id,
      descricao,
    })
  }

  const canActSupervisor = isSupervisor && isPendingForSupervisor(solicitacao?.status)
  const canActDirector = isDirector && isPendingForDirector(solicitacao?.status)
  const canAct = canActSupervisor || canActDirector

  async function handleAprovar() {
    setSaving(true)

    try {
      const updates = canActSupervisor
        ? {
            status: STATUS.SUPERVISOR_APPROVED,
            supervisor_id: profile.id,
            supervisor_comentario: comentario || null,
            supervisor_aprovado_em: new Date().toISOString(),
          }
        : {
            status: STATUS.APPROVED,
            diretor_id: profile.id,
            diretor_comentario: comentario || null,
            diretor_aprovado_em: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }

      await supabase.from('solicitacoes').update(updates).eq('id', id)
      await addHistorico(`Aprovado por ${profile.nome}${comentario ? `: ${comentario}` : ''}`)
      await supabase.from('notificacoes').insert({
        usuario_id: solicitacao.solicitante_id,
        solicitacao_id: id,
        mensagem: canActSupervisor
          ? `Sua solicitação "${solicitacao.titulo}" foi aprovada pelo supervisor e aguarda o diretor.`
          : `Sua solicitação "${solicitacao.titulo}" foi totalmente aprovada.`,
      })

      await fetchData()
      setComentario('')
    } finally {
      setSaving(false)
    }
  }

  async function handleRejeitar() {
    if (!motivo.trim()) return

    setSaving(true)

    try {
      await supabase.from('solicitacoes').update({
        status: STATUS.REJECTED,
        motivo_rejeicao: motivo.trim(),
        rejeitado_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', id)

      await addHistorico(`Rejeitado por ${profile.nome}: ${motivo.trim()}`)
      await supabase.from('notificacoes').insert({
        usuario_id: solicitacao.solicitante_id,
        solicitacao_id: id,
        mensagem: `Sua solicitação "${solicitacao.titulo}" foi rejeitada. Motivo: ${motivo.trim()}`,
      })

      await fetchData()
      setMotivo('')
      setShowRejectForm(false)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>
  }

  if (!solicitacao) {
    return <div style={{ color: 'var(--text-3)', padding: 40, textAlign: 'center' }}>Solicitação não encontrada.</div>
  }

  const status = getStatusMeta(solicitacao.status)
  const urgency = URGENCY_META[solicitacao.urgencia]

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }} className="fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginTop: 3 }}><ArrowLeft size={15} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 22, fontWeight: 400, color: 'var(--green-brand)' }}>{solicitacao.titulo}</h1>
            <span className={`badge ${status.cls}`}><span className={`status-dot ${status.dot}`} />{status.label}</span>
          </div>
          <p style={{ color: 'var(--text-3)', fontSize: 12 }}>
            Criado em {format(new Date(solicitacao.created_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        </div>
      </div>

      <ProgressTracker solicitacao={solicitacao} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }} className="grid-auto-fit">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 style={styles.cardTitle}>Detalhes</h3>
          <InfoRow icon={User} label="Solicitante" value={solicitacao.solicitante?.nome || '-'} />
          {solicitacao.solicitante?.departamento && <InfoRow icon={Tag} label="Departamento" value={solicitacao.solicitante.departamento} />}
          {solicitacao.valor != null && <InfoRow icon={DollarSign} label="Valor" value={`R$ ${Number(solicitacao.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />}
          {solicitacao.categoria && <InfoRow icon={Tag} label="Categoria" value={solicitacao.categoria} />}
          <InfoRow icon={AlertTriangle} label="Urgência" value={urgency?.label || 'Normal'} valueStyle={{ color: urgency?.color || 'var(--text)', fontWeight: 600 }} />
        </div>
        <div className="card">
          <h3 style={{ ...styles.cardTitle, marginBottom: 10 }}>Descrição</h3>
          <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{solicitacao.descricao}</p>
        </div>
      </div>

      {(solicitacao.supervisor_id || solicitacao.diretor_id || solicitacao.status === STATUS.REJECTED) && (
        <div className="card">
          <h3 style={{ ...styles.cardTitle, marginBottom: 14 }}>Pareceres</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {solicitacao.supervisor_id && solicitacao.supervisor && (
              <ParecerBox tipo="Supervisor" nome={solicitacao.supervisor.nome} comentario={solicitacao.supervisor_comentario} data={solicitacao.supervisor_aprovado_em} aprovado />
            )}
            {solicitacao.diretor_id && solicitacao.diretor && (
              <ParecerBox tipo="Diretor" nome={solicitacao.diretor.nome} comentario={solicitacao.diretor_comentario} data={solicitacao.diretor_aprovado_em} aprovado />
            )}
            {solicitacao.status === STATUS.REJECTED && solicitacao.motivo_rejeicao && (
              <ParecerBox tipo="Rejeição" nome="" comentario={solicitacao.motivo_rejeicao} data={solicitacao.rejeitado_em} aprovado={false} />
            )}
          </div>
        </div>
      )}

      {canAct && (
        <div className="card" style={{ borderColor: 'var(--border-light)', background: 'var(--bg-card-2)' }}>
          <h3 style={{ ...styles.cardTitle, marginBottom: 14 }}>Ação do {canActSupervisor ? 'supervisor' : 'diretor'}</h3>
          {!showRejectForm ? (
            <>
              <div className="input-group" style={{ marginBottom: 14 }}>
                <label><MessageSquare size={12} style={{ display: 'inline', marginRight: 5 }} />Comentário opcional</label>
                <textarea className="input" rows={3} placeholder="Observação sobre sua decisão..." value={comentario} onChange={event => setComentario(event.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 10 }} className="action-buttons">
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
                <textarea className="input" rows={3} placeholder="Explique o motivo..." value={motivo} onChange={event => setMotivo(event.target.value)} autoFocus />
              </div>
              <div style={{ display: 'flex', gap: 10 }} className="action-buttons">
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

      {historico.length > 0 && (
        <div className="card">
          <h3 style={{ ...styles.cardTitle, marginBottom: 16 }}>Histórico</h3>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {historico.map((item, index) => (
              <div key={item.id} style={{ display: 'flex', gap: 14, paddingBottom: index < historico.length - 1 ? 18 : 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: item.descricao?.startsWith('Aprovado') ? 'var(--green-bg)' : item.descricao?.startsWith('Rejeitado') ? 'var(--red-bg)' : 'var(--accent-glow)',
                    color: item.descricao?.startsWith('Aprovado') ? 'var(--green)' : item.descricao?.startsWith('Rejeitado') ? 'var(--red)' : 'var(--accent)',
                    border: `1px solid ${item.descricao?.startsWith('Aprovado') ? 'var(--green-border)' : item.descricao?.startsWith('Rejeitado') ? 'var(--red-border)' : 'rgba(26,92,56,0.25)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                  }}>
                    {item.descricao?.startsWith('Aprovado') ? 'OK' : item.descricao?.startsWith('Rejeitado') ? 'X' : 'o'}
                  </div>
                  {index < historico.length - 1 && <div style={{ width: 1, flex: 1, background: 'var(--border)', margin: '4px 0' }} />}
                </div>
                <div style={{ paddingTop: 4 }}>
                  <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{item.descricao}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
                    {format(new Date(item.created_at), "dd/MM/yyyy 'às' HH:mm")}
                    {item.profiles?.nome && ` · ${item.profiles.nome}`}
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

function ProgressTracker({ solicitacao }) {
  const skipSupervisor = solicitacao.solicitante?.role === 'supervisor' || solicitacao.solicitante?.role === 'diretor'
  const skipDirector = solicitacao.solicitante?.role === 'diretor'

  const steps = [
    { label: 'Criado', done: true, date: solicitacao.created_at },
    { label: 'Supervisor', done: skipSupervisor || [STATUS.SUPERVISOR_APPROVED, STATUS.APPROVED].includes(solicitacao.status), skip: skipSupervisor, date: solicitacao.supervisor_aprovado_em },
    { label: 'Diretor', done: skipDirector || solicitacao.status === STATUS.APPROVED, skip: skipDirector, date: solicitacao.diretor_aprovado_em },
    { label: solicitacao.status === STATUS.REJECTED ? 'Rejeitado' : 'Aprovado', done: solicitacao.status === STATUS.APPROVED, rejected: solicitacao.status === STATUS.REJECTED },
  ]

  return (
    <div className="card" style={{ display: 'flex', alignItems: 'flex-start', overflow: 'auto' }}>
      {steps.map((step, index) => (
        <div key={step.label} style={{ display: 'flex', alignItems: 'flex-start', flex: index < steps.length - 1 ? 1 : undefined, minWidth: 70 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: step.done ? 'var(--green-bg)' : step.rejected ? 'var(--red-bg)' : 'var(--bg-2)',
              color: step.done ? 'var(--green)' : step.rejected ? 'var(--red)' : 'var(--text-3)',
              border: `2px solid ${step.done ? 'var(--green)' : step.rejected ? 'var(--red)' : 'var(--border)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 15,
            }}>
              {step.done ? 'OK' : step.rejected ? 'X' : step.skip ? '-' : 'o'}
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: step.done ? 'var(--green)' : step.rejected ? 'var(--red)' : 'var(--text-3)', textAlign: 'center', whiteSpace: 'nowrap' }}>
              {step.label}
            </span>
            {step.date && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{format(new Date(step.date), 'dd/MM HH:mm')}</span>}
          </div>
          {index < steps.length - 1 && (
            <div style={{ flex: 1, height: 2, background: steps[index + 1]?.done ? 'var(--green)' : 'var(--border)', margin: '16px 6px 0' }} />
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

function ParecerBox({ tipo, nome, comentario, data, aprovado }) {
  return (
    <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: aprovado ? 'var(--green-bg)' : 'var(--red-bg)', border: `1px solid ${aprovado ? 'var(--green-border)' : 'var(--red-border)'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: comentario ? 6 : 0 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: aprovado ? 'var(--green)' : 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {aprovado ? 'OK' : 'X'} {tipo}{nome ? ` · ${nome}` : ''}
        </span>
        {data && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{format(new Date(data), 'dd/MM HH:mm')}</span>}
      </div>
      {comentario && <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>{comentario}</p>}
    </div>
  )
}

const styles = {
  cardTitle: {
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: 13,
    color: 'var(--text-2)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
}



