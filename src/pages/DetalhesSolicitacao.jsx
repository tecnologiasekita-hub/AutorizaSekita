import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { FLOW_EVENTS, notificarFluxoFormulario } from '../lib/notificar'
import { supabase } from '../lib/supabase'
import {
  ArrowLeft, CheckCircle, XCircle, User, MessageSquare,
  DollarSign, Tag, Paperclip, Download, FileText, Image, File,
} from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  APPROVER_ROLE,
  APPROVER_STATUS,
  STATUS,
  formatBytes,
  getApproverRoleLabel,
  getCurrentPendingApprovers,
  isFinishedStatus,
  getRequestRequiresTreasury,
  getRequestSetor,
  getRequestValue,
  getStatusMeta,
  normalizeFormData,
} from '../lib/workflow'

function fileIcon(mime) {
  if (!mime) return File
  if (mime.startsWith('image/')) return Image
  if (mime === 'application/pdf') return FileText
  return File
}

export default function DetalhesSolicitacao() {
  const { id } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [sol, setSol] = useState(null)
  const [historico, setHistorico] = useState([])
  const [aprovadores, setAprovadores] = useState([])
  const [pareceres, setPareceres] = useState([])
  const [anexos, setAnexos] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [comentario, setComentario] = useState('')
  const [motivo, setMotivo] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [dirSel, setDirSel] = useState([])
  const [dirError, setDirError] = useState('')

  useEffect(() => { fetchData() }, [id])

  useEffect(() => {
    async function autoSelectDiretor() {
      if (!profile || profile.role !== 'supervisor' || profile.departamento === 'Tesouraria') return
      const { data } = await supabase
        .from('profiles')
        .select('diretor_id')
        .eq('id', profile.id)
        .single()

      if (data?.diretor_id) setDirSel([data.diretor_id])
    }

    autoSelectDiretor()
  }, [profile])

  async function fetchData() {
    setLoading(true)
    try {
      const [
        { data: solData },
        { data: histData },
        { data: aprovData },
        { data: parecerData },
        { data: anexoData },
      ] = await Promise.all([
        supabase.from('solicitacoes').select(`
          *,
          solicitante:profiles!solicitacoes_solicitante_id_fkey(id, nome, email, role, departamento)
        `).eq('id', id).single(),
        supabase.from('historico').select('*, profiles(nome)').eq('solicitacao_id', id).order('created_at', { ascending: true }),
        supabase.from('solicitacao_aprovadores').select(`
          *,
          usuario:profiles!solicitacao_aprovadores_usuario_id_fkey(id, nome, departamento)
        `).eq('solicitacao_id', id).order('ordem', { ascending: true }).order('created_at', { ascending: true }),
        supabase.from('solicitacao_pareceres').select(`
          *,
          usuario:profiles!solicitacao_pareceres_usuario_id_fkey(id, nome, departamento)
        `).eq('solicitacao_id', id).order('created_at', { ascending: true }),
        supabase.from('anexos').select('*').eq('solicitacao_id', id).order('created_at', { ascending: true }),
      ])

      setSol(solData)
      setHistorico(histData || [])
      setAprovadores(aprovData || [])
      setPareceres(parecerData || [])
      setAnexos(anexoData || [])
    } finally {
      setLoading(false)
    }
  }

  const pendingApprovers = useMemo(() => getCurrentPendingApprovers(aprovadores), [aprovadores])
  const myApproverRow = pendingApprovers.find(item => item.usuario_id === profile?.id)
  const canAct = Boolean(myApproverRow) && sol?.status !== STATUS.REJECTED && sol?.status !== STATUS.APPROVED && sol?.status !== STATUS.CANCELED

  async function addHistorico(tipo_evento, descricao, meta = {}) {
    await supabase.from('historico').insert({
      solicitacao_id: id,
      usuario_id: profile.id,
      tipo_evento,
      descricao,
      meta,
    })
  }

  async function notifyFlow(evento, extra = {}) {
    await notificarFluxoFormulario(sol?.formulario_tipo, evento, {
      solicitacaoId: id,
      titulo: sol?.titulo,
      actorNome: profile?.nome,
      solicitanteId: sol?.solicitante_id,
      supervisorId: extra.supervisorId,
      diretorIds: extra.diretorIds || [],
      tesourariaIds: extra.tesourariaIds || [],
    })
  }

  async function handleAprovar() {
    if (!myApproverRow) return
    setSaving(true)

    try {
      const now = new Date().toISOString()

      await supabase.from('solicitacao_aprovadores').update({
        status: APPROVER_STATUS.APPROVED,
        comentario: comentario || null,
        decidido_em: now,
      }).eq('id', myApproverRow.id)

      await supabase.from('solicitacao_pareceres').insert({
        solicitacao_id: id,
        usuario_id: profile.id,
        papel: myApproverRow.papel,
        decisao: myApproverRow.papel === APPROVER_ROLE.TREASURY ? 'autorizado' : 'aprovado',
        comentario: comentario || null,
      })

      await addHistorico(
        myApproverRow.papel === APPROVER_ROLE.TREASURY ? 'autorizacao_tesouraria' : `aprovacao_${myApproverRow.papel}`,
        (myApproverRow.papel === APPROVER_ROLE.TREASURY ? 'Autorizado pela ' : 'Aprovado pelo ') + getApproverRoleLabel(myApproverRow.papel) + ' ' + profile.nome + (comentario ? ': ' + comentario : '')
      )

      if (myApproverRow.papel === APPROVER_ROLE.SUPERVISOR) {
        if (!dirSel.length) {
          setDirError('Nenhum diretor vinculado ao seu perfil.')
          setSaving(false)
          return
        }

        await supabase.from('solicitacao_aprovadores').insert(
          dirSel.map(did => ({
            solicitacao_id: id,
            usuario_id: did,
            papel: APPROVER_ROLE.DIRECTOR,
            ordem: 2,
            status: APPROVER_STATUS.PENDING,
          }))
        )

        await notifyFlow(FLOW_EVENTS.SUPERVISOR_APPROVED, {
          supervisorId: profile.id,
          diretorIds: dirSel,
        })
        await supabase.from('solicitacoes').update({ status: STATUS.IN_APPROVAL, updated_at: now }).eq('id', id)
      } else if (myApproverRow.papel === APPROVER_ROLE.DIRECTOR) {
        const { data: remainingDirectors } = await supabase
          .from('solicitacao_aprovadores')
          .select('id')
          .eq('solicitacao_id', id)
          .eq('papel', APPROVER_ROLE.DIRECTOR)
          .eq('status', APPROVER_STATUS.PENDING)

        if ((remainingDirectors || []).length === 0 && getRequestRequiresTreasury(sol)) {
          const { data: tesourariaUsers } = await supabase
            .from('profiles')
            .select('id')
            .eq('role', 'supervisor')
            .eq('departamento', 'Tesouraria')

          const tesourariaIds = (tesourariaUsers || []).map(item => item.id)

          if (tesourariaIds.length) {
            await supabase.from('solicitacao_aprovadores').insert(
              tesourariaIds.map(uid => ({
                solicitacao_id: id,
                usuario_id: uid,
                papel: APPROVER_ROLE.TREASURY,
                ordem: 3,
                status: APPROVER_STATUS.PENDING,
              }))
            )

            await notifyFlow(FLOW_EVENTS.DIRECTOR_APPROVED, {
              supervisorId: aprovadores.find(item => item.papel === APPROVER_ROLE.SUPERVISOR)?.usuario_id,
              tesourariaIds,
            })
            await supabase.from('solicitacoes').update({ status: STATUS.IN_APPROVAL, updated_at: now }).eq('id', id)
          } else {
            await supabase.from('solicitacoes').update({ status: STATUS.APPROVED, updated_at: now }).eq('id', id)
            await notifyFlow(FLOW_EVENTS.DIRECTOR_APPROVED, {
              supervisorId: aprovadores.find(item => item.papel === APPROVER_ROLE.SUPERVISOR)?.usuario_id,
            })
          }
        } else if ((remainingDirectors || []).length === 0) {
          await supabase.from('solicitacoes').update({ status: STATUS.APPROVED, updated_at: now }).eq('id', id)
          await notifyFlow(FLOW_EVENTS.DIRECTOR_APPROVED, {
            supervisorId: aprovadores.find(item => item.papel === APPROVER_ROLE.SUPERVISOR)?.usuario_id,
          })
        } else {
          await supabase.from('solicitacoes').update({ status: STATUS.IN_APPROVAL, updated_at: now }).eq('id', id)
        }
      } else {
        await supabase.from('solicitacoes').update({ status: STATUS.APPROVED, updated_at: now }).eq('id', id)
        await notifyFlow(FLOW_EVENTS.TREASURY_APPROVED, {
          supervisorId: aprovadores.find(item => item.papel === APPROVER_ROLE.SUPERVISOR)?.usuario_id,
          diretorIds: aprovadores.filter(item => item.papel === APPROVER_ROLE.DIRECTOR).map(item => item.usuario_id),
        })
      }

      await fetchData()
      setComentario('')
      setDirError('')
    } finally {
      setSaving(false)
    }
  }

  async function handleRejeitar() {
    if (!motivo.trim() || !myApproverRow) return
    setSaving(true)

    try {
      const now = new Date().toISOString()

      await supabase.from('solicitacao_aprovadores').update({
        status: APPROVER_STATUS.REJECTED,
        comentario: motivo.trim(),
        decidido_em: now,
      }).eq('id', myApproverRow.id)

      await supabase.from('solicitacao_pareceres').insert({
        solicitacao_id: id,
        usuario_id: profile.id,
        papel: myApproverRow.papel,
        decisao: 'rejeitado',
        comentario: motivo.trim(),
      })

      await supabase.from('solicitacoes').update({
        status: STATUS.REJECTED,
        updated_at: now,
      }).eq('id', id)

      if (myApproverRow.papel === APPROVER_ROLE.SUPERVISOR) {
        await notifyFlow(FLOW_EVENTS.SUPERVISOR_REJECTED)
      } else if (myApproverRow.papel === APPROVER_ROLE.DIRECTOR) {
        await notifyFlow(FLOW_EVENTS.DIRECTOR_REJECTED, {
          supervisorId: aprovadores.find(item => item.papel === APPROVER_ROLE.SUPERVISOR)?.usuario_id,
        })
      } else {
        await notifyFlow(FLOW_EVENTS.TREASURY_REJECTED, {
          supervisorId: aprovadores.find(item => item.papel === APPROVER_ROLE.SUPERVISOR)?.usuario_id,
          diretorIds: aprovadores.filter(item => item.papel === APPROVER_ROLE.DIRECTOR).map(item => item.usuario_id),
        })
      }

      await addHistorico(
        'rejeicao',
        'Rejeitado pelo ' + getApproverRoleLabel(myApproverRow.papel) + ' ' + profile.nome + ': ' + motivo.trim()
      )

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
    a.href = url
    a.download = anexo.nome_arquivo
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <div className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    )
  }

  if (!sol) {
    return (
      <div style={{ color: 'var(--text-3)', padding: 40, textAlign: 'center' }}>Solicitação não encontrada.</div>
    )
  }

  const statusMeta = getStatusMeta(sol.status)
  const setor = getRequestSetor(sol)
  const valor = getRequestValue(sol)
  const groupedApprovers = groupApprovers(aprovadores)

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }} className="fade-in audit-print-root">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <button className="btn btn-ghost btn-sm no-print" onClick={() => navigate(-1)} style={{ marginTop: 3 }}>
            <ArrowLeft size={15} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
              {sol.numero && (
                <span style={{ fontSize: 13, fontWeight: 700, color: 'white', background: 'var(--accent)', borderRadius: 4, padding: '3px 9px', flexShrink: 0 }}>
                  #{sol.numero}
                </span>
              )}
              <h1 style={{ fontFamily: 'var(--font-body)', fontSize: 20, fontWeight: 700, color: 'var(--green-brand)', margin: 0 }}>
                {sol.titulo}
              </h1>
              <span className={'badge ' + statusMeta.cls}>
                <span className={'status-dot ' + statusMeta.dot} />
                {statusMeta.label}
              </span>
            </div>
            <p style={{ color: 'var(--text-3)', fontSize: 12 }}>
              Criado em {format(new Date(sol.created_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          </div>
        </div>

        {isFinishedStatus(sol.status) && (
          <div className="no-print" style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline btn-sm" onClick={() => window.print()}>
              Exportar PDF
            </button>
          </div>
        )}
      </div>

      <ProgressTracker sol={sol} groupedApprovers={groupedApprovers} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 style={s.cardTitle}>Detalhes</h3>
          <InfoRow icon={User} label="Solicitante" value={sol.solicitante?.nome || '-'} />
          {sol.formulario_tipo && <InfoRow icon={Tag} label="Formulário" value={sol.formulario_tipo} />}
          {setor && <InfoRow icon={Tag} label="Setor de origem" value={setor} />}
          {valor != null && (
            <InfoRow icon={DollarSign} label="Valor" value={'R$ ' + valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} />
          )}
        </div>

        <div className="card">
          {sol.formulario_tipo === 'renegociacao_venda'
            ? <RenegociacaoDetails dados={sol.dados_formulario} descricao={sol.descricao} />
            : (
              <>
                <h3 style={{ ...s.cardTitle, marginBottom: 10 }}>Descrição</h3>
                <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
                  {sol.descricao}
                </p>
              </>
            )}
        </div>
      </div>

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
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                  <Icon size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.nome_arquivo}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{formatBytes(a.tamanho_bytes)}</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" style={{ padding: '5px 8px', color: 'var(--accent)' }} onClick={() => downloadAnexo(a)} title="Baixar">
                    <Download size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {pareceres.length > 0 && (
        <div className="card">
          <h3 style={{ ...s.cardTitle, marginBottom: 14 }}>Pareceres</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pareceres.map(item => (
              <ParecerBox
                key={item.id}
                tipo={getApproverRoleLabel(item.papel)}
                nome={item.usuario?.nome || ''}
                comentario={item.comentario}
                data={item.created_at}
                status={item.decisao === 'rejeitado' ? 'rejeitado' : 'aprovado'}
              />
            ))}
          </div>
        </div>
      )}

      {aprovadores.length > 0 && (
        <div className="card">
          <h3 style={{ ...s.cardTitle, marginBottom: 14 }}>Fluxo de aprovação</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {groupedApprovers.map(grupo => (
              <div key={grupo.ordem} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Etapa {grupo.ordem} · {grupo.label}
                </div>
                {grupo.items.map(item => {
                  const isPend = item.status === APPROVER_STATUS.PENDING
                  const isAprov = item.status === APPROVER_STATUS.APPROVED

                  return (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px', borderRadius: 'var(--radius-sm)', background: isAprov ? 'var(--green-bg)' : isPend ? 'var(--bg-2)' : 'var(--red-bg)', border: '1px solid ' + (isAprov ? 'var(--green-border)' : isPend ? 'var(--border)' : 'var(--red-border)') }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: isAprov ? 'var(--green)' : isPend ? 'var(--border)' : 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'white' }}>
                          {isAprov ? 'OK' : isPend ? '?' : 'X'}
                        </span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: isAprov ? 'var(--green)' : isPend ? 'var(--text)' : 'var(--red)' }}>
                          {item.usuario?.nome || 'Aprovador'}
                        </div>
                        {item.usuario?.departamento && (
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{item.usuario.departamento}</div>
                        )}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: isAprov ? 'var(--green)' : isPend ? 'var(--text-3)' : 'var(--red)' }}>
                        {isAprov ? 'Aprovado' : isPend ? 'Pendente' : 'Rejeitado'}
                      </span>
                      {item.decidido_em && (
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                          {format(new Date(item.decidido_em), 'dd/MM HH:mm')}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {canAct && (
        <div className="card no-print" style={{ borderColor: 'var(--border-light)', background: 'var(--bg-card-2)' }}>
          <h3 style={{ ...s.cardTitle, marginBottom: 14 }}>
            Ação do {getApproverRoleLabel(myApproverRow.papel)}
          </h3>

          {myApproverRow.papel === APPROVER_ROLE.SUPERVISOR && (
            <div className="input-group" style={{ marginBottom: 18 }}>
              <label>Diretor responsável</label>
              {dirSel.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {dirSel.map(item => (
                    <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--accent)', background: 'var(--accent-dim)' }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white' }}>
                        D
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>Diretor vinculado</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--red)', padding: '8px 0' }}>
                  Nenhum diretor vinculado ao seu perfil.
                </div>
              )}
              {dirError && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{dirError}</div>}
            </div>
          )}

          {!showRejectForm ? (
            <>
              <div className="input-group" style={{ marginBottom: 14 }}>
                <label>
                  <MessageSquare size={12} style={{ display: 'inline', marginRight: 5 }} />
                  Comentário opcional
                </label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Observação sobre sua decisão..."
                  value={comentario}
                  onChange={e => setComentario(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: 10 }} className="action-buttons">
                <button className="btn btn-success" onClick={handleAprovar} disabled={saving}>
                  {saving
                    ? <span className="spinner" style={{ width: 14, height: 14, borderTopColor: 'var(--green)' }} />
                    : <CheckCircle size={15} />}
                  {myApproverRow.papel === APPROVER_ROLE.TREASURY ? 'Autorizar' : 'Aprovar'}
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
              <div style={{ display: 'flex', gap: 10 }} className="action-buttons">
                <button className="btn btn-danger" onClick={handleRejeitar} disabled={saving || !motivo.trim()}>
                  {saving
                    ? <span className="spinner" style={{ width: 14, height: 14, borderTopColor: 'var(--red)' }} />
                    : <XCircle size={15} />}
                  Rejeitar solicitação
                </button>
                <button className="btn btn-ghost" onClick={() => { setShowRejectForm(false); setMotivo('') }}>
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {historico.length > 0 && (
        <div className="card">
          <h3 style={{ ...s.cardTitle, marginBottom: 16 }}>Histórico</h3>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {historico.map((item, idx) => {
              const isAprov = String(item.tipo_evento || '').startsWith('aprovacao') || item.tipo_evento === 'autorizacao_tesouraria'
              const isRej = item.tipo_evento === 'rejeicao'
              return (
                <div key={item.id} style={{ display: 'flex', gap: 14, paddingBottom: idx < historico.length - 1 ? 18 : 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: isAprov ? 'var(--green-bg)' : isRej ? 'var(--red-bg)' : 'var(--accent-glow)', color: isAprov ? 'var(--green)' : isRej ? 'var(--red)' : 'var(--accent)', border: '1px solid ' + (isAprov ? 'var(--green-border)' : isRej ? 'var(--red-border)' : 'rgba(26,92,56,0.25)'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                      {isAprov ? 'OK' : isRej ? 'X' : '.'}
                    </div>
                    {idx < historico.length - 1 && (
                      <div style={{ width: 1, flex: 1, background: 'var(--border)', margin: '4px 0' }} />
                    )}
                  </div>
                  <div style={{ paddingTop: 4 }}>
                    <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{item.descricao}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
                      {format(new Date(item.created_at), "dd/MM/yyyy 'às' HH:mm")}
                      {item.profiles?.nome && ' · ' + item.profiles.nome}
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

function ProgressTracker({ sol, groupedApprovers }) {
  const requiresTreasury = getRequestRequiresTreasury(sol)
  const hasSupervisorStage = groupedApprovers.some(group => group.items[0]?.papel === APPROVER_ROLE.SUPERVISOR)
  const hasDirectorStage = groupedApprovers.some(group => group.items[0]?.papel === APPROVER_ROLE.DIRECTOR)
  const hasTreasuryStage = groupedApprovers.some(group => group.items[0]?.papel === APPROVER_ROLE.TREASURY)
  const reservedStages = []

  if (sol.formulario_tipo === 'renegociacao_venda') {
    if (!hasSupervisorStage) {
      reservedStages.push({ label: 'Supervisor', done: false, rejected: false, date: null })
    }

    if (!hasDirectorStage) {
      reservedStages.push({ label: 'Diretor', done: false, rejected: false, date: null })
    }
  }

  if (requiresTreasury && !hasTreasuryStage) {
    reservedStages.push({ label: 'Tesouraria', done: false, rejected: false, date: null })
  }
  const steps = [
    { label: 'Criado', done: true, date: sol.created_at },
    ...groupedApprovers.map(group => {
      const aprovados = group.items.filter(item => item.status === APPROVER_STATUS.APPROVED).length
      const rejeitado = group.items.some(item => item.status === APPROVER_STATUS.REJECTED)
      const done = aprovados === group.items.length
      return {
        label: group.items.length > 1 ? `${group.label} (${aprovados}/${group.items.length})` : group.label,
        done,
        rejected: rejeitado,
        date: done ? group.items[group.items.length - 1]?.decidido_em : null,
      }
    }),
    ...reservedStages,
    {
      label: sol.status === STATUS.REJECTED ? 'Rejeitado' : 'Concluído',
      done: sol.status === STATUS.APPROVED,
      rejected: sol.status === STATUS.REJECTED,
    },
  ]

  return (
    <div className="card" style={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto' }}>
      {steps.map((step, i) => (
        <div key={step.label} style={{ display: 'flex', alignItems: 'flex-start', flex: i < steps.length - 1 ? 1 : undefined, minWidth: 70 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: step.done ? 'var(--green-bg)' : step.rejected ? 'var(--red-bg)' : 'var(--bg-2)', color: step.done ? 'var(--green)' : step.rejected ? 'var(--red)' : 'var(--text-3)', border: '2px solid ' + (step.done ? 'var(--green)' : step.rejected ? 'var(--red)' : 'var(--border)'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
              {step.done ? 'OK' : step.rejected ? 'X' : 'O'}
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap', color: step.done ? 'var(--green)' : step.rejected ? 'var(--red)' : 'var(--text-3)' }}>
              {step.label}
            </span>
            {step.date && (
              <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                {format(new Date(step.date), 'dd/MM HH:mm')}
              </span>
            )}
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 2, background: steps[i + 1]?.done ? 'var(--green)' : 'var(--border)', margin: '16px 6px 0' }} />
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
    <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: isAprov ? 'var(--green-bg)' : 'var(--red-bg)', border: '1px solid ' + (isAprov ? 'var(--green-border)' : 'var(--red-border)') }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: comentario ? 6 : 0 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: isAprov ? 'var(--green)' : 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {isAprov ? 'OK' : 'X'} {tipo}{nome ? ' · ' + nome : ''}
        </span>
        {data && (
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {format(new Date(data), 'dd/MM HH:mm')}
          </span>
        )}
      </div>
      {comentario && (
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>{comentario}</p>
      )}
    </div>
  )
}

function RenegociacaoDetails({ dados, descricao }) {
  const parsedDados = normalizeFormData(dados)

  if (!parsedDados || Object.keys(parsedDados).length === 0) {
    return (
      <>
        <h3 style={{ ...s.cardTitle, marginBottom: 10 }}>Descrição</h3>
        <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
          {descricao}
        </p>
      </>
    )
  }

  const novasDatas = getInstallmentDates(parsedDados)

  const rows = [
    ['Empresa de origem', parsedDados.empresa_origem],
    ['Cliente', parsedDados.cliente],
    ['Data de emissão', formatDateValue(parsedDados.data_emissao)],
    ['Data de vencimento', formatDateValue(parsedDados.data_vencimento)],
    ['Número do pedido/venda', parsedDados.numero_pedido_venda],
    ['Número da nota fiscal', parsedDados.numero_nota_fiscal],
    ['Valor', parsedDados.valor != null ? formatMoneyValue(parsedDados.valor) : null],
    ['Motivo', parsedDados.motivo_label || parsedDados.motivo],
    ['Justificativa', parsedDados.justificativa],
    ['Novas datas', novasDatas.length ? novasDatas.map(formatDateValue).join('\n') : null],
    ['Novo valor', parsedDados.novo_valor != null ? formatMoneyValue(parsedDados.novo_valor) : null],
    ['Observação', parsedDados.observacao],
  ].filter(([, value]) => value !== null && value !== undefined && value !== '')

  return (
    <>
      <h3 style={{ ...s.cardTitle, marginBottom: 10 }}>Dados do formulário</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map(([label, value], index) => (
          <div key={label} style={{ paddingBottom: index < rows.length - 1 ? 10 : 0, borderBottom: index < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 3 }}>
              {label}
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {value}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function getInstallmentDates(dados) {
  const datas = Array.isArray(dados?.novas_datas)
    ? dados.novas_datas
    : [dados?.nova_data, dados?.nova_data_2, dados?.nova_data_3]

  return datas.filter(Boolean)
}

function formatMoneyValue(value) {
  return 'R$ ' + Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
}

function formatDateValue(value) {
  if (!value) return ''
  const date = new Date(value + 'T00:00:00')
  return format(date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
}

function groupApprovers(aprovadores) {
  const grupos = new Map()

  for (const item of aprovadores || []) {
    const chave = item.ordem || 1
    if (!grupos.has(chave)) {
      grupos.set(chave, [])
    }
    grupos.get(chave).push(item)
  }

  return Array.from(grupos.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([ordem, items]) => ({
      ordem,
      items,
      label: buildGroupLabel(items),
    }))
}

function buildGroupLabel(items) {
  if (!items?.length) return 'Aprovação'
  const papel = items[0].papel

  if (papel === APPROVER_ROLE.DIRECTOR) {
    return items.length > 1 ? 'Diretores' : 'Diretor'
  }

  if (papel === APPROVER_ROLE.SUPERVISOR) return 'Supervisor'
  if (papel === APPROVER_ROLE.TREASURY) return 'Tesouraria'
  return 'Aprovador'
}

const s = {
  cardTitle: {
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: 13,
    color: 'var(--text-2)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
}
