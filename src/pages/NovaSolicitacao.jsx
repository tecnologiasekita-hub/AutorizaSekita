import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { FLOW_EVENTS, notificarFluxoFormulario } from '../lib/notificar'
import { supabase } from '../lib/supabase'
import { AlertCircle, ArrowLeft, File, FileText, Image, Paperclip, Send, X } from 'lucide-react'
import { APPROVER_ROLE, APPROVER_STATUS, STATUS, formatBytes } from '../lib/workflow'

const MAX_FILE_SIZE = 10 * 1024 * 1024

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

  const [loading, setLoading] = useState(false)
  const [loadingSetup, setLoadingSetup] = useState(true)
  const [error, setError] = useState('')
  const [arquivos, setArquivos] = useState([])
  const [supervisorInfo, setSupervisorInfo] = useState(null)
  const [dirSel, setDirSel] = useState([])

  const [form, setForm] = useState({
    titulo: '',
    descricao: '',
    setor_origem: '',
    valor: '',
    categoria: '',
  })

  const isSupervisor = profile?.role === 'supervisor'
  const isDirector = profile?.role === 'diretor'

  useEffect(() => {
    async function load() {
      setLoadingSetup(true)
      try {
        if (isSupervisor) {
          const { data: myProf } = await supabase
            .from('profiles')
            .select('diretor_id')
            .eq('id', profile.id)
            .single()

          if (myProf?.diretor_id) setDirSel([myProf.diretor_id])
        }

        if (!isSupervisor && !isDirector) {
          const { data: myProfile } = await supabase
            .from('profiles')
            .select('supervisor_id')
            .eq('id', profile.id)
            .single()

          if (myProfile?.supervisor_id) {
            const { data: sup } = await supabase
              .from('profiles')
              .select('id, nome')
              .eq('id', myProfile.supervisor_id)
              .single()

            setSupervisorInfo(sup || null)
          }
        }
      } finally {
        setLoadingSetup(false)
      }
    }

    if (profile) load()
  }, [profile, isSupervisor, isDirector])

  function setField(key, value) {
    setForm(current => ({ ...current, [key]: value }))
    setError('')
  }

  function handleFiles(fileList) {
    const novos = Array.from(fileList).filter(file => {
      if (file.size > MAX_FILE_SIZE) {
        setError(`Arquivo "${file.name}" excede 10 MB.`)
        return false
      }
      return true
    })

    setArquivos(prev => [...prev, ...novos.map(file => ({ file, id: crypto.randomUUID() }))])
  }

  async function handleSubmit() {
    if (!form.titulo.trim()) return setError('Título é obrigatório.')
    if (!form.descricao.trim()) return setError('Descrição é obrigatória.')

    if (!isSupervisor && !isDirector && !supervisorInfo) {
      return setError('Supervisor não vinculado. Você não possui supervisor vinculado.')
    }

    if (isSupervisor && dirSel.length === 0) {
      return setError('Nenhum diretor vinculado ao seu perfil.')
    }

    setLoading(true)
    try {
      const payload = {
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim(),
        formulario_tipo: 'solicitacao_geral',
        solicitante_id: profile.id,
        status: STATUS.IN_APPROVAL,
        dados_formulario: {
          titulo: form.titulo.trim(),
          descricao: form.descricao.trim(),
          categoria: form.categoria.trim() || null,
          setor_origem: form.setor_origem || null,
          valor: form.valor !== '' ? Number(form.valor) : null,
        },
      }

      const { data: sol, error: solErr } = await supabase
        .from('solicitacoes')
        .insert(payload)
        .select()
        .single()

      if (solErr) throw solErr

      for (const { file } of arquivos) {
        const ext = file.name.split('.').pop()
        const path = `${sol.id}/${crypto.randomUUID()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('anexos')
          .upload(path, file, { contentType: file.type })

        if (!upErr) {
          await supabase.from('anexos').insert({
            solicitacao_id: sol.id,
            nome_arquivo: file.name,
            storage_path: path,
            mime_type: file.type,
            tamanho_bytes: file.size,
            uploaded_by: profile.id,
          })
        }
      }

      await supabase.from('historico').insert({
        solicitacao_id: sol.id,
        usuario_id: profile.id,
        tipo_evento: 'criada',
        descricao: `Solicitação criada por ${profile.nome}`,
      })

      const aprovadores = isSupervisor
        ? dirSel.map(did => ({
            solicitacao_id: sol.id,
            usuario_id: did,
            papel: APPROVER_ROLE.DIRECTOR,
            ordem: 2,
            status: APPROVER_STATUS.PENDING,
          }))
        : [{
            solicitacao_id: sol.id,
            usuario_id: supervisorInfo.id,
            papel: APPROVER_ROLE.SUPERVISOR,
            ordem: 1,
            status: APPROVER_STATUS.PENDING,
          }]

      await supabase.from('solicitacao_aprovadores').insert(aprovadores)

      await notificarFluxoFormulario('solicitacao_geral', FLOW_EVENTS.CREATED, {
        solicitacaoId: sol.id,
        titulo: sol.titulo,
        actorNome: profile.nome,
        solicitanteId: profile.id,
        supervisorId: supervisorInfo?.id,
      })

      if (isSupervisor) {
        await supabase.from('solicitacao_aprovadores').insert({
          solicitacao_id: sol.id,
          usuario_id: profile.id,
          papel: APPROVER_ROLE.SUPERVISOR,
          ordem: 1,
          status: APPROVER_STATUS.APPROVED,
          comentario: 'Solicitação criada diretamente pelo supervisor.',
          decidido_em: new Date().toISOString(),
        })

        await supabase.from('solicitacao_pareceres').insert({
          solicitacao_id: sol.id,
          usuario_id: profile.id,
          papel: APPROVER_ROLE.SUPERVISOR,
          decisao: 'aprovado',
          comentario: 'Solicitação criada diretamente pelo supervisor.',
        })

        await supabase.from('historico').insert({
          solicitacao_id: sol.id,
          usuario_id: profile.id,
          tipo_evento: 'aprovacao_supervisor',
          descricao: `Aprovado pelo supervisor ${profile.nome}: solicitação criada diretamente pelo supervisor.`,
        })
      }

      navigate(`/solicitacao/${sol.id}`)
    } catch (submitError) {
      console.error('Erro ao enviar solicitação:', submitError)
      setError('Erro ao enviar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

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
          <h1 style={{ fontFamily: 'var(--font-body)', fontSize: 24, fontWeight: 700, color: 'var(--green-brand)' }}>
            Nova solicitação
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 2 }}>
            Formulário genérico no novo modelo de dados.
          </p>
        </div>
      </div>

      {!isSupervisor && !isDirector && !supervisorInfo && (
        <div
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
            background: 'var(--red-bg)',
            border: '1px solid var(--red-border)',
            borderRadius: 'var(--radius)',
            padding: '14px 16px',
            marginBottom: 20,
          }}
        >
          <AlertCircle size={18} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--red)', marginBottom: 4 }}>
              Supervisor não vinculado
            </div>
            <div style={{ fontSize: 13, color: 'var(--red)', lineHeight: 1.6 }}>
              Supervisor não vinculado. Você não possui supervisor vinculado.
            </div>
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            background: 'var(--red-bg)',
            border: '1px solid var(--red-border)',
            borderRadius: 'var(--radius)',
            padding: '12px 16px',
            marginBottom: 20,
          }}
        >
          <AlertCircle size={16} style={{ color: 'var(--red)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--red)' }}>{error}</span>
        </div>
      )}

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="input-group">
          <label>Título *</label>
          <input className="input" value={form.titulo} onChange={e => setField('titulo', e.target.value)} />
        </div>

        <div className="input-group">
          <label>Descrição *</label>
          <textarea className="input" rows={5} value={form.descricao} onChange={e => setField('descricao', e.target.value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <div className="input-group">
            <label>Setor de origem</label>
            <select className="input" value={form.setor_origem} onChange={e => setField('setor_origem', e.target.value)}>
              <option value="">Selecione</option>
              {SETORES.map(setor => (
                <option key={setor} value={setor}>{setor}</option>
              ))}
            </select>
          </div>

          <div className="input-group">
            <label>Categoria</label>
            <input className="input" value={form.categoria} onChange={e => setField('categoria', e.target.value)} />
          </div>

          <div className="input-group">
            <label>Valor estimado (R$)</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={form.valor}
              onChange={e => setField('valor', e.target.value)}
            />
          </div>
        </div>

        <div className="input-group">
          <label>
            Anexos{' '}
            <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--text-3)' }}>
              (max. 10 MB cada)
            </span>
          </label>

          <input
            ref={fileInputRef}
            type="file"
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
              {arquivos.map(item => {
                const Icon = fileIcon(item.file.type)
                return (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
                    <Icon size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.file.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{formatBytes(item.file.size)}</span>
                    <button className="btn btn-ghost btn-sm" style={{ padding: '3px 5px' }} onClick={() => setArquivos(prev => prev.filter(file => file.id !== item.id))}>
                      <X size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={loading || (!isSupervisor && !isDirector && !supervisorInfo)}>
            {loading ? <span className="spinner" style={{ width: 14, height: 14, borderTopColor: 'white' }} /> : <Send size={14} />}
            Enviar solicitação
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/nova-solicitacao')} disabled={loading}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
