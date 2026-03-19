import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { FilePlus, Search, Clock, CheckCircle, XCircle, FileText } from 'lucide-react'
import { format } from 'date-fns'
import { STATUS, URGENCY_META, getStatusMeta, isPendingForDirector, isPendingForSupervisor } from '../lib/workflow'

const ABAS = [
  { id: 'minhas',   label: 'Minhas',   icon: FileText },
  { id: 'pendentes',label: 'Pendentes',icon: Clock },
  { id: 'historico',label: 'Histórico',icon: CheckCircle },
]

export default function Solicitacoes() {
  const { profile, isSupervisor, isDirector } = useAuth()
  const isTesouraria = isSupervisor && profile?.departamento === 'Tesouraria'
  const navigate = useNavigate()

  const defaultAba = isDirector ? 'pendentes' : 'minhas'
  const [aba,          setAba]          = useState(defaultAba)
  const [itens,        setItens]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [deptoFilter,  setDeptoFilter]  = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => { if (profile) fetchItens() }, [profile, aba, deptoFilter])

  async function fetchItens() {
    setLoading(true)
    try {
      if (aba === 'minhas') {
        // Solicitações criadas pelo usuário
        let query = supabase
          .from('solicitacoes')
          .select('*, profiles!solicitacoes_solicitante_id_fkey(nome)')
          .eq('solicitante_id', profile.id)
          .order('created_at', { ascending: false })
        if (deptoFilter) query = query.eq('setor_origem', deptoFilter)
        const { data } = await query
        setItens(data || [])

      } else if (aba === 'pendentes') {
        // Aguardando aprovação do usuário logado
        if (isTesouraria) {
          const { data } = await supabase
            .from('solicitacoes')
            .select('*, profiles!solicitacoes_solicitante_id_fkey(nome)')
            .eq('status', 'aguarda_tesouraria')
            .eq('requer_tesouraria', true)
            .order('created_at', { ascending: false })
          setItens(data || [])

        } else if (isSupervisor) {
          const { data: subs } = await supabase
            .from('profiles').select('id').eq('supervisor_id', profile.id)
          const ids = (subs || []).map(p => p.id)
          if (ids.length === 0) { setItens([]); return }
          const { data } = await supabase
            .from('solicitacoes')
            .select('*, profiles!solicitacoes_solicitante_id_fkey(nome)')
            .eq('status', STATUS.PENDING)
            .in('solicitante_id', ids)
            .order('created_at', { ascending: false })
          setItens(data || [])

        } else if (isDirector) {
          const { data: rows } = await supabase
            .from('solicitacao_diretores')
            .select('status, solicitacao:solicitacoes(*, profiles!solicitacoes_solicitante_id_fkey(nome))')
            .eq('diretor_id', profile.id)
            .eq('status', 'pendente')
          const flat = (rows || [])
            .filter(r => r.solicitacao && isPendingForDirector(r.solicitacao.status))
            .map(r => ({ ...r.solicitacao, profiles: r.solicitacao.profiles, _minha_decisao: r.status }))
          setItens(flat)
        }

      } else if (aba === 'historico') {
        // Histórico de aprovadas/rejeitadas
        if (isTesouraria) {
          const { data } = await supabase
            .from('solicitacoes')
            .select('*, profiles!solicitacoes_solicitante_id_fkey(nome)')
            .eq('requer_tesouraria', true)
            .neq('status', 'aguarda_tesouraria')
            .order('created_at', { ascending: false })
          setItens(data || [])

        } else if (isSupervisor) {
          const { data: subs } = await supabase
            .from('profiles').select('id').eq('supervisor_id', profile.id)
          const ids = (subs || []).map(p => p.id)
          if (ids.length === 0) { setItens([]); return }
          const { data } = await supabase
            .from('solicitacoes')
            .select('*, profiles!solicitacoes_solicitante_id_fkey(nome)')
            .in('status', [STATUS.APPROVED, STATUS.REJECTED])
            .in('solicitante_id', ids)
            .order('created_at', { ascending: false })
          setItens(data || [])

        } else if (isDirector) {
          const { data: rows } = await supabase
            .from('solicitacao_diretores')
            .select('status, solicitacao:solicitacoes(*, profiles!solicitacoes_solicitante_id_fkey(nome))')
            .eq('diretor_id', profile.id)
            .neq('status', 'pendente')
          const flat = (rows || [])
            .filter(r => r.solicitacao)
            .map(r => ({ ...r.solicitacao, profiles: r.solicitacao.profiles, _minha_decisao: r.status }))
          setItens(flat)

        } else {
          // Solicitante: histórico das próprias
          const { data } = await supabase
            .from('solicitacoes')
            .select('*, profiles!solicitacoes_solicitante_id_fkey(nome)')
            .eq('solicitante_id', profile.id)
            .in('status', [STATUS.APPROVED, STATUS.REJECTED])
            .order('created_at', { ascending: false })
          setItens(data || [])
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const filtered = itens.filter(item => {
    const q = search.toLowerCase()
    return (
      item.titulo?.toLowerCase().includes(q) ||
      (item.descricao || '').toLowerCase().includes(q) ||
      (item.profiles?.nome || '').toLowerCase().includes(q)
    )
  })

  const showMinhas   = !isDirector
  const showPendentes = isSupervisor || isDirector
  const abasVisiveis = ABAS.filter(a => {
    if (a.id === 'minhas'    && !showMinhas)    return false
    if (a.id === 'pendentes' && !showPendentes) return false
    return true
  })

  // Contagem de pendentes
  const [pendCount, setPendCount] = useState(0)
  useEffect(() => {
    async function countPend() {
      if (!profile) return
      if (isTesouraria) {
        const { count } = await supabase.from('solicitacoes')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'aguarda_tesouraria')
        setPendCount(count || 0)
      } else if (isSupervisor) {
        const { data: subs } = await supabase.from('profiles').select('id').eq('supervisor_id', profile.id)
        const ids = (subs || []).map(p => p.id)
        if (!ids.length) return
        const { count } = await supabase.from('solicitacoes')
          .select('*', { count: 'exact', head: true })
          .eq('status', STATUS.PENDING).in('solicitante_id', ids)
        setPendCount(count || 0)
      } else if (isDirector) {
        const { count } = await supabase.from('solicitacao_diretores')
          .select('*', { count: 'exact', head: true })
          .eq('diretor_id', profile.id).eq('status', 'pendente')
        setPendCount(count || 0)
      }
    }
    countPend()
  }, [profile])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="fade-in">

      {/* Header */}
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

      {/* Abas */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid var(--border)', paddingBottom: 0 }}>
        {abasVisiveis.map(a => {
          const ativo = aba === a.id
          const Icon = a.icon
          return (
            <button
              key={a.id}
              onClick={() => { setAba(a.id); setSearch(''); setDeptoFilter(''); setStatusFilter('') }}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '9px 16px',
                fontSize: 13, fontWeight: ativo ? 700 : 500,
                color: ativo ? 'var(--green-brand)' : 'var(--text-3)',
                background: 'none', border: 'none',
                borderBottom: ativo ? '2px solid var(--green-brand)' : '2px solid transparent',
                marginBottom: -2, cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <Icon size={14} />
              {a.label}
              {a.id === 'pendentes' && pendCount > 0 && (
                <span style={{
                  background: 'var(--red)', color: 'white',
                  borderRadius: 99, fontSize: 10, fontWeight: 700,
                  padding: '1px 6px', minWidth: 18, textAlign: 'center',
                }}>
                  {pendCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Busca + Filtro */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input className="input" placeholder="Buscar..." value={search}
            onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 34 }} />
        </div>
        {aba === 'minhas' && (
          <select className="input" value={deptoFilter} onChange={e => setDeptoFilter(e.target.value)}
            style={{ flex: '0 1 200px', cursor: 'pointer' }}>
            <option value="">Todos os setores</option>
            {['TI','Controladoria','Tesouraria','Ambiental','Contas a Pagar','Compras','Assinatura Digital','Jurídico','Financeiro','Comercial'].map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="spinner" style={{ width: 28, height: 28 }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 52, color: 'var(--text-3)' }}>
          <FileText size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.25 }} />
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            {aba === 'minhas'    ? 'Nenhuma solicitação criada ainda'    :
             aba === 'pendentes' ? 'Nenhuma pendência no momento'        :
                                  'Nenhum histórico ainda'}
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
            const status  = getStatusMeta(item.status)
            const urgency = URGENCY_META[item.urgencia]
            return (
              <div
                key={item.id}
                className="card"
                onClick={() => navigate('/solicitacao/' + item.id)}
                style={{ cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.background = 'var(--bg-card-2)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-card)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                        background: urgency?.color || 'var(--text-3)',
                      }} />
                      {item.numero && (
                        <span style={{
                          fontSize: 11, fontWeight: 700, color: 'white',
                          background: 'var(--accent)', borderRadius: 4,
                          padding: '1px 7px', flexShrink: 0,
                        }}>#{item.numero}</span>
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
