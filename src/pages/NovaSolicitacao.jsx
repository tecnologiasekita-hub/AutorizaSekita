import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { ArrowLeft, Send, Paperclip, X, FileText, Image, File } from 'lucide-react'
import { STATUS, URGENCY, URGENCY_META, formatBytes } from '../lib/workflow'

const URGENCIAS = [
  { value: URGENCY.LOW,      label: 'Baixa',   color: URGENCY_META[URGENCY.LOW].color },
  { value: URGENCY.NORMAL,   label: 'Normal',  color: URGENCY_META[URGENCY.NORMAL].color },
  { value: URGENCY.HIGH,     label: 'Alta',    color: URGENCY_META[URGENCY.HIGH].color },
  { value: URGENCY.CRITICAL, label: 'Crítica', color: URGENCY_META[URGENCY.CRITICAL].color },
]

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

function fileIcon(mime) {
  if (!mime) return File
  if (mime.startsWith('image/')) return Image
  if (mime === 'application/pdf') return FileText
  return File
}

export default function NovaSolicitacao() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')
  const [diretores,    setDiretores]    = useState([])
  const [categorias,   setCategorias]   = useState([])
  const [showCatList,  setShowCatList]  = useState(false)
  const [arquivos,     setArquivos]     = useState([])  // { file, preview }
  const catRef = useRef(null)

  const [form, setForm] = useState({
    titulo:          '',
    descricao:       '',
    valor:           '',
    categoria:       '',
    urgencia:        URGENCY.NORMAL,
    diretoresSel:    [],
  })

  // Busca diretores e categorias recentes
  useEffect(() => {
    async function load() {
      const [{ data: dirs }, { data: cats }] = await Promise.all([
        supabase.from('profiles').select('id, nome, departamento').eq('role', 'diretor').order('nome'),
        supabase.from('solicitacoes')
          .select('categoria')
          .not('categoria', 'is', null)
          .neq('categoria', '')
          .order('created_at', { ascending: false })
          .limit(100),
      ])
      setDiretores(dirs || [])
      if (cats) {
        const uniq = [...new Set(cats.map(c => c.categoria).filter(Boolean))]
        setCategorias(uniq.slice(0, 20))
      }
    }
    load()
  }, [])

  // Fecha dropdown categoria ao clicar fora
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

  function toggleDiretor(id) {
    setForm(f => ({
      ...f,
      diretoresSel: f.diretoresSel.includes(id)
        ? f.diretoresSel.filter(d => d !== id)
        : [...f.diretoresSel, id],
    }))
    setError('')
  }

  function handleFiles(fileList) {
    const novos = Array.from(fileList).filter(f => {
      if (f.size > MAX_FILE_SIZE) {
        setError(`Arquivo "${f.name}" excede 10 MB.`)
        return false
      }
      return true
    })
    setArquivos(prev => [
      ...prev,
      ...novos.map(file => ({ file, id: crypto.randomUUID() })),
    ])
  }

  function removeArquivo(id) {
    setArquivos(prev => prev.filter(a => a.id !== id))
  }

  // Fluxo visual conforme papel
  const isSupervisor = profile?.role === 'supervisor'
  const isDirector   = profile?.role === 'diretor'

  const flowSteps = isDirector
    ? [{ label: 'Você cria', active: true }, { label: 'Autoaprovado', green: true }]
    : isSupervisor
      ? [{ label: 'Você cria', active: true }, { label: 'Diretor(es)' }, { label: 'Concluído', green: true }]
      : [{ label: 'Você cria', active: true }, { label: 'Supervisor' }, { label: 'Diretor(es)' }, { label: 'Concluído', green: true }]

  // Necessário selecionar diretores exceto se for o próprio diretor criando
  const needsDiretores = !isDirector

  async function handleSubmit() {
    if (!form.titulo.trim())   return setError('Título é obrigatório.')
    if (!form.descricao.trim()) return setError('Descrição é obrigatória.')
    if (form.valor !== '' && parseFloat(form.valor) < 0) return setError('Valor não pode ser negativo.')
    if (needsDiretores && form.diretoresSel.length === 0)
      return setError('Selecione ao menos um diretor.')

    setLoading(true)
    try {
      // Monta payload
      const payload = {
        titulo:        form.titulo.trim(),
        descricao:     form.descricao.trim(),
        valor:         form.valor !== '' ? parseFloat(form.valor) : null,
        categoria:     form.categoria.trim() || null,
        urgencia:      form.urgencia,
        solicitante_id: profile.id,
        status:        isDirector
          ? STATUS.APPROVED
          : isSupervisor
            ? STATUS.SUPERVISOR_APPROVED
            : STATUS.PENDING,
      }

      if (isSupervisor) {
        payload.supervisor_id          = profile.id
        payload.supervisor_aprovado_em = new Date().toISOString()
      }

      const { data, error: submitError } = await supabase
        .from('solicitacoes').insert(payload).select().single()

      if (submitError) {
        setError('Erro ao criar a solicitação. Tente novamente.')
        return
      }

      // Insere diretores selecionados
      if (!isDirector && form.diretoresSel.length > 0) {
        await supabase.from('solicitacao_diretores').insert(
          form.diretoresSel.map(did => ({
            solicitacao_id: data.id,
            diretor_id:     did,
            status:         'pendente',
          }))
        )

        // Notifica os diretores (apenas se já foi aprovado pelo supervisor ou é supervisor criando)
        if (isSupervisor) {
          await supabase.from('notificacoes').insert(
            form.diretoresSel.map(did => ({
              usuario_id:     did,
              solicitacao_id: data.id,
              mensagem:       `Nova solicitação aguardando sua aprovação: "${data.titulo}"`,
            }))
          )
        }
      }

      // Upload de anexos
      for (const { file } of arquivos) {
        const ext  = file.name.split('.').pop()
        const path = `${data.id}/${crypto.randomUUID()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('anexos')
          .upload(path, file, { contentType: file.type })

        if (!uploadError) {
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

      // Se supervisor criou, registra auto-aprovação supervisor no histórico
      if (isSupervisor) {
        await supabase.from('historico').insert({
          solicitacao_id: data.id,
          usuario_id:     profile.id,
          descricao:      `Etapa supervisor dispensada — solicitante é supervisor`,
        })
      }

      navigate(`/solicitacao/${data.id}`)
    } finally {
      setLoading(false)
    }
  }

  const catFiltradas = categorias.filter(c =>
    c.toLowerCase().includes(form.categoria.toLowerCase()) && c !== form.categoria
  )

  return (
    <div style={{ maxWidth: 660, margin: '0 auto' }} className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
          <ArrowLeft size={15} />
        </button>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 26, fontWeight: 400, color: 'var(--green-brand)' }}>
            Nova solicitação
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 2 }}>
            Preencha os detalhes para iniciar o fluxo de aprovação
          </p>
        </div>
      </div>

      {/* Fluxo visual */}
      <div className="card" style={{ marginBottom: 20, background: 'var(--green-pale)', borderColor: 'var(--green-pale-2)' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--green-brand)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
          Seu fluxo de aprovação
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {flowSteps.map((step, i) => (
            <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FlowChip {...step} />
              {i < flowSteps.length - 1 && <span style={{ color: 'var(--text-3)', fontSize: 13 }}>→</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Título */}
        <div className="input-group">
          <label>Título *</label>
          <input
            className="input"
            placeholder="Ex: Compra de equipamentos de TI"
            value={form.titulo}
            onChange={e => setField('titulo', e.target.value)}
            maxLength={120}
          />
        </div>

        {/* Descrição */}
        <div className="input-group">
          <label>Descrição *</label>
          <textarea
            className="input"
            rows={4}
            placeholder="Descreva o motivo e os detalhes..."
            value={form.descricao}
            onChange={e => setField('descricao', e.target.value)}
          />
        </div>

        {/* Valor e Categoria */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }} className="grid-auto-fit">
          <div className="input-group">
            <label>Valor estimado (R$)</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              placeholder="0,00"
              value={form.valor}
              onChange={e => {
                const v = e.target.value
                if (v === '' || parseFloat(v) >= 0) setField('valor', v)
              }}
            />
          </div>

          {/* Categoria com autocomplete */}
          <div className="input-group" ref={catRef} style={{ position: 'relative' }}>
            <label>Categoria</label>
            <input
              className="input"
              placeholder="Ex: Compras, Viagens..."
              value={form.categoria}
              autoComplete="off"
              onChange={e => { setField('categoria', e.target.value); setShowCatList(true) }}
              onFocus={() => setShowCatList(true)}
            />
            {showCatList && catFiltradas.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                background: 'var(--bg-card)', border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-lg)',
                marginTop: 2, maxHeight: 160, overflowY: 'auto',
              }}>
                {catFiltradas.map(c => (
                  <div
                    key={c}
                    style={{ padding: '9px 13px', fontSize: 13, cursor: 'pointer', color: 'var(--text-2)' }}
                    onMouseDown={() => { setField('categoria', c); setShowCatList(false) }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {c}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Urgência */}
        <div className="input-group">
          <label>Urgência</label>
          <div style={{ display: 'flex', gap: 8 }} className="urgencia-grid">
            {URGENCIAS.map(u => (
              <button
                key={u.value}
                type="button"
                onClick={() => setField('urgencia', u.value)}
                style={{
                  flex: 1, padding: '9px 0',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${form.urgencia === u.value ? u.color : 'var(--border)'}`,
                  background: form.urgencia === u.value ? `${u.color}18` : 'var(--bg-2)',
                  color: form.urgencia === u.value ? u.color : 'var(--text-3)',
                  cursor: 'pointer', fontSize: 13, fontWeight: 500, transition: 'all 0.15s',
                }}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>

        {/* Seletor de diretores */}
        {needsDiretores && (
          <div className="input-group">
            <label>Diretores para aprovação *</label>
            {diretores.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '10px 0' }}>
                Nenhum diretor cadastrado no sistema.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {diretores.map(d => {
                  const sel = form.diretoresSel.includes(d.id)
                  return (
                    <label
                      key={d.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 13px',
                        borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                        background: sel ? 'var(--accent-dim)' : 'var(--bg-2)',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={sel}
                        onChange={() => toggleDiretor(d.id)}
                        style={{ accentColor: 'var(--accent)', width: 15, height: 15 }}
                      />
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
            {form.diretoresSel.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                {form.diretoresSel.length} diretor(es) selecionado(s) — todos precisam aprovar
              </div>
            )}
          </div>
        )}

        {/* Anexos */}
        <div className="input-group">
          <label>Anexos <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--text-3)' }}>(PDF, imagens — máx. 10 MB cada)</span></label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx"
            multiple
            style={{ display: 'none' }}
            onChange={e => handleFiles(e.target.files)}
          />
          <button
            type="button"
            className="btn btn-outline"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip size={14} /> Selecionar arquivos
          </button>

          {arquivos.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              {arquivos.map(({ file, id }) => {
                const Icon = fileIcon(file.type)
                return (
                  <div key={id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px',
                    background: 'var(--bg-2)', borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                  }}>
                    <Icon size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{formatBytes(file.size)}</div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '3px 5px', color: 'var(--text-3)' }}
                      onClick={() => removeArquivo(id)}
                    >
                      <X size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Erro */}
        {error && (
          <div style={{
            background: 'var(--red-bg)', border: '1px solid var(--red-border)',
            borderRadius: 'var(--radius-sm)', padding: '10px 14px',
            fontSize: 13, color: 'var(--red)',
          }}>
            {error}
          </div>
        )}

        {/* Ações */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }} className="action-buttons">
          <button className="btn btn-outline" onClick={() => navigate(-1)}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
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

function FlowChip({ label, active, green }) {
  return (
    <span style={{
      padding: '4px 11px', borderRadius: 20, fontSize: 12, fontWeight: 500,
      background: active ? 'var(--accent)' : green ? 'var(--green-bg)' : 'var(--bg-2)',
      color:      active ? 'white'          : green ? 'var(--green)'   : 'var(--text-3)',
      border:     green  ? '1px solid var(--green-border)' : '1px solid transparent',
    }}>
      {label}
    </span>
  )
}
