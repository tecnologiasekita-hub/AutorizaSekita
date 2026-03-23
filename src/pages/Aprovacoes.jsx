import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { CheckSquare, Search, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { APPROVER_STATUS, getRequestSetor, getRequestValue, getStatusMeta, isFinishedStatus } from '../lib/workflow'

const SETORES = [
  'TI',
  'Controladoria',
  'Tesouraria',
  'Ambiental',
  'Contas a Pagar',
  'Compras',
  'Assinatura Digital',
  'Jurídico',
  'Financeiro',
  'Comercial',
]

export default function Aprovacoes() {
  const { profile, isSupervisor, isDirector } = useAuth()
  const isTesouraria = isSupervisor && profile?.departamento === 'Tesouraria'
  const navigate = useNavigate()
  const location = useLocation()

  const [solicitacoes, setSolicitacoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('pendentes')
  const [deptoFilter, setDeptoFilter] = useState('')
  const [decisionFilter, setDecisionFilter] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const nextFilter = params.get('filter') === 'concluidas' ? 'concluidas' : 'pendentes'
    const nextDecision = params.get('decision') || ''

    setFilter(nextFilter)
    setDecisionFilter(nextDecision)

    if (profile) {
      fetchSolicitacoes(nextFilter, nextDecision)
    }
  }, [location.search, profile])

  useEffect(() => {
    if (profile) fetchSolicitacoes(filter, decisionFilter)
  }, [profile, filter, decisionFilter])

  async function fetchSolicitacoes(filterOverride = filter, decisionOverride = decisionFilter) {
    if (!profile) return
    setLoading(true)

    try {
      let query = supabase
        .from('solicitacao_aprovadores')
        .select(`
          *,
          solicitacao:solicitacoes(
            *,
            profiles!solicitacoes_solicitante_id_fkey(nome, email, departamento)
          )
        `)
        .eq('usuario_id', profile.id)
        .order('created_at', { ascending: false })

      query = filterOverride === 'pendentes'
        ? query.eq('status', APPROVER_STATUS.PENDING)
        : query.neq('status', APPROVER_STATUS.PENDING)

      if (filterOverride === 'concluidas' && decisionOverride) {
        query = query.eq('status', decisionOverride)
      }

      const { data } = await query

      const flat = (data || [])
        .filter(row => row.solicitacao)
        .map(row => ({
          ...row.solicitacao,
          profiles: row.solicitacao.profiles,
          _minha_decisao: row.status,
          _papel_aprovador: row.papel,
          _ordem_aprovador: row.ordem,
          _comentario_aprovador: row.comentario,
          _decidido_em: row.decidido_em,
        }))

      setSolicitacoes(flat)
    } finally {
      setLoading(false)
    }
  }

  const filtered = solicitacoes
    .filter(item => !deptoFilter || getRequestSetor(item) === deptoFilter)
    .filter(item => !decisionFilter || item._minha_decisao === decisionFilter)
    .filter(item => {
      const q = search.toLowerCase()
      return (
        item.titulo?.toLowerCase().includes(q) ||
        item.formulario_tipo?.toLowerCase().includes(q) ||
        (item.profiles?.nome || '').toLowerCase().includes(q)
      )
    })

  const pendingCount = solicitacoes.filter(item => item._minha_decisao === APPROVER_STATUS.PENDING && !isFinishedStatus(item.status)).length

  const roleName = isTesouraria ? 'Tesouraria' : isSupervisor ? 'Supervisor' : 'Diretor'
  const roleColor = isSupervisor ? 'var(--blue)' : 'var(--accent-2)'
  const roleBg = isSupervisor ? 'var(--blue-bg)' : 'var(--accent-2-dim)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }} className="fade-in">
      <div>
        <h1 style={{ fontFamily: 'var(--font-body)', fontSize: 24, fontWeight: 700, color: 'var(--green-brand)' }}>
          Aprovações
        </h1>
        <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 2 }}>
          {isTesouraria ? 'Solicitações aguardando autorização da Tesouraria' : `Fila de aprovação como ${roleName}`}
        </p>
      </div>

      <div className="card" style={{ background: roleBg, borderColor: `${roleColor}30` }}>
        <div style={{ fontSize: 13, color: roleColor }}>
          <strong>Como {roleName}:</strong>{' '}
          {isTesouraria
            ? 'Você autoriza as solicitações que exigem validação financeira.'
            : isSupervisor
              ? 'Você faz a primeira análise das solicitações que chegam à sua fila.'
              : 'Você decide as solicitações que foram encaminhadas para sua aprovação.'}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }} className="filter-scroll">
          <button
            className={`btn btn-sm ${filter === 'pendentes' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setFilter('pendentes')}
          >
            <Clock size={13} />
            Pendentes
            {filter === 'pendentes' && pendingCount > 0 && (
              <span style={{ background: 'rgba(255,255,255,0.22)', borderRadius: 10, padding: '0 6px', fontSize: 11 }}>
                {pendingCount}
              </span>
            )}
          </button>

          <button
            className={`btn btn-sm ${filter === 'concluidas' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setFilter('concluidas')}
          >
            <CheckSquare size={13} /> Concluídas
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              className="input"
              placeholder="Buscar..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 32, width: 200 }}
            />
          </div>

          <select
            className="input"
            value={deptoFilter}
            onChange={e => setDeptoFilter(e.target.value)}
            style={{ cursor: 'pointer', width: 200 }}
          >
            <option value="">Todos os setores</option>
            {SETORES.map(setor => (
              <option key={setor} value={setor}>{setor}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="spinner" style={{ width: 28, height: 28 }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 52, color: 'var(--text-3)' }}>
          <CheckSquare size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.25 }} />
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            {filter === 'pendentes' ? 'Nenhuma pendência no momento' : 'Nenhuma aprovação concluída ainda'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(item => {
            const status = getStatusMeta(item.status)
            const valor = getRequestValue(item)
            const setor = getRequestSetor(item)

            return (
              <div
                key={`${item.id}-${item._papel_aprovador}-${item._ordem_aprovador}`}
                className="card"
                onClick={() => navigate(`/solicitacao/${item.id}`)}
                style={{ cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--border-light)'
                  e.currentTarget.style.background = 'var(--bg-card-2)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.background = 'var(--bg-card)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                      {item.numero && (
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: 'white',
                            background: 'var(--accent)',
                            borderRadius: 4,
                            padding: '2px 7px',
                            flexShrink: 0,
                          }}
                        >
                          #{item.numero}
                        </span>
                      )}
                      <span style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.titulo}
                      </span>
                    </div>

                    <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <span>Por: <strong style={{ color: 'var(--text-2)' }}>{item.profiles?.nome}</strong></span>
                      {setor && <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{setor}</span>}
                      <span>{format(new Date(item.created_at), "dd/MM 'às' HH:mm")}</span>
                      {valor != null && (
                        <span>R$ {valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
                    <span className={`badge ${status.cls}`}>
                      <span className={`status-dot ${status.dot}`} />
                      {status.label}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
