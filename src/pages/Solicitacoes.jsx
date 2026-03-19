import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { FilePlus, Search, Clock, CheckCircle, FileText, SlidersHorizontal, X } from 'lucide-react'
import { format } from 'date-fns'
import { STATUS, URGENCY_META, getStatusMeta, isPendingForDirector } from '../lib/workflow'

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

const ABAS = [
  { id: 'minhas', label: 'Minhas', icon: FileText },
  { id: 'pendentes', label: 'Pendentes', icon: Clock },
  { id: 'historico', label: 'Histórico', icon: CheckCircle },
]

const PERIOD_LABELS = {
  hoje: 'Hoje',
  '7dias': 'Últimos 7 dias',
  '30dias': 'Últimos 30 dias',
}

const STATUS_LABELS = {
  [STATUS.PENDING]: 'Pendente',
  [STATUS.APPROVED]: 'Aprovado',
  [STATUS.REJECTED]: 'Rejeitado',
}

export default function Solicitacoes() {
  const { profile, isSupervisor, isDirector } = useAuth()
  const isTesouraria = isSupervisor && profile?.departamento === 'Tesouraria'
  const navigate = useNavigate()

  const defaultAba = isDirector ? 'pendentes' : 'minhas'
  const [aba, setAba] = useState(defaultAba)
  const [itens, setItens] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deptoFilter, setDeptoFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [periodFilter, setPeriodFilter] = useState('')
  const [pendCount, setPendCount] = useState(0)
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    if (profile) fetchItens()
  }, [profile, aba])

  useEffect(() => {
    async function countPend() {
      if (!profile) return

      if (isTesouraria) {
        const { count } = await supabase
          .from('solicitacoes')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'aguarda_tesouraria')
        setPendCount(count || 0)
        return
      }

      if (isSupervisor) {
        const { data: subs } = await supabase.from('profiles').select('id').eq('supervisor_id', profile.id)
        const ids = (subs || []).map(p => p.id)
        if (!ids.length) {
          setPendCount(0)
          return
        }
        const { count } = await supabase
          .from('solicitacoes')
          .select('*', { count: 'exact', head: true })
          .eq('status', STATUS.PENDING)
          .in('solicitante_id', ids)
        setPendCount(count || 0)
        return
      }

      if (isDirector) {
        const { count } = await supabase
          .from('solicitacao_diretores')
          .select('*', { count: 'exact', head: true })
          .eq('diretor_id', profile.id)
          .eq('status', 'pendente')
        setPendCount(count || 0)
      }
    }

    countPend()
  }, [profile, isSupervisor, isDirector, isTesouraria])

  async function fetchItens() {
    setLoading(true)
    try {
      if (aba === 'minhas') {
        const { data } = await supabase
          .from('solicitacoes')
          .select('*, profiles!solicitacoes_solicitante_id_fkey(nome)')
          .eq('solicitante_id', profile.id)
          .order('created_at', { ascending: false })
        setItens(data || [])
        return
      }

      if (aba === 'pendentes') {
        if (isTesouraria) {
          const { data } = await supabase
            .from('solicitacoes')
            .select('*, profiles!solicitacoes_solicitante_id_fkey(nome)')
            .eq('status', 'aguarda_tesouraria')
            .eq('requer_tesouraria', true)
            .order('created_at', { ascending: false })
          setItens(data || [])
          return
        }

        if (isSupervisor) {
          const { data: subs } = await supabase.from('profiles').select('id').eq('supervisor_id', profile.id)
          const ids = (subs || []).map(p => p.id)
          if (!ids.length) {
            setItens([])
            return
          }
          const { data } = await supabase
            .from('solicitacoes')
            .select('*, profiles!solicitacoes_solicitante_id_fkey(nome)')
            .eq('status', STATUS.PENDING)
            .in('solicitante_id', ids)
            .order('created_at', { ascending: false })
          setItens(data || [])
          return
        }

        if (isDirector) {
          const { data: rows } = await supabase
            .from('solicitacao_diretores')
            .select('status, solicitacao:solicitacoes(*, profiles!solicitacoes_solicitante_id_fkey(nome))')
            .eq('diretor_id', profile.id)
            .eq('status', 'pendente')

          const flat = (rows || [])
            .filter(row => row.solicitacao && isPendingForDirector(row.solicitacao.status))
            .map(row => ({ ...row.solicitacao, profiles: row.solicitacao.profiles, _minha_decisao: row.status }))

          setItens(flat)
          return
        }
      }

      if (aba === 'historico') {
        if (isTesouraria) {
          const { data } = await supabase
            .from('solicitacoes')
            .select('*, profiles!solicitacoes_solicitante_id_fkey(nome)')
            .eq('requer_tesouraria', true)
            .neq('status', 'aguarda_tesouraria')
            .order('created_at', { ascending: false })
          setItens(data || [])
          return
        }

        if (isSupervisor) {
          const { data: subs } = await supabase.from('profiles').select('id').eq('supervisor_id', profile.id)
          const ids = (subs || []).map(p => p.id)
          if (!ids.length) {
            setItens([])
            return
          }
          const { data } = await supabase
            .from('solicitacoes')
            .select('*, profiles!solicitacoes_solicitante_id_fkey(nome)')
            .in('status', [STATUS.APPROVED, STATUS.REJECTED])
            .in('solicitante_id', ids)
            .order('created_at', { ascending: false })
          setItens(data || [])
          return
        }

        if (isDirector) {
          const { data: rows } = await supabase
            .from('solicitacao_diretores')
            .select('status, solicitacao:solicitacoes(*, profiles!solicitacoes_solicitante_id_fkey(nome))')
            .eq('diretor_id', profile.id)
            .neq('status', 'pendente')

          const flat = (rows || [])
            .filter(row => row.solicitacao)
            .map(row => ({ ...row.solicitacao, profiles: row.solicitacao.profiles, _minha_decisao: row.status }))

          setItens(flat)
          return
        }

        const { data } = await supabase
          .from('solicitacoes')
          .select('*, profiles!solicitacoes_solicitante_id_fkey(nome)')
          .eq('solicitante_id', profile.id)
          .in('status', [STATUS.APPROVED, STATUS.REJECTED])
          .order('created_at', { ascending: false })
        setItens(data || [])
      }
    } finally {
      setLoading(false)
    }
  }

  function clearFilters() {
    setDeptoFilter('')
    setStatusFilter('')
    setPeriodFilter('')
  }

  const activeFilterCount = [deptoFilter, periodFilter, statusFilter].filter(Boolean).length

  const filtered = itens.filter(item => {
    const q = search.toLowerCase()
    const matchesSearch =
      item.titulo?.toLowerCase().includes(q) ||
      (item.descricao || '').toLowerCase().includes(q) ||
      (item.profiles?.nome || '').toLowerCase().includes(q)
    const matchesDepto = !deptoFilter || item.setor_origem === deptoFilter
    const matchesStatus = aba === 'pendentes' || !statusFilter || item.status === statusFilter
    const createdAt = item.created_at ? new Date(item.created_at) : null
    const now = new Date()
    const diffDays = createdAt ? (now - createdAt) / (1000 * 60 * 60 * 24) : null
    const matchesPeriod =
      !periodFilter ||
      (periodFilter === 'hoje' && diffDays !== null && diffDays < 1) ||
      (periodFilter === '7dias' && diffDays !== null && diffDays <= 7) ||
      (periodFilter === '30dias' && diffDays !== null && diffDays <= 30)

    return matchesSearch && matchesDepto && matchesStatus && matchesPeriod
  })

  const activeChips = [
    deptoFilter ? { key: 'depto', label: deptoFilter, onRemove: () => setDeptoFilter('') } : null,
    periodFilter ? { key: 'periodo', label: PERIOD_LABELS[periodFilter], onRemove: () => setPeriodFilter('') } : null,
    statusFilter ? { key: 'status', label: STATUS_LABELS[statusFilter], onRemove: () => setStatusFilter('') } : null,
  ].filter(Boolean)

  const showMinhas = !isDirector
  const showPendentes = isSupervisor || isDirector
  const abasVisiveis = ABAS.filter(item => {
    if (item.id === 'minhas' && !showMinhas) return false
    if (item.id === 'pendentes' && !showPendentes) return false
    return true
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontFamily: 'var(--font-body)', fontSize: 22, fontWeight: 700, color: 'var(--green-brand)' }}>
          Solicitações
        </h1>
        {!isDirector && (
          <button className="btn btn-primary" onClick={() => navigate('/nova-solicitacao')}>
            <FilePlus size={15} /> Nova solicitação
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid var(--border)', paddingBottom: 0 }} className="filter-scroll">
        {abasVisiveis.map(item => {
          const ativo = aba === item.id
          const Icon = item.icon

          return (
            <button
              key={item.id}
              onClick={() => {
                setAba(item.id)
                setSearch('')
                clearFilters()
                setShowFilters(false)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '9px 16px',
                fontSize: 13,
                fontWeight: ativo ? 700 : 500,
                color: ativo ? 'var(--green-brand)' : 'var(--text-3)',
                background: 'none',
                border: 'none',
                borderBottom: ativo ? '2px solid var(--green-brand)' : '2px solid transparent',
                marginBottom: -2,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <Icon size={14} />
              {item.label}
              {item.id === 'pendentes' && pendCount > 0 && (
                <span style={{ background: 'var(--red)', color: 'white', borderRadius: 99, fontSize: 10, fontWeight: 700, padding: '1px 6px', minWidth: 18, textAlign: 'center' }}>
                  {pendCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'stretch', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 220px' }}>
            <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              className="input"
              placeholder="Buscar..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 34 }}
            />
          </div>

          <button
            className={`btn ${showFilters ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setShowFilters(value => !value)}
            style={{ minWidth: 118, justifyContent: 'center' }}
          >
            <SlidersHorizontal size={15} />
            {activeFilterCount > 0 ? `Filtros (${activeFilterCount})` : 'Filtros'}
          </button>
        </div>

        {activeChips.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {activeChips.map(chip => (
              <button
                key={chip.key}
                className="btn btn-sm btn-outline"
                onClick={chip.onRemove}
                style={{ padding: '6px 10px', borderRadius: 999 }}
              >
                {chip.label}
                <X size={12} />
              </button>
            ))}
            <button className="btn btn-sm btn-ghost" onClick={clearFilters} style={{ padding: '6px 8px' }}>
              Limpar
            </button>
          </div>
        )}

        {showFilters && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Filtros
              </div>
              {activeFilterCount > 0 && (
                <button className="btn btn-sm btn-ghost" onClick={clearFilters} style={{ padding: '4px 6px' }}>
                  Limpar filtros
                </button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
              <select
                className="input"
                value={deptoFilter}
                onChange={e => setDeptoFilter(e.target.value)}
                style={{ cursor: 'pointer' }}
              >
                <option value="">Todos os setores</option>
                {SETORES.map(setor => (
                  <option key={setor} value={setor}>{setor}</option>
                ))}
              </select>

              <select
                className="input"
                value={periodFilter}
                onChange={e => setPeriodFilter(e.target.value)}
                style={{ cursor: 'pointer' }}
              >
                <option value="">Todo período</option>
                <option value="hoje">Hoje</option>
                <option value="7dias">Últimos 7 dias</option>
                <option value="30dias">Últimos 30 dias</option>
              </select>

              {aba !== 'pendentes' && (
                <select
                  className="input"
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  style={{ cursor: 'pointer' }}
                >
                  <option value="">Todos os status</option>
                  {aba !== 'historico' && <option value={STATUS.PENDING}>Pendente</option>}
                  <option value={STATUS.APPROVED}>Aprovado</option>
                  <option value={STATUS.REJECTED}>Rejeitado</option>
                </select>
              )}
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="spinner" style={{ width: 28, height: 28 }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 52, color: 'var(--text-3)' }}>
          <FileText size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.25 }} />
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            {aba === 'minhas'
              ? 'Nenhuma solicitação criada ainda'
              : aba === 'pendentes'
                ? 'Nenhuma pendência no momento'
                : 'Nenhum histórico ainda'}
          </div>
          {aba === 'minhas' && !isDirector && (
            <div style={{ fontSize: 13 }}>
              Clique em <strong>Nova solicitação</strong> para começar.
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(item => {
            const status = getStatusMeta(item.status)
            const urgency = URGENCY_META[item.urgencia]

            return (
              <div
                key={item.id}
                className="card"
                onClick={() => navigate('/solicitacao/' + item.id)}
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: urgency?.color || 'var(--text-3)' }} />
                      {item.numero && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'white', background: 'var(--accent)', borderRadius: 4, padding: '1px 7px', flexShrink: 0 }}>
                          #{item.numero}
                        </span>
                      )}
                      <span style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.titulo}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <span>{format(new Date(item.created_at), 'dd/MM/yyyy HH:mm')}</span>
                      {(isSupervisor || isDirector) && item.profiles?.nome && (
                        <span>Por: <strong style={{ color: 'var(--text-2)' }}>{item.profiles.nome}</strong></span>
                      )}
                      {item.setor_origem && <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{item.setor_origem}</span>}
                      {item.categoria && <span>{item.categoria}</span>}
                      {item.valor != null && (
                        <span>R$ {Number(item.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      )}
                    </div>
                  </div>
                  <span className={'badge ' + status.cls}>
                    <span className={'status-dot ' + status.dot} />
                    {status.label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
