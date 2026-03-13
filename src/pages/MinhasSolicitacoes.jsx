import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { FilePlus, Search } from 'lucide-react'
import { format } from 'date-fns'
import { STATUS, URGENCY_META, getStatusMeta } from '../lib/workflow'

const STATUS_OPTS = [
  { value: '',                         label: 'Todos' },
  { value: STATUS.PENDING,             label: 'Pendente' },
  { value: STATUS.SUPERVISOR_APPROVED, label: 'Aguarda Diretor' },
  { value: STATUS.PARTIAL,             label: 'Aprov. Parcial' },
  { value: STATUS.APPROVED,            label: 'Aprovado' },
  { value: STATUS.REJECTED,            label: 'Rejeitado' },
]

const DEPTOS = [
  'TI', 'Controladoria', 'Tesouraria', 'Ambiental', 'Recursos Humanos',
  'Contas a Pagar', 'Compras', 'Assinatura Digital',
  'Jurídico', 'Financeiro',
]

export default function MinhasSolicitacoes() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [solicitacoes, setSolicitacoes] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [deptoFilter,  setDeptoFilter]  = useState('')

  useEffect(() => { if (profile) fetchSolicitacoes() }, [profile, statusFilter, deptoFilter])

  async function fetchSolicitacoes() {
    setLoading(true)
    try {
      let query = supabase
        .from('solicitacoes')
        .select('*')
        .eq('solicitante_id', profile.id)
        .order('created_at', { ascending: false })

      if (statusFilter) query = query.eq('status', statusFilter)
      if (deptoFilter)  query = query.eq('setor_origem', deptoFilter)

      const { data } = await query
      setSolicitacoes(data || [])
    } finally {
      setLoading(false)
    }
  }

  const filtered = solicitacoes.filter(item =>
    item.titulo.toLowerCase().includes(search.toLowerCase()) ||
    (item.descricao || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }} className="fade-in">

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 26, fontWeight: 400, color: 'var(--green-brand)' }}>
            Minhas solicitações
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 2 }}>
            {solicitacoes.length} solicitação{solicitacoes.length !== 1 ? 'ões' : ''} no total
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/nova-solicitacao')}>
          <FilePlus size={15} /> Nova solicitação
        </button>
      </div>

      {/* Busca + Filtro setor */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input
            className="input"
            placeholder="Buscar por título ou descrição..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 34 }}
          />
        </div>
        <select
          className="input"
          value={deptoFilter}
          onChange={e => setDeptoFilter(e.target.value)}
          style={{ flex: '0 1 200px', cursor: 'pointer' }}
        >
          <option value="">Todos os setores</option>
          {DEPTOS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Filtros de status */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} className="filter-scroll">
        {STATUS_OPTS.map(opt => (
          <button
            key={opt.value}
            className={`btn btn-sm ${statusFilter === opt.value ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setStatusFilter(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="spinner" style={{ width: 28, height: 28 }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 52, color: 'var(--text-3)' }}>
          <FilePlus size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.25 }} />
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Nenhuma solicitação encontrada</div>
          <div style={{ fontSize: 13 }}>
            {deptoFilter || statusFilter ? 'Tente mudar os filtros.' : 'Crie sua primeira solicitação clicando em Nova solicitação'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(item => {
            const status  = getStatusMeta(item.status)
            const urgency = URGENCY_META[item.urgencia]
            return (
              <div
                key={item.id}
                className="card"
                onClick={() => navigate(`/solicitacao/${item.id}`)}
                style={{ cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.background = 'var(--bg-card-2)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-card)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: urgency?.color || 'var(--text-3)', flexShrink: 0,
                      }} title={`Urgência: ${item.urgencia}`} />
                      <span style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.titulo}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <span>{format(new Date(item.created_at), 'dd/MM/yyyy HH:mm')}</span>
                      {item.setor_origem && (
                        <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{item.setor_origem}</span>
                      )}
                      {item.categoria && <span>{item.categoria}</span>}
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
          })}
        </div>
      )}
    </div>
  )
}
