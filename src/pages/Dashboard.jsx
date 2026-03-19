import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { FilePlus, Clock, CheckCircle, XCircle, TrendingUp, ArrowRight, Loader } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { STATUS, getStatusMeta, isPendingForDirector } from '../lib/workflow'

const PERIODS = [
  { id: 'hoje', label: 'Hoje' },
  { id: '7dias', label: '7 dias' },
  { id: '30dias', label: '30 dias' },
]

export default function Dashboard() {
  const { profile, isDirector, isSupervisor, canApprove } = useAuth()
  const isTesouraria = isSupervisor && profile?.departamento === 'Tesouraria'
  const navigate = useNavigate()

  const [period, setPeriod] = useState('7dias')
  const [allMine, setAllMine] = useState([])
  const [allPending, setAllPending] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile) fetchData()
  }, [profile])

  async function fetchData() {
    setLoading(true)
    try {
      const { data: mineRows } = await supabase
        .from('solicitacoes')
        .select('*, profiles!solicitacoes_solicitante_id_fkey(nome)')
        .eq('solicitante_id', profile.id)
        .order('created_at', { ascending: false })

      setAllMine(mineRows || [])

      if (isTesouraria) {
        const { data } = await supabase
          .from('solicitacoes')
          .select('*, profiles!solicitacoes_solicitante_id_fkey(nome)')
          .eq('status', 'aguarda_tesouraria')
          .eq('requer_tesouraria', true)
          .order('created_at', { ascending: false })
        setAllPending(data || [])
        return
      }

      if (isSupervisor) {
        const { data: subordinados } = await supabase
          .from('profiles')
          .select('id')
          .eq('supervisor_id', profile.id)

        const ids = (subordinados || []).map(item => item.id)
        if (!ids.length) {
          setAllPending([])
          return
        }

        const { data } = await supabase
          .from('solicitacoes')
          .select('*, profiles!solicitacoes_solicitante_id_fkey(nome)')
          .eq('status', STATUS.PENDING)
          .in('solicitante_id', ids)
          .order('created_at', { ascending: false })
        setAllPending(data || [])
        return
      }

      if (isDirector) {
        const { data: dirRows } = await supabase
          .from('solicitacao_diretores')
          .select(`
            status,
            solicitacao:solicitacoes(
              *,
              profiles!solicitacoes_solicitante_id_fkey(nome)
            )
          `)
          .eq('diretor_id', profile.id)
          .eq('status', 'pendente')
          .order('created_at', { ascending: false })

        const flat = (dirRows || [])
          .filter(item => item.solicitacao && isPendingForDirector(item.solicitacao.status))
          .map(item => ({ ...item.solicitacao, profiles: item.solicitacao.profiles }))

        setAllPending(flat)
        return
      }

      setAllPending([])
    } finally {
      setLoading(false)
    }
  }

  const recent = useMemo(() => filterByPeriod(allMine, period).slice(0, 5), [allMine, period])
  const pending = useMemo(() => filterByPeriod(allPending, period).slice(0, 5), [allPending, period])

  const stats = useMemo(() => {
    const filtered = filterByPeriod(allMine, period)
    return {
      total: filtered.length,
      andamento: filtered.filter(item => [STATUS.PENDING, STATUS.SUPERVISOR_APPROVED, STATUS.PARTIAL, STATUS.AGUARDA_TESOURARIA].includes(item.status)).length,
      aprovado: filtered.filter(item => item.status === STATUS.APPROVED).length,
      rejeitado: filtered.filter(item => item.status === STATUS.REJECTED).length,
    }
  }, [allMine, period])

  const statCards = [
    {
      label: 'Total enviados',
      value: stats.total,
      icon: TrendingUp,
      color: 'var(--accent)',
      action: () => openSolicitacoes({ aba: 'minhas', period }),
    },
    {
      label: 'Em andamento',
      value: stats.andamento,
      icon: Clock,
      color: 'var(--yellow)',
      action: () => openSolicitacoes({ aba: 'minhas', period, status: 'andamento' }),
    },
    {
      label: 'Aprovados',
      value: stats.aprovado,
      icon: CheckCircle,
      color: 'var(--green)',
      action: () => openSolicitacoes({ aba: 'historico', period, status: STATUS.APPROVED }),
    },
    {
      label: 'Rejeitados',
      value: stats.rejeitado,
      icon: XCircle,
      color: 'var(--red)',
      action: () => openSolicitacoes({ aba: 'historico', period, status: STATUS.REJECTED }),
    },
  ]

  function openSolicitacoes(filters) {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value)
    })
    navigate(`/solicitacoes?${params.toString()}`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }} className="fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-body)', fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>
            Olá, {profile?.nome?.split(' ')[0]}
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 14, marginTop: 4 }}>
            {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 6 }} className="filter-scroll">
            {PERIODS.map(item => (
              <button
                key={item.id}
                className={`btn btn-sm ${period === item.id ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setPeriod(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {!isDirector && (
            <button className="btn btn-primary" onClick={() => navigate('/nova-solicitacao')}>
              <FilePlus size={16} /> Nova solicitação
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', gap: 10, color: 'var(--text-3)', fontSize: 14 }}>
          <Loader size={16} style={{ animation: 'spin 0.7s linear infinite' }} /> Carregando...
        </div>
      ) : (
        <div style={styles.statsGrid} className="stats-grid">
          {statCards.map(({ label, value, icon: Icon, color, action }, idx) => (
            <button
              key={label}
              className="card"
              onClick={action}
              style={{ ...styles.statCard, animation: `fade-in 0.3s ease ${idx * 0.05}s both` }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `${color}15`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={20} />
              </div>
              <div style={{ textAlign: 'left', flex: 1 }}>
                <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-body)', color: 'var(--text)', lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>{label}</div>
              </div>
              <ArrowRight size={16} color="var(--text-3)" />
            </button>
          ))}
        </div>
      )}

      <div style={styles.sectionGrid} className="grid-auto-fit">
        {!isDirector && (
          <section className="card" style={styles.sectionCard}>
            <div style={styles.sectionAccentMine} />
            <SectionHeader
              title="Minhas solicitações"
              onViewAll={() => openSolicitacoes({ aba: 'minhas', period })}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recent.length === 0 ? (
                <EmptyCard icon={FilePlus} text="Nenhuma solicitação neste período" />
              ) : recent.map(item => (
                <SolicitacaoRow key={item.id} item={item} onClick={() => navigate(`/solicitacao/${item.id}`)} />
              ))}
            </div>
          </section>
        )}

        {canApprove && (
          <section className="card" style={styles.sectionCardHighlight}>
            <div style={styles.sectionAccentPending} />
            <SectionHeader
              title="Aguardando sua aprovação"
              onViewAll={() => navigate('/aprovacoes')}
              badge={pending.length}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pending.length === 0 ? (
                <EmptyCard icon={CheckCircle} text="Nenhuma pendência no momento" />
              ) : pending.map(item => (
                <SolicitacaoRow key={item.id} item={item} onClick={() => navigate(`/solicitacao/${item.id}`)} showSolicitante />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function SectionHeader({ title, onViewAll, badge }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{title}</h2>
        {badge > 0 && (
          <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 10, fontSize: 11, fontWeight: 700, padding: '1px 7px' }}>
            {badge}
          </span>
        )}
      </div>
      <button className="btn btn-ghost btn-sm" onClick={onViewAll} style={{ color: 'var(--accent)', fontSize: 13 }}>
        Ver todas <ArrowRight size={13} />
      </button>
    </div>
  )
}

function EmptyCard({ icon: Icon, text }) {
  return (
    <div style={styles.emptyCard}>
      <Icon size={26} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.3 }} />
      <span style={{ fontSize: 13 }}>{text}</span>
    </div>
  )
}

function SolicitacaoRow({ item, onClick, showSolicitante }) {
  const status = getStatusMeta(item.status)
  return (
    <div
      className="card"
      onClick={onClick}
      style={{ cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.background = 'var(--bg-card-2)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-card)' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            {item.numero && (
              <span style={{ fontSize: 12, fontWeight: 700, color: 'white', background: 'var(--accent)', borderRadius: 4, padding: '2px 7px', flexShrink: 0 }}>
                #{item.numero}
              </span>
            )}
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.titulo}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {showSolicitante && <span>{item.profiles?.nome}</span>}
            <span>{format(new Date(item.created_at), "dd/MM/yyyy 'às' HH:mm")}</span>
            {item.valor != null && (
              <span>R$ {Number(item.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            )}
          </div>
        </div>
        <span className={`badge ${status.cls}`}>
          <span className={`status-dot ${status.dot}`} />
          {status.label}
        </span>
      </div>
    </div>
  )
}

function filterByPeriod(items, period) {
  const start = getPeriodStart(period)
  return (items || []).filter(item => {
    if (!item?.created_at) return false
    return new Date(item.created_at) >= start
  })
}

function getPeriodStart(period) {
  const now = new Date()
  const start = new Date(now)

  if (period === 'hoje') {
    start.setHours(0, 0, 0, 0)
    return start
  }

  if (period === '30dias') {
    start.setDate(start.getDate() - 29)
    start.setHours(0, 0, 0, 0)
    return start
  }

  start.setDate(start.getDate() - 6)
  start.setHours(0, 0, 0, 0)
  return start
}

const styles = {
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 },
  statCard: { display: 'flex', alignItems: 'center', gap: 16, width: '100%', border: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' },
  sectionGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, alignItems: 'start' },
  sectionCard: { position: 'relative', paddingTop: 22 },
  sectionCardHighlight: { position: 'relative', paddingTop: 22, background: 'linear-gradient(180deg, #ffffff, var(--green-pale))' },
  sectionAccentMine: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, borderRadius: '10px 10px 0 0', background: 'linear-gradient(90deg, var(--accent), var(--green-light))' },
  sectionAccentPending: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, borderRadius: '10px 10px 0 0', background: 'linear-gradient(90deg, var(--yellow), var(--accent-2))' },
  emptyCard: { background: 'var(--bg-card-2)', border: '1px dashed var(--border-light)', borderRadius: 'var(--radius)', textAlign: 'center', padding: 32, color: 'var(--text-3)' },
}
