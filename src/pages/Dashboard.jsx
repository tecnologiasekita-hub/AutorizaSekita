import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { FilePlus, Clock, CheckCircle, XCircle, TrendingUp, ArrowRight, Loader } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { STATUS, getStatusMeta, isPendingForSupervisor } from '../lib/workflow'

export default function Dashboard() {
  const { profile, isDirector, isSupervisor, canApprove } = useAuth()
  const navigate = useNavigate()

  const [stats,   setStats]   = useState(null)
  const [recent,  setRecent]  = useState([])
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (profile) fetchData() }, [profile])

  async function fetchData() {
    setLoading(true)
    try {
      const [{ data: minhas }, { data: rec }] = await Promise.all([
        supabase.from('solicitacoes').select('status').eq('solicitante_id', profile.id),
        supabase
          .from('solicitacoes')
          .select('*, profiles!solicitacoes_solicitante_id_fkey(nome)')
          .eq('solicitante_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      if (minhas) {
        setStats({
          total:     minhas.length,
          andamento: minhas.filter(s => [STATUS.PENDING, STATUS.SUPERVISOR_APPROVED, STATUS.PARTIAL].includes(s.status)).length,
          aprovado:  minhas.filter(s => s.status === STATUS.APPROVED).length,
          rejeitado: minhas.filter(s => s.status === STATUS.REJECTED).length,
        })
      }
      setRecent(rec || [])

      // Pendentes para aprovação
      if (isSupervisor) {
        // Busca apenas subordinados vinculados a este supervisor
        const { data: subordinados } = await supabase
          .from('profiles')
          .select('id')
          .eq('supervisor_id', profile.id)

        const ids = (subordinados || []).map(p => p.id)

        if (ids.length > 0) {
          const { data: pend } = await supabase
            .from('solicitacoes')
            .select('*, profiles!solicitacoes_solicitante_id_fkey(nome)')
            .eq('status', STATUS.PENDING)
            .in('solicitante_id', ids)
            .order('created_at', { ascending: false })
            .limit(5)
          setPending(pend || [])
        } else {
          setPending([])
        }

      } else if (isDirector) {
        // Diretor: busca via tabela de relação
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
          .limit(5)

        const flat = (dirRows || [])
          .filter(r => r.solicitacao && ['aprovado_supervisor', 'aprovado_parcial'].includes(r.solicitacao.status))
          .map(r => ({ ...r.solicitacao, profiles: r.solicitacao.profiles }))
        setPending(flat)
      }

    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    { label: 'Total enviados', value: stats?.total     ?? 0, icon: TrendingUp,  color: 'var(--accent)' },
    { label: 'Em andamento',   value: stats?.andamento ?? 0, icon: Clock,        color: 'var(--yellow)' },
    { label: 'Aprovados',      value: stats?.aprovado  ?? 0, icon: CheckCircle,  color: 'var(--green)' },
    { label: 'Rejeitados',     value: stats?.rejeitado ?? 0, icon: XCircle,      color: 'var(--red)' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }} className="fade-in">

      {/* Saudação */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 28, fontWeight: 400, color: 'var(--text)', letterSpacing: '-0.02em' }}>
            Olá, {profile?.nome?.split(' ')[0]}
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 14, marginTop: 4 }}>
            {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>
        {!isDirector && (
          <button className="btn btn-primary" onClick={() => navigate('/nova-solicitacao')}>
            <FilePlus size={16} /> Nova solicitação
          </button>
        )}
      </div>

      {/* Stats */}
      {loading ? (
        <div style={{ display: 'flex', gap: 10, color: 'var(--text-3)', fontSize: 14 }}>
          <Loader size={16} style={{ animation: 'spin 0.7s linear infinite' }} /> Carregando...
        </div>
      ) : (
        <div style={styles.statsGrid} className="stats-grid">
          {statCards.map(({ label, value, icon: Icon, color }, idx) => (
            <div
              key={label}
              className="card"
              style={{ display: 'flex', alignItems: 'center', gap: 16, animation: `fade-in 0.3s ease ${idx * 0.05}s both` }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `${color}15`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={20} />
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text)', lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>{label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Listas */}
      <div style={styles.grid2} className="grid-auto-fit">
        <section>
          <SectionHeader title="Minhas solicitações" onViewAll={() => navigate('/minhas-solicitacoes')} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recent.length === 0 ? (
              <EmptyCard icon={FilePlus} text="Nenhuma solicitação ainda" />
            ) : recent.map(item => (
              <SolicitacaoRow key={item.id} item={item} onClick={() => navigate(`/solicitacao/${item.id}`)} />
            ))}
          </div>
        </section>

        {canApprove && (
          <section>
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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: 'var(--text)' }}>{title}</h2>
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
    <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>
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
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.titulo}
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

const styles = {
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 },
  grid2:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 28, alignItems: 'start' },
}
