import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { CheckSquare, Search, Clock, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { URGENCY_META, getStatusMeta, isPendingForDirector, isPendingForSupervisor } from '../lib/workflow'

export default function Aprovacoes() {
  const { profile, isSupervisor, isDirector } = useAuth()
  const navigate = useNavigate()

  const [solicitacoes,    setSolicitacoes]    = useState([])
  const [loading,         setLoading]         = useState(true)
  const [search,          setSearch]          = useState('')
  const [filter,          setFilter]          = useState('pendentes')
  const [sortByUrgencia,  setSortByUrgencia]  = useState(false)
  const [deptoFilter,     setDeptoFilter]     = useState('')

  useEffect(() => { if (profile) fetchSolicitacoes() }, [profile, filter, deptoFilter])

  async function fetchSolicitacoes() {
    if (!profile) return
    setLoading(true)
    try {
      if (isSupervisor) {
        // 1. Busca IDs dos solicitantes vinculados a este supervisor
        const { data: subordinados } = await supabase
          .from('profiles')
          .select('id')
          .eq('supervisor_id', profile.id)

        const ids = (subordinados || []).map(p => p.id)

        if (ids.length === 0) {
          setSolicitacoes([])
          return
        }

        // 2. Busca solicitações apenas desses solicitantes
        let query = supabase
          .from('solicitacoes')
          .select('*, profiles!solicitacoes_solicitante_id_fkey(nome, email, departamento)')
          .in('solicitante_id', ids)
          .order('created_at', { ascending: false })

        if (filter === 'pendentes') {
          query = query.eq('status', 'pendente')
        } else {
          // Histórico: tudo que ele aprovou/rejeitou (supervisor_id = ele) ou que seus subordinados criaram
          query = query.neq('status', 'pendente')
        }

        if (deptoFilter) query = query.eq('setor_origem', deptoFilter)
        const { data } = await query
        setSolicitacoes(data || [])

      } else if (isDirector) {
        // Diretor vê somente as solicitações onde ele foi selecionado
        let query = supabase
          .from('solicitacao_diretores')
          .select(`
            *,
            solicitacao:solicitacoes(
              *,
              profiles!solicitacoes_solicitante_id_fkey(nome, email, departamento)
            )
          `)
          .eq('diretor_id', profile.id)
          .order('created_at', { ascending: false })

        if (filter === 'pendentes') {
          query = query.eq('status', 'pendente')
        } else {
          query = query.neq('status', 'pendente')
        }

        if (deptoFilter) query = query.eq('solicitacao.setor_origem', deptoFilter)
        const { data } = await query
        // Normaliza estrutura para ter o mesmo shape
        const flat = (data || [])
          .filter(row => row.solicitacao)
          .filter(row => {
            if (filter === 'pendentes') return isPendingForDirector(row.solicitacao.status)
            return true
          })
          .map(row => ({
            ...row.solicitacao,
            profiles: row.solicitacao.profiles,
            _minha_decisao: row.status,
          }))
        setSolicitacoes(flat)
      }
    } finally {
      setLoading(false)
    }
  }

  let filtered = solicitacoes.filter(item => {
    if (deptoFilter && item.setor_origem !== deptoFilter) return false
    return true
  }).filter(item =>
    item.titulo.toLowerCase().includes(search.toLowerCase()) ||
    (item.profiles?.nome || '').toLowerCase().includes(search.toLowerCase())
  )

  if (sortByUrgencia) {
    filtered = [...filtered].sort((a, b) =>
      (URGENCY_META[a.urgencia]?.order ?? 2) - (URGENCY_META[b.urgencia]?.order ?? 2)
    )
  }

  const pendingCount = solicitacoes.filter(item => {
    if (isSupervisor) return isPendingForSupervisor(item.status)
    if (isDirector)   return isPendingForDirector(item.status) && item._minha_decisao === 'pendente'
    return false
  }).length

  const roleName  = isSupervisor ? 'Supervisor' : 'Diretor'
  const roleColor = isSupervisor ? 'var(--blue)' : 'var(--accent-2)'
  const roleBg    = isSupervisor ? 'var(--blue-bg)' : 'var(--accent-2-dim)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }} className="fade-in">

      <div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 26, fontWeight: 400, color: 'var(--green-brand)' }}>
          Aprovações
        </h1>
        <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 2 }}>
          Fila de aprovação como {roleName}
        </p>
      </div>

      <div className="card" style={{ background: roleBg, borderColor: `${roleColor}30` }}>
        <div style={{ fontSize: 13, color: roleColor }}>
          <strong>Como {roleName}:</strong>{' '}
          {isSupervisor
            ? 'Você faz a primeira análise das solicitações enviadas pelos solicitantes.'
            : 'Você decide as solicitações que foram direcionadas para você após aprovação do supervisor.'}
        </div>
      </div>

      {/* Filtros */}
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
            className={`btn btn-sm ${filter === 'historico' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setFilter('historico')}
          >
            <CheckSquare size={13} /> Histórico
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`btn btn-sm ${sortByUrgencia ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setSortByUrgencia(v => !v)}
            title="Ordenar por urgência"
          >
            <AlertTriangle size={13} /> Por urgência
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
          <select
            className="input"
            value={deptoFilter}
            onChange={e => setDeptoFilter(e.target.value)}
            style={{ cursor: 'pointer', width: 200 }}
          >
            <option value="">Todos os setores</option>
            <option value="TI">TI</option>
            <option value="Controladoria">Controladoria</option>
            <option value="Tesouraria">Tesouraria</option>
            <option value="Ambiental">Ambiental</option>
            <option value="Contas a Pagar">Contas a Pagar</option>
            <option value="Compras">Compras</option>
            <option value="Assinatura Digital">Assinatura Digital</option>
            <option value="Jurídico">Jurídico</option>
            <option value="Financeiro">Financeiro</option>
          </select>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="spinner" style={{ width: 28, height: 28 }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 52, color: 'var(--text-3)' }}>
          <CheckSquare size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.25 }} />
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            {filter === 'pendentes' ? 'Nenhuma pendência no momento' : 'Nenhuma ação registrada ainda'}
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
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>
                      {item.titulo}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <span>Por: <strong style={{ color: 'var(--text-2)' }}>{item.profiles?.nome}</strong></span>
                      {item.profiles?.departamento && <span>{item.profiles.departamento}</span>}
                      <span>{format(new Date(item.created_at), "dd/MM 'às' HH:mm")}</span>
                      {item.valor != null && (
                        <span>R$ {Number(item.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
                    <span className={`badge ${status.cls}`}>
                      <span className={`status-dot ${status.dot}`} />
                      {status.label}
                    </span>
                    <span style={{ fontSize: 11, color: urgency?.color || 'var(--text-3)', fontWeight: 600 }}>
                      {urgency?.label || 'Normal'}
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
