import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { FilePlus, Search } from 'lucide-react'
import { format } from 'date-fns'

const STATUS_OPTS = [
  { value: '',                  label: 'Todos' },
  { value: 'pendente',          label: 'Pendente' },
  { value: 'aprovado_supervisor',label: 'Em análise' },
  { value: 'aprovado',          label: 'Aprovado' },
  { value: 'rejeitado',         label: 'Rejeitado' },
]

const statusMap = {
  pendente:            { label: 'Pendente',          cls: 'badge-pendente',   dot: 'dot-pendente' },
  aprovado_supervisor: { label: 'Aguarda Diretor',   cls: 'badge-supervisor', dot: 'dot-supervisor' },
  aprovado:            { label: 'Aprovado',           cls: 'badge-aprovado',   dot: 'dot-aprovado' },
  rejeitado:           { label: 'Rejeitado',          cls: 'badge-rejeitado',  dot: 'dot-rejeitado' },
}

const urgenciaColor = {
  baixa: 'var(--text-3)', normal: 'var(--blue)',
  alta: 'var(--yellow)', critica: 'var(--red)',
}

export default function MinhasSolicitacoes() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [solicitacoes, setSolicitacoes] = useState([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => { if (profile) fetchSolicitacoes() }, [profile, statusFilter])

  async function fetchSolicitacoes() {
    setLoading(true)
    let q = supabase
      .from('solicitacoes')
      .select('*')
      .eq('solicitante_id', profile.id)
      .order('created_at', { ascending: false })
    if (statusFilter) q = q.eq('status', statusFilter)
    const { data } = await q
    setSolicitacoes(data || [])
    setLoading(false)
  }

  const filtered = solicitacoes.filter(s =>
    s.titulo.toLowerCase().includes(search.toLowerCase()) ||
    (s.descricao || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }} className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 26, fontWeight: 400, color: 'var(--green-brand)' }}>
            Minhas Solicitações
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 2 }}>
            {solicitacoes.length} solicitação{solicitacoes.length !== 1 ? 'ões' : ''} no total
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/nova-solicitacao')}>
          <FilePlus size={15} /> Nova Solicitação
        </button>
      </div>

      {/* Filters */}
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
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} className="filter-scroll">
          {STATUS_OPTS.map(o => (
            <button
              key={o.value}
              className={`btn btn-sm ${statusFilter === o.value ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setStatusFilter(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="spinner" style={{ width: 28, height: 28 }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 52, color: 'var(--text-3)' }}>
          <FilePlus size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.25 }} />
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Nenhuma solicitação encontrada</div>
          <div style={{ fontSize: 13 }}>Crie sua primeira solicitação clicando em "Nova Solicitação"</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(s => {
            const st = statusMap[s.status] || statusMap.pendente
            return (
              <div
                key={s.id}
                className="card"
                onClick={() => navigate(`/solicitacao/${s.id}`)}
                style={{ cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.background = 'var(--bg-card-2)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-card)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: urgenciaColor[s.urgencia] || 'var(--text-3)',
                        flexShrink: 0,
                      }} title={`Urgência: ${s.urgencia}`} />
                      <span style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.titulo}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <span>{format(new Date(s.created_at), 'dd/MM/yyyy HH:mm')}</span>
                      {s.categoria && <span>· {s.categoria}</span>}
                      {s.valor && <span>· R$ {Number(s.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
                    </div>
                  </div>
                  <span className={`badge ${st.cls}`}>
                    <span className={`status-dot ${st.dot}`} />
                    {st.label}
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
