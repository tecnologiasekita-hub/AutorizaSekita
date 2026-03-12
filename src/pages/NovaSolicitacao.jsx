import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { ArrowLeft, Send, Paperclip, X, FileText, Image, File, AlertCircle } from 'lucide-react'
import { STATUS, URGENCY, URGENCY_META, formatBytes } from '../lib/workflow'

const URGENCIAS = [
  { value: URGENCY.LOW,      label: 'Baixa',   color: URGENCY_META[URGENCY.LOW].color },
  { value: URGENCY.NORMAL,   label: 'Normal',  color: URGENCY_META[URGENCY.NORMAL].color },
  { value: URGENCY.HIGH,     label: 'Alta',    color: URGENCY_META[URGENCY.HIGH].color },
  { value: URGENCY.CRITICAL, label: 'Crítica', color: URGENCY_META[URGENCY.CRITICAL].color },
]

const MAX_FILE_SIZE = 10 * 1024 * 1024

function fileIcon(mime) {
  if (!mime) return File
  if (mime.startsWith('image/')) return Image
  if (mime === 'application/pdf') return FileText
  return File
}

export default function NovaSolicitacao() {
  const { profile } = useAuth()
  const navigate     = useNavigate()
  const fileInputRef = useRef(null)
  const catRef       = useRef(null)

  const [loading,        setLoading]        = useState(false)
  const [loadingSetup,   setLoadingSetup]   = useState(true)
  const [error,          setError]          = useState('')
  const [categorias,     setCategorias]     = useState([])
  const [showCatList,    setShowCatList]    = useState(false)
  const [arquivos,       setArquivos]       = useState([])
  const [supervisorInfo, setSupervisorInfo] = useState(null)
  const [diretores,      setDiretores]      = useState([])
  const [dirSel,         setDirSel]         = useState([])

  const [form, setForm] = useState({
    titulo:    '',
    descricao: '',
    valor:     '',
    categoria: '',
    urgencia:  URGENCY.NORMAL,
  })

  const isSupervisor = profile?.role === 'supervisor'
  const isDirector   = profile?.role === 'diretor'

  useEffect(() => {
    async function load() {
      setLoadingSetup(true)
      try {
        // Carrega diretores se for supervisor (vai selecionar na criação)
        if (isSupervisor) {
          const { data: dirs } = await supabase
            .from('profiles')
            .select('id, nome, departamento')
            .eq('role', 'diretor')
            .order('nome')
          setDiretores(dirs || [])
        }

        // Busca categorias já usadas
        const { data: cats } = await supabase
          .from('solicitacoes')
          .select('categoria')
          .not('categoria', 'is', null)
          .neq('categoria', '')
          .order('created_at', { ascending: false })
          .limit(100)

        if (cats) {
          const uniq = [...new Set(cats.map(c => c.categoria).filter(Boolean))]
          setCategorias(uniq.slice(0, 20))
        }

        // Solicitante: busca supervisor vinculado (2 queries separadas — evita problema de FK name)
        if (!isSupervisor && !isDirector) {
          const { data: myProfile } = await supabase
            .from('profiles')
            .select('supervisor_id')
            .eq('id', profile.id)
            .single()

          if (myProfile?.supervisor_id) {
            const { data: sup } = await supabase
              .from('profiles')
              .select('id, nome, departamento')
              .eq('id', myProfile.supervisor_id)
              .single()
            setSupervisorInfo(sup || null)
          } else {
            setSupervisorInfo(null)
          }
        }
      } finally {
        setLoadingSetup(false)
      }
    }
    if (profile) load()
  }, [profile])

  useEffect(() => {
    function handler(e) {
      if (catRef.current && !catRef.current.contains(e.target)) setShowCatList(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function setField(key, value) {
    setForm(f => ({ ...f, [key]: value }))
    setError('')
  }

  function handleFiles(fileList) {
    const novos = Array.from(fileList).filter(f => {
      if (f.size > MAX_FILE_SIZE) { setError(`Arquivo "${f.name}" excede 10 MB.`); return false }
      return true
    })
    setArquivos(prev => [...prev, ...novos.map(file => ({ file, id: crypto.randomUUID() }))])
  }

  // Fluxo visual — diretores são selecionados pelo supervisor, não aqui
  const flowSteps = isDirector
    ? [{ label: 'Você cria', active: true }, { label: 'Autoaprovado', green: true }]
    : isSupervisor
      ? [{ label: 'Você cria', active: true }, { label: 'Seleciona diretores + aprova' }, { label: 'Diretores' }, { label: 'Concluído', green: true }]
      : [
          { label: 'Você cria', active: true },
          { label: supervisorInfo?.nome || 'Supervisor', sub: 'seleciona diretores' },
          { label: 'Diretor(es)' },
          { label: 'Concluído', green: true },
        ]

  async function handleSubmit() {
    if (!form.titulo.trim())    return setError('Título é obrigatório.')
    if (!form.descricao.trim()) return setError('Descrição é obrigatória.')
    if (form.valor !== '' && parseFloat(form.valor) < 0) return setError('Valor não pode ser negativo.')

    if (!isSupervisor && !isDirector && !supervisorInfo) {
      return setError('Você não possui supervisor vinculado. Solicite ao administrador que configure seu perfil.')
    }

    if (isSupervisor && dirSel.length === 0) {
      return setError('Selecione ao menos um diretor para encaminhar a solicitação.')
    }

    setLoading(true)
    try {
      const payload = {
        titulo:         form.titulo.trim(),
        descricao:      form.descricao.trim(),
        valor:          form.valor !== '' ? parseFloat(form.valor) : null,
        categoria:      form.categoria.trim() || null,
        urgencia:       form.urgencia,
        solicitante_id: profile.id,
        status: isDirector   ? STATUS.APPROVED
               : isSupervisor ? STATUS.SUPERVISOR_APPROVED
               : STATUS.PENDING,
      }

      if (isSupervisor) {
        payload.supervisor_id          = profile.id
        payload.supervisor_aprovado_em = new Date().toISOString()
      }

      const { data, error: insertError } = await supabase
        .from('solicitacoes').insert(payload).select().single()

      if (insertError) { setError('Erro ao criar a solicitação. Tente novamente.'); return }

      // Supervisor criando: insere diretores selecionados
      if (isSupervisor && dirSel.length > 0) {
        await supabase.from('solicitacao_diretores').insert(
          dirSel.map(did => ({
            solicitacao_id: data.id,
            diretor_id:     did,
            status:         'pendente',
          }))
        )
        // Notifica os diretores
        await supabase.from('notificacoes').insert(
          dirSel.map(did => ({
            usuario_id:     did,
            solicitacao_id: data.id,
            mensagem:       `Solicitação "${data.titulo}" de ${profile.nome} aguarda sua aprovação.`,
          }))
        )
      }

      // Notificações
      if (!isSupervisor && !isDirector) {
        // Notifica o supervisor vinculado
        await supabase.from('notificacoes').insert({
          usuario_id:     supervisorInfo.id,
          solicitacao_id: data.id,
          mensagem:       `Nova solicitação de ${profile.nome} aguarda sua aprovação: "${data.titulo}"`,
        })
      }

      // Upload de anexos
      for (const { file } of arquivos) {
        const ext  = file.name.split('.').pop()
        const path = `${data.id}/${crypto.randomUUID()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('anexos').upload(path, file, { contentType: file.type })
        if (!upErr) {
          await supabase.from('anexos').insert({
            solicitacao_id: data.id,
            nome_arquivo:   file.name,
            storage_path:   path,
            mime_type:      file.type,
            tamanho_bytes:  file.size,
            uploaded_by:    profile.id,
          })
        }
      }

      // Histórico
      await supabase.from('historico').insert({
        solicitacao_id: data.id,
        usuario_id:     profile.id,
        descricao:      `Solicitação criada por ${profile.nome}`,
      })

      navigate(`/solicitacao/${data.id}`)
    } finally {
      setLoading(false)
    }
  }

  const catFiltradas = categorias.filter(c =>
    c.toLowerCase().includes(form.categoria.toLowerCase()) && c !== form.categoria
  )

  if (loadingSetup) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <div className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }} className="fade-in">

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
          <ArrowLeft size={15} />
        </button>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 26, fontWeight: 400, color: 'var(--green-brand)' }}>
            Nova solicitação
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 2 }}>
            Preencha os detalhes — o supervisor selecionará os diretores ao aprovar
          </p>
        </div>
      </div>

      {/* Aviso sem supervisor */}
      {!isSupervisor && !isDirector && !supervisorInfo && (
        <div style={{
          display: 'flex', gap: 12, alignItems: 'flex-start',
          background: 'var(--red-bg)', border: '1px solid var(--red-border)',
          borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 20,
        }}>
          <AlertCircle size={18} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--red)', marginBottom: 4 }}>
              Supervisor não vinculado
            </div>
            <div style={{ fontSize: 13, color: 'var(--red)', lineHeight: 1.6 }}>
              Você não possui supervisor vinculado. Solicite ao administrador que preencha o campo <strong>supervisor_id</strong> na tabela <strong>profiles</strong>.
            </div>
          </div>
        </div>
      )}

      {/* Fluxo visual */}
      <div className="card" style={{ marginBottom: 20, background: 'var(--green-pale)', borderColor: 'var(--green-pale-2)' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--green-brand)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
          Fluxo de aprovação
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {flowSteps.map((step, i) => (
            <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span style={{
                  padding: '4px 11px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                  background: step.active ? 'var(--accent)' : step.green ? 'var(--green-bg)' : 'var(--bg-2)',
                  color:      step.active ? 'white'          : step.green ? 'var(--green)'   : 'var(--text-3)',
                  border:     step.green  ? '1px solid var(--green-border)' : '1px solid transparent',
                }}>
                  {step.label}
                </span>
                {step.sub && (
                  <span style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2, paddingLeft: 4 }}>
                    {step.sub}
                  </span>
                )}
              </div>
              {i < flowSteps.length - 1 && <span style={{ color: 'var(--text-3)', fontSize: 13 }}>→</span>}
            </div>
          ))}
        </div>
        {!isSupervisor && !isDirector && supervisorInfo && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-2)' }}>
            Supervisor responsável: <strong style={{ color: 'var(--green-brand)' }}>{supervisorInfo.nome}</strong>
            {supervisorInfo.departamento && ` · ${supervisorInfo.departamento}`}
          </div>
        )}
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        <div className="input-group">
          <label>Título *</label>
          <input className="input" placeholder="Ex: Compra de equipamentos de TI"
            value={form.titulo} onChange={e => setField('titulo', e.target.value)} maxLength={120} />
        </div>

        <div className="input-group">
          <label>Descrição *</label>
          <textarea className="input" rows={4} placeholder="Descreva o motivo e os detalhes..."
            value={form.descricao} onChange={e => setField('descricao', e.target.value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }} className="grid-auto-fit">
          <div className="input-group">
            <label>Valor estimado (R$)</label>
            <input className="input" type="number" min="0" step="0.01" placeholder="0,00"
              value={form.valor}
              onChange={e => { const v = e.target.value; if (v === '' || parseFloat(v) >= 0) setField('valor', v) }} />
          </div>

          <div className="input-group" ref={catRef} style={{ position: 'relative' }}>
            <label>Categoria</label>
            <input className="input" placeholder="Ex: Compras, Viagens..." value={form.categoria}
              autoComplete="off"
              onChange={e => { setField('categoria', e.target.value); setShowCatList(true) }}
              onFocus={() => setShowCatList(true)} />
            {showCatList && catFiltradas.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                background: 'var(--bg-card)', border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-lg)',
                marginTop: 2, maxHeight: 160, overflowY: 'auto',
              }}>
                {catFiltradas.map(c => (
                  <div key={c}
                    style={{ padding: '9px 13px', fontSize: 13, cursor: 'pointer', color: 'var(--text-2)' }}
                    onMouseDown={() => { setField('categoria', c); setShowCatList(false) }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    {c}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="input-group">
          <label>Urgência</label>
          <div style={{ display: 'flex', gap: 8 }} className="urgencia-grid">
            {URGENCIAS.map(u => (
              <button key={u.value} type="button" onClick={() => setField('urgencia', u.value)} style={{
                flex: 1, padding: '9px 0', borderRadius: 'var(--radius-sm)',
                border: `1px solid ${form.urgencia === u.value ? u.color : 'var(--border)'}`,
                background: form.urgencia === u.value ? `${u.color}18` : 'var(--bg-2)',
                color: form.urgencia === u.value ? u.color : 'var(--text-3)',
                cursor: 'pointer', fontSize: 13, fontWeight: 500, transition: 'all 0.15s',
              }}>
                {u.label}
              </button>
            ))}
          </div>
        </div>

        {/* Seletor de diretores — apenas para supervisor */}
        {isSupervisor && (
          <div className="input-group">
            <label>
              Diretores para aprovação *
              <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: 6, color: 'var(--text-3)' }}>
                (todos precisarão aprovar)
              </span>
            </label>
            {diretores.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '8px 0' }}>
                Nenhum diretor cadastrado no sistema.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {diretores.map(d => {
                  const sel = dirSel.includes(d.id)
                  return (
                    <label key={d.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px',
                      borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                      background: sel ? 'var(--accent-dim)' : 'var(--bg-2)',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}>
                      <input type="checkbox" checked={sel}
                        onChange={() => setDirSel(prev => prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id])}
                        style={{ accentColor: 'var(--accent)', width: 15, height: 15 }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: sel ? 'var(--accent)' : 'var(--text)' }}>
                          {d.nome}
                        </div>
                        {d.departamento && (
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{d.departamento}</div>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>
            )}
            {dirSel.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                {dirSel.length} diretor(es) selecionado(s)
              </div>
            )}
          </div>
        )}

        {/* Anexos */}
        <div className="input-group">
          <label>Anexos <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--text-3)' }}>(PDF, imagens — máx. 10 MB cada)</span></label>
          <input ref={fileInputRef} type="file"
            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx"
            multiple style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
          <button type="button" className="btn btn-outline" style={{ alignSelf: 'flex-start' }}
            onClick={() => fileInputRef.current?.click()}>
            <Paperclip size={14} /> Selecionar arquivos
          </button>
          {arquivos.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              {arquivos.map(({ file, id }) => {
                const Icon = fileIcon(file.type)
                return (
                  <div key={id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    background: 'var(--bg-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                  }}>
                    <Icon size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{formatBytes(file.size)}</div>
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm"
                      style={{ padding: '3px 5px', color: 'var(--text-3)' }} onClick={() => setArquivos(p => p.filter(a => a.id !== id))}>
                      <X size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {error && (
          <div style={{
            background: 'var(--red-bg)', border: '1px solid var(--red-border)',
            borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: 13, color: 'var(--red)',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }} className="action-buttons">
          <button className="btn btn-outline" onClick={() => navigate(-1)}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSubmit}
            disabled={loading || (!isSupervisor && !isDirector && !supervisorInfo)}>
            {loading
              ? <span className="spinner" style={{ width: 14, height: 14, borderTopColor: 'white' }} />
              : <Send size={14} />}
            {loading ? 'Enviando...' : 'Enviar solicitação'}
          </button>
        </div>
      </div>
    </div>
  )
}
