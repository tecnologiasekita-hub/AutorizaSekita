import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { CheckSquare, Search, Clock, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'

const urgenciaColor = { baixa: 'var(--text-3)', normal: 'var(--blue)', alta: 'var(--yellow)', critica: 'var(--red)' }
const urgenciaLabel = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', critica: 'Crítica' }
const urgenciaOrder = { critica: 0, alta: 1, normal: 2, baixa: 3 }

const statusMap = {
  pendente:            { label: 'Pendente',        cls: 'badge-pendente',   dot: 'dot-pendente' },
  aprovado_supervisor: { label: 'Aguarda Diretor', cls: 'badge-supervisor', dot: 'dot-supervisor' },
  aprovado:            { label: 'Aprovado',         cls: 'badge-aprovado',   dot: 'dot-aprovado' },
  rejeitado:           { label: 'Rejeitado',        cls: 'badge-rejeitado',  dot: 'dot-rejeitado' },
}

export default function Aprovacoes() {
  const { profile, isSupervisor, isDirector } = useAuth()
  const navigate = useNavigate()
  const [solicitacoes, setSolicitacoes] = useState([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [filter, setFilter]             = useState('pendentes')
  const [sortByUrgencia, setSortByUrgencia] = useState(false)

  useEffect(() => { if (profile) fetchSolicitacoes() }, [profile, filter])

  async function fetchSolicitacoes() {
    if (!profile) return
    setLoading(true)

    let q = supabase
      .from('solicitacoes')
      .select('*, profiles!solicitacoes_solicitante_id_fkey(nome, email, departamento)')
      .order('created_at', { ascending: false })

    if (filter === 'pendentes') {
      if (isSupervisor)    q = q.eq('status', 'pendente')
      else if (isDirector) q = q.in('status', ['pendente', 'aprovado_supervisor'])
    } else {
      if (isSupervisor)    q = q.eq('supervisor_id', profile.id).neq('status', 'pendente')
      else if (isDirector) q = q.eq('diretor_id', profile.id)
    }

    const { data } = await q
    setSolicitacoes(data || [])
    setLoading(false)
  }

  let filtered = solicitacoes.filter(s =>
    s.titulo.toLowerCase().includes(search.toLowerCase()) ||
    (s.profiles?.nome || '').toLowerCase().includes(search.toLowerCase())
  )

  if (sortByUrgencia) {
    filtered = [...filtered].sort((a, b) =>
      (urgenciaOrder[a.urgencia] ?? 2) - (urgenciaOrder[b.urgencia] ?? 2)
    )
  }

  const pendingCount = solicitacoes.filter(s =>
    isSupervisor
      ? s.status === 'pendente'
      : ['pendente', 'aprovado_supervisor'].includes(s.status)
  ).length

  const roleName = isSupervisor ? 'Supervisor' : 'Diretor'
  const roleColor = isSupervisor ? 'var(--blue)' : 'var(--accent-2)'
  const roleBg    = isSupervisor ? 'var(--blue-bg)' : 'var(--accent-2-dim)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }} className="fade-in">
      {/* Header */}
      <div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 26, fontWeight: 400, color: 'var(--green-brand)' }}>
          Aprovações
        </h1>
        <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 2 }}>
          Fila de aprovação como {roleName}
        </p>
      </div>

      {/* Info banner */}
      <div className="card" style={{ background: roleBg, borderColor: `${roleColor}30` }}>
        <div style={{ fontSize: 13, color: roleColor }}>
          <strong>Como {roleName}:</strong>{' '}
          {isSupervisor
            ? 'Você analisa solicitações dos solicitantes. Após sua aprovação, o Diretor faz a decisão final.'
            : 'Você tem autoridade final. Aprova solicitações que passaram pelo Supervisor e também diretamente pendências.'}
        </div>
      </div>

      {/* Tabs + filters */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className={`btn btn-sm ${filter === 'pendentes' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setFilter('pendentes')}
          >
            <Clock size={13} />
            Pendentes
            {filter === 'pendentes' && pendingCount > 0 && (
              <span style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '0 6px', fontSize: 11 }}>
                {pendingCount}
              </span>
            )}
          </button>
          <button
            className={`btn btn-sm ${filter === 'historico' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setFilter('historico')}
          >
            <CheckSquare size={13} />
            Histórico
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`btn btn-sm ${sortByUrgencia ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setSortByUrgencia(v => !v)}
            title="Ordenar por urgência"
          >
            <AlertTriangle size={13} />
            Por urgência
          </button>
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
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="spinner" style={{ width: 28, height: 28 }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 52, color: 'var(--text-3)' }}>
          <CheckSquare size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.25 }} />
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            {filter === 'pendentes' ? 'Nenhuma pendência! Você está em dia 🎉' : 'Nenhuma ação registrada ainda'}
          </div>
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
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>
                      {s.titulo}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <span>Por: <strong style={{ color: 'var(--text-2)' }}>{s.profiles?.nome}</strong></span>
                      {s.profiles?.departamento && <span>· {s.profiles.departamento}</span>}
                      <span>· {format(new Date(s.created_at), "dd/MM 'às' HH:mm")}</span>
                      {s.valor && <span>· R$ {Number(s.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
                    <span className={`badge ${st.cls}`}>
                      <span className={`status-dot ${st.dot}`} />
                      {st.label}
                    </span>
                    <span style={{ fontSize: 11, color: urgenciaColor[s.urgencia], fontWeight: 600 }}>
                      ● {urgenciaLabel[s.urgencia] || 'Normal'}
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
