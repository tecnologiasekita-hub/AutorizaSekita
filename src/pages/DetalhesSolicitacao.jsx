import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { notificar } from '../lib/notificar'
import {
  ArrowLeft, CheckCircle, XCircle, User, MessageSquare,
  DollarSign, Tag, AlertTriangle, Paperclip, Download, FileText, Image, File,
} from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { STATUS, URGENCY_META, getStatusMeta, isPendingForSupervisor, isPendingForDirector, formatBytes } from '../lib/workflow'

function fileIcon(mime) {
  if (!mime) return File
  if (mime.startsWith('image/')) return Image
  if (mime === 'application/pdf') return FileText
  return File
}

export default function DetalhesSolicitacao() {
  const { id } = useParams()
  const { profile, isSupervisor, isDirector } = useAuth()
  const navigate = useNavigate()

  const [sol,            setSol]            = useState(null)
  const [historico,      setHistorico]      = useState([])
  const [diretores,      setDiretores]      = useState([])   // linhas solicitacao_diretores
  const [allDiretores,   setAllDiretores]   = useState([])   // todos os diretores do sistema
  const [anexos,         setAnexos]         = useState([])
  const [loading,        setLoading]        = useState(true)
  const [saving,         setSaving]         = useState(false)
  const [comentario,     setComentario]     = useState('')
  const [motivo,         setMotivo]         = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [dirSel,         setDirSel]         = useState([])   // diretores selecionados pelo supervisor
  const [dirError,       setDirError]       = useState('')

  useEffect(() => { fetchData() }, [id])
  useEffect(() => {
    // Auto-seleciona o diretor vinculado ao supervisor
    async function autoSelectDiretor() {
      if (!isSupervisor || !profile) return
      const { data } = await supabase
        .from('profiles')
        .select('diretor_id')
        .eq('id', profile.id)
        .single()
      if (data?.diretor_id) {
        setDirSel([data.diretor_id])
      }
    }
    autoSelectDiretor()
  }, [profile, isSupervisor])

  async function fetchData() {
    setLoading(true)
    try {
      const [
        { data: solData },
        { data: histData },
        { data: dirData },
        { data: anexoData },
        { data: allDirsData },
      ] = await Promise.all([
        supabase.from('solicitacoes').select(`
          *,
          solicitante:profiles!solicitacoes_solicitante_id_fkey(id, nome, email, role, departamento),
          supervisor:profiles!solicitacoes_supervisor_id_fkey(id, nome),
          rejeitado_por:profiles!solicitacoes_rejeitado_por_id_fkey(id, nome)
        `).eq('id', id).single(),

        supabase.from('historico')
          .select('*, profiles(nome)')
          .eq('solicitacao_id', id)
          .order('created_at', { ascending: true }),

        supabase.from('solicitacao_diretores')
          .select('*, diretor:profiles!solicitacao_diretores_diretor_id_fkey(id, nome, departamento)')
          .eq('solicitacao_id', id)
          .order('created_at', { ascending: true }),

        supabase.from('anexos')
          .select('*')
          .eq('solicitacao_id', id)
          .order('created_at', { ascending: true }),

        // Carrega lista completa de diretores para o supervisor selecionar
        supabase.from('profiles')
          .select('id, nome, departamento')
          .eq('role', 'diretor')
          .order('nome'),
      ])

      setSol(solData)
      setHistorico(histData || [])
      setDiretores(dirData || [])
      setAnexos(anexoData || [])
      setAllDiretores(allDirsData || [])
    } finally {
      setLoading(false)
    }
  }

  async function addHistorico(descricao) {
    await supabase.from('historico').insert({ solicitacao_id: id, usuario_id: profile.id, descricao })
  }

  const canActSupervisor = isSupervisor && isPendingForSupervisor(sol?.status)
  const myDirRow         = isDirector ? diretores.find(d => d.diretor_id === profile?.id) : null
  const canActDirector   = isDirector && myDirRow?.status === 'pendente' && isPendingForDirector(sol?.status)
  const canAct           = canActSupervisor || canActDirector

  function toggleDir(dirId) {
    setDirSel(prev => prev.includes(dirId) ? prev.filter(d => d !== dirId) : [...prev, dirId])
    setDirError('')
  }

  async function handleAprovar() {
    if (canActSupervisor) {
      // Supervisor DEVE selecionar ao menos 1 diretor
      if (dirSel.length === 0) {
        setDirError('Selecione ao menos um diretor antes de aprovar.')
        return
      }
    }

    setSaving(true)
    try {
      if (canActSupervisor) {
        // 1. Atualiza solicitação
        await supabase.from('solicitacoes').update({
          status:                 STATUS.SUPERVISOR_APPROVED,
          supervisor_id:          profile.id,
          supervisor_comentario:  comentario || null,
          supervisor_aprovado_em: new Date().toISOString(),
          updated_at:             new Date().toISOString(),
        }).eq('id', id)

        // 2. Insere diretores selecionados
        await supabase.from('solicitacao_diretores').insert(
          dirSel.map(did => ({
            solicitacao_id: id,
            diretor_id:     did,
            status:         'pendente',
          }))
        )

        await addHistorico(
          `Aprovado pelo supervisor ${profile.nome}${comentario ? `: ${comentario}` : ''}. ` +
          `Diretores selecionados: ${allDiretores.filter(d => dirSel.includes(d.id)).map(d => d.nome).join(', ')}`
        )

        // 3. Notifica os diretores selecionados
        await supabase.from('notificacoes').insert(
          dirSel.map(did => ({
            usuario_id:     did,
            solicitacao_id: id,
            mensagem:       `Solicitação "${sol.titulo}" aguarda sua aprovação como diretor.`,
          }))
        )

        // 4. Notifica solicitante
        await supabase.from('notificacoes').insert({
          usuario_id:     sol.solicitante_id,
          solicitacao_id: id,
          mensagem:       `Sua solicitação "${sol.titulo}" foi aprovada pelo supervisor e aguarda o(s) diretor(es).`,
        })

      } else if (canActDirector) {
        await supabase.from('solicitacao_diretores').update({
          status:      'aprovado',
          comentario:  comentario || null,
          decidido_em: new Date().toISOString(),
        }).eq('solicitacao_id', id).eq('diretor_id', profile.id)

        const { data: dirsAtual } = await supabase
          .from('solicitacao_diretores').select('status').eq('solicitacao_id', id)

        const todos     = dirsAtual || []
        const aprovados = todos.filter(d => d.status === 'aprovado').length
        const novoStatus = aprovados === todos.length ? STATUS.APPROVED : STATUS.PARTIAL

        await supabase.from('solicitacoes').update({
          status: novoStatus, updated_at: new Date().toISOString(),
        }).eq('id', id)

        await addHistorico(`Aprovado pelo diretor ${profile.nome}${comentario ? `: ${comentario}` : ''}`)

        if (novoStatus === STATUS.APPROVED) {
          await supabase.from('notificacoes').insert({
            usuario_id: sol.solicitante_id, solicitacao_id: id,
            mensagem: `Sua solicitação "${sol.titulo}" foi totalmente aprovada! ✅`,
          })
        } else {
          await supabase.from('notificacoes').insert({
            usuario_id: sol.solicitante_id, solicitacao_id: id,
            mensagem: `Sua solicitação "${sol.titulo}" foi aprovada por mais um diretor (${aprovados}/${todos.length}).`,
          })
        }
      }

      await fetchData()
      setComentario('')
      setDirSel([])
    } finally {
      setSaving(false)
    }
  }

  async function handleRejeitar() {
    if (!motivo.trim()) return
    setSaving(true)
    try {
      await supabase.from('solicitacoes').update({
        status:             STATUS.REJECTED,
        rejeitado_por_id:   profile.id,
        rejeitado_por_role: profile.role,
        motivo_rejeicao:    motivo.trim(),
        rejeitado_em:       new Date().toISOString(),
        updated_at:         new Date().toISOString(),
      }).eq('id', id)

      if (isDirector && myDirRow) {
        await supabase.from('solicitacao_diretores').update({
          status: 'rejeitado', comentario: motivo.trim(), decidido_em: new Date().toISOString(),
        }).eq('solicitacao_id', id).eq('diretor_id', profile.id)
      }

      await addHistorico(`Rejeitado por ${profile.nome} (${profile.role}): ${motivo.trim()}`)
      await supabase.from('notificacoes').insert({
        usuario_id: sol.solicitante_id, solicitacao_id: id,
        mensagem: `Sua solicitação "${sol.titulo}" foi rejeitada. Motivo: ${motivo.trim()}`,
      })

      await fetchData()
      setMotivo('')
      setShowRejectForm(false)
    } finally {
      setSaving(false)
    }
  }

  async function downloadAnexo(anexo) {
    const { data, error } = await supabase.storage.from('anexos').download(anexo.storage_path)
    if (error) return
    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url; a.download = anexo.nome_arquivo; a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>
  }
  if (!sol) {
    return <div style={{ color: 'var(--text-3)', padding: 40, textAlign: 'center' }}>Solicitação não encontrada.</div>
  }

  const statusMeta = getStatusMeta(sol.status)
  const urgency    = URGENCY_META[sol.urgencia]

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }} className="fade-in">

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginTop: 3 }}>
          <ArrowLeft size={15} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
            <h1 style={{ fontFamily: 'var(--font-body)', fontSize: 20, fontWeight: 700, color: 'var(--green-brand)' }}>
              {sol.numero && <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-3)', marginRight: 8 }}>#{sol.numero}</span>}
              {sol.titulo}
            </h1>
            <span className={`badge ${statusMeta.cls}`}>
              <span className={`status-dot ${statusMeta.dot}`} />
              {statusMeta.label}
            </span>
          </div>
          <p style={{ color: 'var(--text-3)', fontSize: 12 }}>
            Criado em {format(new Date(sol.created_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        </div>
      </div>

      {/* Progress tracker */}
      <ProgressTracker sol={sol} diretores={diretores} />

      {/* Detalhes + Descrição */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 style={s.cardTitle}>Detalhes</h3>
          <InfoRow icon={User}         label="Solicitante"  value={sol.solicitante?.nome || '-'} />
          {sol.solicitante?.departamento && <InfoRow icon={Tag} label="Departamento" value={sol.solicitante.departamento} />}
          {sol.valor != null && (
            <InfoRow icon={DollarSign} label="Valor"
              value={`R$ ${Number(sol.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
          )}
          {sol.setor_origem && <InfoRow icon={Tag} label="Setor de origem" value={sol.setor_origem} />}
          {sol.categoria && <InfoRow icon={Tag} label="Categoria" value={sol.categoria} />}
          <InfoRow icon={AlertTriangle} label="Urgência"
            value={urgency?.label || 'Normal'}
            valueStyle={{ color: urgency?.color || 'var(--text)', fontWeight: 600 }} />
        </div>
        <div className="card">
          <h3 style={{ ...s.cardTitle, marginBottom: 10 }}>Descrição</h3>
          <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
            {sol.descricao}
          </p>
        </div>
      </div>

      {/* Anexos */}
      {anexos.length > 0 && (
        <div className="card">
          <h3 style={{ ...s.cardTitle, marginBottom: 14 }}>
            <Paperclip size={13} style={{ display: 'inline', marginRight: 6 }} />
            Anexos ({anexos.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {anexos.map(a => {
              const Icon = fileIcon(a.mime_type)
              return (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                  background: 'var(--bg-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                }}>
                  <Icon size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome_arquivo}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{formatBytes(a.tamanho_bytes)}</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" style={{ padding: '5px 8px', color: 'var(--accent)' }}
                    onClick={() => downloadAnexo(a)} title="Baixar">
                    <Download size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Pareceres */}
      {(sol.supervisor_id || diretores.some(d => d.status !== 'pendente') || sol.status === STATUS.REJECTED) && (
        <div className="card">
          <h3 style={{ ...s.cardTitle, marginBottom: 14 }}>Pareceres</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sol.supervisor_id && sol.supervisor && (
              <ParecerBox tipo="Supervisor" nome={sol.supervisor.nome}
                comentario={sol.supervisor_comentario} data={sol.supervisor_aprovado_em} status="aprovado" />
            )}
            {diretores.filter(d => d.status !== 'pendente').map(d => (
              <ParecerBox key={d.id} tipo="Diretor" nome={d.diretor?.nome || ''}
                comentario={d.comentario} data={d.decidido_em} status={d.status} />
            ))}
            {sol.status === STATUS.REJECTED && sol.motivo_rejeicao && (
              <ParecerBox tipo="Rejeição" nome={sol.rejeitado_por?.nome || ''}
                comentario={sol.motivo_rejeicao} data={sol.rejeitado_em} status="rejeitado" />
            )}
          </div>
        </div>
      )}

      {/* Aprovação dos Diretores — visível para todos quando já foram selecionados */}
      {diretores.length > 0 && (
        <div className="card">
          <h3 style={{ ...s.cardTitle, marginBottom: 14 }}>Aprovação dos Diretores</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {diretores.map(d => {
              const isAprov = d.status === 'aprovado'
              const isPend  = d.status === 'pendente'
              return (
                <div key={d.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px',
                  borderRadius: 'var(--radius-sm)',
                  background: isAprov ? 'var(--green-bg)' : isPend ? 'var(--bg-2)' : 'var(--red-bg)',
                  border: `1px solid ${isAprov ? 'var(--green-border)' : isPend ? 'var(--border)' : 'var(--red-border)'}`,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: isAprov ? 'var(--green)' : isPend ? 'var(--border)' : 'var(--red)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'white' }}>
                      {isAprov ? '✓' : isPend ? '?' : '✕'}
                    </span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: isAprov ? 'var(--green)' : isPend ? 'var(--text)' : 'var(--red)' }}>
                      {d.diretor?.nome || 'Diretor'}
                    </div>
                    {d.diretor?.departamento && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{d.diretor.departamento}</div>}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: isAprov ? 'var(--green)' : isPend ? 'var(--text-3)' : 'var(--red)' }}>
                    {isAprov ? 'Aprovado' : isPend ? 'Pendente' : 'Rejeitado'}
                  </span>
                  {d.decidido_em && (
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      {format(new Date(d.decidido_em), 'dd/MM HH:mm')}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* AÇÃO DO APROVADOR */}
      {canAct && sol.status !== STATUS.REJECTED && (
        <div className="card" style={{ borderColor: 'var(--border-light)', background: 'var(--bg-card-2)' }}>
          <h3 style={{ ...s.cardTitle, marginBottom: 14 }}>
            Ação do {canActSupervisor ? 'supervisor' : 'diretor'}
          </h3>

          {!showRejectForm ? (
            <>
              {/* Diretor vinculado — exibe nome automaticamente */}
              {canActSupervisor && (
                <div className="input-group" style={{ marginBottom: 18 }}>
                  <label>Diretor responsável</label>
                  {dirSel.length > 0 ? (
                    allDiretores.filter(d => dirSel.includes(d.id)).map(d => (
                      <div key={d.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--accent)',
                        background: 'var(--accent-dim)',
                      }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                          background: 'var(--accent)', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white',
                        }}>
                          {d.nome.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>{d.nome}</div>
                          {d.departamento && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{d.departamento}</div>}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: 13, color: 'var(--red)', padding: '8px 0' }}>
                      ⚠ Nenhum diretor vinculado ao seu perfil. Solicite ao administrador.
                    </div>
                  )}
                  {dirError && (
                    <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4, fontWeight: 500 }}>
                      ⚠ {dirError}
                    </div>
                  )}
                </div>
              )}

              <div className="input-group" style={{ marginBottom: 14 }}>
                <label>
                  <MessageSquare size={12} style={{ display: 'inline', marginRight: 5 }} />
                  Comentário opcional
                </label>
                <textarea className="input" rows={3} placeholder="Observação sobre sua decisão..."
                  value={comentario} onChange={e => setComentario(e.target.value)} />
              </div>

              <div style={{ display: 'flex', gap: 10 }} className="action-buttons">
                <button className="btn btn-success" onClick={handleAprovar} disabled={saving}>
                  {saving
                    ? <span className="spinner" style={{ width: 14, height: 14, borderTopColor: 'var(--green)' }} />
                    : <CheckCircle size={15} />}
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
                <textarea className="input" rows={3} placeholder="Explique o motivo..."
                  value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus />
              </div>
              <div style={{ display: 'flex', gap: 10 }} className="action-buttons">
                <button className="btn btn-danger" onClick={handleRejeitar} disabled={saving || !motivo.trim()}>
                  {saving
                    ? <span className="spinner" style={{ width: 14, height: 14, borderTopColor: 'var(--red)' }} />
                    : <XCircle size={15} />}
                  Confirmar rejeição
                </button>
                <button className="btn btn-ghost" onClick={() => { setShowRejectForm(false); setMotivo('') }}>
                  Cancelar
                </button>
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
            {historico.map((item, idx) => {
              const isAprov = item.descricao?.startsWith('Aprovado')
              const isRej   = item.descricao?.startsWith('Rejeitado')
              return (
                <div key={item.id} style={{ display: 'flex', gap: 14, paddingBottom: idx < historico.length - 1 ? 18 : 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: isAprov ? 'var(--green-bg)' : isRej ? 'var(--red-bg)' : 'var(--accent-glow)',
                      color:      isAprov ? 'var(--green)'    : isRej ? 'var(--red)'    : 'var(--accent)',
                      border: `1px solid ${isAprov ? 'var(--green-border)' : isRej ? 'var(--red-border)' : 'rgba(26,92,56,0.25)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
                    }}>
                      {isAprov ? '✓' : isRej ? '✕' : '·'}
                    </div>
                    {idx < historico.length - 1 && (
                      <div style={{ width: 1, flex: 1, background: 'var(--border)', margin: '4px 0' }} />
                    )}
                  </div>
                  <div style={{ paddingTop: 4 }}>
                    <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{item.descricao}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
                      {format(new Date(item.created_at), "dd/MM/yyyy 'às' HH:mm")}
                      {item.profiles?.nome && ` · ${item.profiles.nome}`}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function ProgressTracker({ sol, diretores }) {
  const skipSupervisor = ['supervisor', 'diretor'].includes(sol.solicitante?.role)
  const supDone = skipSupervisor || [STATUS.SUPERVISOR_APPROVED, STATUS.PARTIAL, STATUS.APPROVED].includes(sol.status)
  const totalDirs = diretores.length
  const aprovDirs = diretores.filter(d => d.status === 'aprovado').length

  const steps = [
    { label: 'Criado',     done: true,       date: sol.created_at },
    { label: 'Supervisor', done: supDone,     skip: skipSupervisor, date: sol.supervisor_aprovado_em },
    {
      label: totalDirs > 0
        ? (totalDirs > 1 ? `Diretores (${aprovDirs}/${totalDirs})` : 'Diretor')
        : 'Diretor(es)',
      done: sol.status === STATUS.APPROVED,
      skip: sol.solicitante?.role === 'diretor',
      pending: sol.status === STATUS.SUPERVISOR_APPROVED && totalDirs === 0,
    },
    {
      label:    sol.status === STATUS.REJECTED ? 'Rejeitado' : 'Aprovado',
      done:     sol.status === STATUS.APPROVED,
      rejected: sol.status === STATUS.REJECTED,
    },
  ]

  return (
    <div className="card" style={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto' }}>
      {steps.map((step, i) => (
        <div key={step.label} style={{ display: 'flex', alignItems: 'flex-start', flex: i < steps.length - 1 ? 1 : undefined, minWidth: 70 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              background: step.done ? 'var(--green-bg)' : step.rejected ? 'var(--red-bg)' : 'var(--bg-2)',
              color:      step.done ? 'var(--green)'    : step.rejected ? 'var(--red)'    : 'var(--text-3)',
              border: `2px solid ${step.done ? 'var(--green)' : step.rejected ? 'var(--red)' : 'var(--border)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
            }}>
              {step.done ? '✓' : step.rejected ? '✕' : step.skip ? '–' : '○'}
            </div>
            <span style={{
              fontSize: 10, fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap',
              color: step.done ? 'var(--green)' : step.rejected ? 'var(--red)' : step.pending ? 'var(--yellow)' : 'var(--text-3)',
            }}>
              {step.label}
              {step.pending && ' ⏳'}
            </span>
            {step.date && (
              <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                {format(new Date(step.date), 'dd/MM HH:mm')}
              </span>
            )}
          </div>
          {i < steps.length - 1 && (
            <div style={{
              flex: 1, height: 2,
              background: steps[i + 1]?.done ? 'var(--green)' : 'var(--border)',
              margin: '16px 6px 0',
            }} />
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
        <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 1 }}>
          {label}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text)', ...valueStyle }}>{value}</div>
      </div>
    </div>
  )
}

function ParecerBox({ tipo, nome, comentario, data, status }) {
  const isAprov = status === 'aprovado'
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 'var(--radius-sm)',
      background: isAprov ? 'var(--green-bg)' : 'var(--red-bg)',
      border: `1px solid ${isAprov ? 'var(--green-border)' : 'var(--red-border)'}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: comentario ? 6 : 0 }}>
        <span style={{
          fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
          color: isAprov ? 'var(--green)' : 'var(--red)',
        }}>
          {isAprov ? '✓' : '✕'} {tipo}{nome ? ` · ${nome}` : ''}
        </span>
        {data && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{format(new Date(data), 'dd/MM HH:mm')}</span>}
      </div>
      {comentario && <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>{comentario}</p>}
    </div>
  )
}

const s = {
  cardTitle: {
    fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13,
    color: 'var(--text-2)', letterSpacing: '0.04em', textTransform: 'uppercase',
  },
}
