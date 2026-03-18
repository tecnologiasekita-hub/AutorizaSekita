import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { ArrowLeft, Send, Paperclip, X, FileText, Image, File, AlertCircle } from 'lucide-react'
import { STATUS, URGENCY, formatBytes } from '../lib/workflow'

const MAX_FILE_SIZE = 10 * 1024 * 1024

const TIPOS = [
  'Exclusão de financeiro',
  'Exclusão de boleto',
  'Alteração de boleto',
  'Alteração de Quantidade',
  'Alteração de vencimento no sistema',
  'Devolução/Recusa – anexar NF',
  'Abatimento',
  'Desconto Comercial',
]

const EMPRESAS = [
  { codigo: '13', nome: 'AFAL' },
  { codigo: '19', nome: 'JCCO' },
  { codigo: '08', nome: 'MESO' },
  { codigo: '03', nome: 'ST'   },
]

function fileIcon(mime) {
  if (!mime) return File
  if (mime.startsWith('image/')) return Image
  if (mime === 'application/pdf') return FileText
  return File
}

export default function RenegociacaoVenda() {
  const { profile } = useAuth()
  const navigate     = useNavigate()
  const fileInputRef = useRef(null)

  const [loading,        setLoading]        = useState(false)
  const [loadingSetup,   setLoadingSetup]   = useState(true)
  const [error,          setError]          = useState('')
  const [arquivos,       setArquivos]       = useState([])
  const [supervisorInfo, setSupervisorInfo] = useState(null)
  const [dirSel,         setDirSel]         = useState([])

  const isSupervisor = profile?.role === 'supervisor'
  const isDirector   = profile?.role === 'diretor'

  const [form, setForm] = useState({
    tipos:                   [],
    empresa:                 '',
    cliente:                 '',
    data_emissao:            '',
    data_vencimento:         '',
    numero_pedido:           '',
    nota_fiscal:             '',
    valor:                   '',
    justificativa:           '',
    vencimento_atual:        '',
    vencimentos_solicitados: '',
  })

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function toggleTipo(tipo) {
    setForm(f => ({
      ...f,
      tipos: f.tipos.includes(tipo)
        ? f.tipos.filter(t => t !== tipo)
        : [...f.tipos, tipo],
    }))
  }

  useEffect(() => {
    async function load() {
      setLoadingSetup(true)
      try {
        if (isSupervisor) {
          const { data: myProf } = await supabase
            .from('profiles').select('diretor_id').eq('id', profile.id).single()
          if (myProf?.diretor_id) setDirSel([myProf.diretor_id])
        }
        if (!isSupervisor && !isDirector) {
          const { data: myProfile } = await supabase
            .from('profiles').select('supervisor_id').eq('id', profile.id).single()
          if (myProfile?.supervisor_id) {
            const { data: sup } = await supabase
              .from('profiles').select('id, nome').eq('id', myProfile.supervisor_id).single()
            setSupervisorInfo(sup || null)
          }
        }
      } finally {
        setLoadingSetup(false)
      }
    }
    if (profile) load()
  }, [profile])

  function handleFiles(fileList) {
    const novos = Array.from(fileList).filter(f => {
      if (f.size > MAX_FILE_SIZE) { setError('Arquivo excede 10MB'); return false }
      return true
    })
    setArquivos(prev => [...prev, ...novos])
  }

  async function handleSubmit() {
    setError('')
    if (form.tipos.length === 0)     return setError('Selecione ao menos um tipo de solicitação.')
    if (!form.empresa)               return setError('Selecione a empresa.')
    if (!form.cliente.trim())        return setError('Informe o cliente.')
    if (!form.justificativa.trim())  return setError('Preencha a justificativa.')
    if (!isSupervisor && !isDirector && !supervisorInfo)
      return setError('Supervisor não vinculado. Você não possui supervisor vinculado.')

    setLoading(true)
    try {
      const empresa = EMPRESAS.find(e => e.codigo === form.empresa)
      const titulo = 'Renegociação de Venda — ' + form.cliente
      const linhas = [
        'Tipos: ' + form.tipos.join(', '),
        'Empresa: ' + (empresa ? empresa.codigo + ' – ' + empresa.nome : form.empresa),
        'Cliente: ' + form.cliente,
        form.data_emissao     ? 'Data de emissão: '          + form.data_emissao            : '',
        form.data_vencimento  ? 'Data de vencimento: '       + form.data_vencimento         : '',
        form.numero_pedido    ? 'Número pedido/venda: '      + form.numero_pedido           : '',
        form.nota_fiscal      ? 'Nota Fiscal: '              + form.nota_fiscal             : '',
        form.valor            ? 'Valor: R$ '                 + form.valor                   : '',
        form.vencimento_atual ? 'Vencimento atual: '         + form.vencimento_atual        : '',
        form.vencimentos_solicitados ? 'Vencimentos solicitados: ' + form.vencimentos_solicitados : '',
        '',
        'Justificativa: ' + form.justificativa,
      ]
      const descricao = linhas.filter(Boolean).join('\n')

      const payload = {
        titulo,
        descricao,
        valor:          form.valor ? parseFloat(form.valor.replace(/\./g, '').replace(',', '.')) : null,
        categoria:      'Renegociação de Venda',
        setor_origem:   profile.departamento || null,
        urgencia:       URGENCY.NORMAL,
        requer_tesouraria: true,
        solicitante_id: profile.id,
        status:         isSupervisor ? STATUS.SUPERVISOR_APPROVED : STATUS.PENDING,
      }

      if (isSupervisor) {
        payload.supervisor_id          = profile.id
        payload.supervisor_aprovado_em = new Date().toISOString()
      }

      const { data: sol, error: solErr } = await supabase
        .from('solicitacoes').insert(payload).select().single()
      if (solErr) throw solErr

      for (const file of arquivos) {
        const path = sol.id + '/' + Date.now() + '-' + file.name
        const { error: upErr } = await supabase.storage.from('anexos').upload(path, file)
        if (!upErr) {
          await supabase.from('anexos').insert({
            solicitacao_id: sol.id,
            nome_arquivo:   file.name,
            storage_path:   path,
            mime_type:      file.type,
            tamanho_bytes:  file.size,
            uploaded_by:    profile.id,
          })
        }
      }

      await supabase.from('historico').insert({
        solicitacao_id: sol.id,
        usuario_id:     profile.id,
        descricao:      'Solicitação criada por ' + profile.nome,
      })

      if (isSupervisor && dirSel.length > 0) {
        await supabase.from('solicitacao_diretores').insert(
          dirSel.map(did => ({ solicitacao_id: sol.id, diretor_id: did, status: 'pendente' }))
        )
      }

      navigate('/solicitacao/' + sol.id)
    } catch (e) {
      console.error(e)
      setError('Erro ao enviar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  if (loadingSetup) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
      <div className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  )

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }} className="fade-in">

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/nova-solicitacao')}>
          <ArrowLeft size={15} />
        </button>
        <div>
          <h1 style={{ fontFamily: 'var(--font-body)', fontSize: 22, fontWeight: 700, color: 'var(--green-brand)' }}>
            Autorização de Renegociação de Venda
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 2 }}>Sekita Agronegócios</p>
        </div>
      </div>

      {!isSupervisor && !isDirector && !supervisorInfo && (
        <div style={{
          display: 'flex', gap: 12, alignItems: 'flex-start',
          background: 'var(--red-bg)', border: '1px solid var(--red-border)',
          borderRadius: 'var(--radius)', padding: '14px 16px',
        }}>
          <AlertCircle size={18} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--red)', marginBottom: 4 }}>Supervisor não vinculado</div>
            <div style={{ fontSize: 13, color: 'var(--red)' }}>Você não possui supervisor vinculado.</div>
          </div>
        </div>
      )}

      {error && (
        <div style={{
          display: 'flex', gap: 10, alignItems: 'center',
          background: 'var(--red-bg)', border: '1px solid var(--red-border)',
          borderRadius: 'var(--radius)', padding: '12px 16px',
        }}>
          <AlertCircle size={16} style={{ color: 'var(--red)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--red)' }}>{error}</span>
        </div>
      )}

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        <div className="input-group">
          <label>Tipo de solicitação *</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            {TIPOS.map(tipo => (
              <label key={tipo} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid ' + (form.tipos.includes(tipo) ? 'var(--accent)' : 'var(--border)'),
                background: form.tipos.includes(tipo) ? 'var(--accent-dim)' : 'var(--bg-2)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
                <input type="checkbox" checked={form.tipos.includes(tipo)} onChange={() => toggleTipo(tipo)}
                  style={{ accentColor: 'var(--accent)', width: 15, height: 15, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: form.tipos.includes(tipo) ? 600 : 400,
                  color: form.tipos.includes(tipo) ? 'var(--accent)' : 'var(--text)' }}>
                  {tipo}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="input-group">
          <label>Empresa *</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            {EMPRESAS.map(emp => (
              <label key={emp.codigo} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid ' + (form.empresa === emp.codigo ? 'var(--accent)' : 'var(--border)'),
                background: form.empresa === emp.codigo ? 'var(--accent-dim)' : 'var(--bg-2)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
                <input type="radio" name="empresa" value={emp.codigo}
                  checked={form.empresa === emp.codigo}
                  onChange={() => setField('empresa', emp.codigo)}
                  style={{ accentColor: 'var(--accent)', width: 14, height: 14 }} />
                <span style={{ fontSize: 13, fontWeight: 600,
                  color: form.empresa === emp.codigo ? 'var(--accent)' : 'var(--text)' }}>
                  {emp.codigo} – {emp.nome}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="input-group" style={{ gridColumn: '1 / -1' }}>
            <label>Cliente *</label>
            <input className="input" placeholder="Nome do cliente"
              value={form.cliente} onChange={e => setField('cliente', e.target.value)} />
          </div>
          <div className="input-group">
            <label>Data de emissão</label>
            <input className="input" type="date"
              value={form.data_emissao} onChange={e => setField('data_emissao', e.target.value)} />
          </div>
          <div className="input-group">
            <label>Data de vencimento</label>
            <input className="input" type="date"
              value={form.data_vencimento} onChange={e => setField('data_vencimento', e.target.value)} />
          </div>
          <div className="input-group">
            <label>Número pedido/venda</label>
            <input className="input" placeholder="Ex: 355855465"
              value={form.numero_pedido} onChange={e => setField('numero_pedido', e.target.value)} />
          </div>
          <div className="input-group">
            <label>Nota Fiscal</label>
            <input className="input" placeholder="Ex: 7629"
              value={form.nota_fiscal} onChange={e => setField('nota_fiscal', e.target.value)} />
          </div>
          <div className="input-group" style={{ gridColumn: '1 / -1' }}>
            <label>Valor (R$)</label>
            <input className="input" placeholder="Ex: 100.100,00"
              value={form.valor} onChange={e => setField('valor', e.target.value)} />
          </div>
        </div>

        <div className="input-group">
          <label>Boleto vencimento atual</label>
          <input className="input" placeholder="Ex: 03/05/2026 R$ 100.100,00"
            value={form.vencimento_atual} onChange={e => setField('vencimento_atual', e.target.value)} />
        </div>

        <div className="input-group">
          <label>Vencimentos solicitados</label>
          <input className="input" placeholder="Ex: 23/04/2026 | 28/04/2026 | 03/05/2026"
            value={form.vencimentos_solicitados} onChange={e => setField('vencimentos_solicitados', e.target.value)} />
        </div>

        <div className="input-group">
          <label>Justificativa *</label>
          <textarea className="input" rows={4} placeholder="Descreva o motivo da renegociação..."
            value={form.justificativa} onChange={e => setField('justificativa', e.target.value)} />
        </div>

        <div className="input-group">
          <label>
            Anexos{' '}
            <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--text-3)' }}>
              (PDF, imagens — máx. 10 MB cada)
            </span>
          </label>
          <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.gif,.webp"
            multiple style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
          {arquivos.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              {arquivos.map((f, i) => {
                const Icon = fileIcon(f.type)
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)', background: 'var(--bg-2)', border: '1px solid var(--border)',
                  }}>
                    <Icon size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{formatBytes(f.size)}</span>
                    <button className="btn btn-ghost btn-sm" style={{ padding: '3px 5px' }}
                      onClick={() => setArquivos(prev => prev.filter((_, j) => j !== i))}>
                      <X size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          <button className="btn btn-outline btn-sm" onClick={() => fileInputRef.current?.click()}>
            <Paperclip size={13} /> Anexar arquivo
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
          <button className="btn btn-primary" onClick={handleSubmit}
            disabled={loading || (!isSupervisor && !isDirector && !supervisorInfo)}>
            {loading
              ? <span className="spinner" style={{ width: 14, height: 14, borderTopColor: 'white' }} />
              : <Send size={14} />}
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
