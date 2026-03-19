import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { ArrowLeft, Send, Paperclip, X, FileText, Image, File, AlertCircle } from 'lucide-react'
import { STATUS, formatBytes } from '../lib/workflow'

const MAX_FILE_SIZE = 10 * 1024 * 1024

const EMPRESAS = [
  { codigo: '13', nome: 'AFAL' },
  { codigo: '08', nome: 'MESO' },
  { codigo: '03', nome: 'SCT' },
]

const MOTIVOS = [
  { value: 'desconto_comercial', label: 'Desconto comercial' },
  { value: 'renegociacao_qualidade_devolucao', label: 'Renegociação > Qualidade do produto > Devolução' },
  { value: 'renegociacao_qualidade_desconto', label: 'Renegociação > Qualidade do produto > Desconto' },
  { value: 'renegociacao_qualidade_data_vencimento', label: 'Renegociação > Qualidade do produto > Data de vencimento' },
  { value: 'renegociacao_financeira_data_vencimento', label: 'Renegociação > Condição financeira do cliente > Data de vencimento' },
  { value: 'renegociacao_financeira_multa', label: 'Renegociação > Condição financeira do cliente > Abatimento de multa' },
  { value: 'renegociacao_financeira_juros', label: 'Renegociação > Condição financeira do cliente > Abatimento de juros' },
  { value: 'faturamento_dados_incorretos', label: 'Faturamento (Dados da empresa incorretos)' },
  { value: 'mudanca_forma_pagamento_exclusao_boleto', label: 'Mudança forma de pagamento (Exclusão de boleto)' },
]

const JUSTIFICATIVAS = [
  'Nova data',
  'Novo valor',
  'Nova data e novo valor',
]

function fileIcon(mime) {
  if (!mime) return File
  if (mime.startsWith('image/')) return Image
  if (mime === 'application/pdf') return FileText
  return File
}

export default function RenegociacaoVenda() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [loading, setLoading] = useState(false)
  const [loadingSetup, setLoadingSetup] = useState(true)
  const [error, setError] = useState('')
  const [arquivos, setArquivos] = useState([])
  const [supervisorInfo, setSupervisorInfo] = useState(null)
  const [dirSel, setDirSel] = useState([])

  const isSupervisor = profile?.role === 'supervisor'
  const isDirector = profile?.role === 'diretor'

  const [form, setForm] = useState({
    empresa_origem: '',
    cliente: '',
    data_emissao: '',
    data_vencimento: '',
    numero_pedido_venda: '',
    numero_nota_fiscal: '',
    valor: '0.00',
    motivo: '',
    justificativa: '',
    nova_data: '',
    novo_valor: '0.00',
    observacao: '',
  })

  function setField(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function handleNumericText(key, value) {
    setField(key, value.replace(/\D/g, ''))
  }

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

  function handleFiles(fileList) {
    const novos = Array.from(fileList).filter(file => {
      if (file.size > MAX_FILE_SIZE) {
        setError('Arquivo excede 10MB')
        return false
      }
      return true
    })
    setArquivos(prev => [...prev, ...novos])
  }

  async function handleSubmit() {
    setError('')

    if (!form.empresa_origem) return setError('Selecione a empresa de origem.')
    if (!form.cliente.trim()) return setError('Informe o cliente.')
    if (!form.data_emissao) return setError('Informe a data de emissão.')
    if (!form.data_vencimento) return setError('Informe a data de vencimento.')
    if (!form.numero_pedido_venda.trim()) return setError('Informe o número do pedido/venda.')
    if (!form.numero_nota_fiscal.trim()) return setError('Informe o número da nota fiscal.')
    if (Number(form.valor) < 0) return setError('O valor não pode ser negativo.')
    if (!form.motivo) return setError('Selecione um motivo.')
    if (!form.justificativa) return setError('Selecione a justificativa.')
    if ((form.justificativa === 'Nova data' || form.justificativa === 'Nova data e novo valor') && !form.nova_data) {
      return setError('Informe a nova data.')
    }
    if ((form.justificativa === 'Novo valor' || form.justificativa === 'Nova data e novo valor') && Number(form.novo_valor) < 0) {
      return setError('O novo valor não pode ser negativo.')
    }
    if (!isSupervisor && !isDirector && !supervisorInfo) {
      return setError('Supervisor não vinculado. Você não possui supervisor vinculado.')
    }

    setLoading(true)
    try {
      const empresa = EMPRESAS.find(item => item.codigo === form.empresa_origem)
      const motivo = MOTIVOS.find(item => item.value === form.motivo)

      const titulo = 'Renegociação de Venda - ' + form.cliente.trim()
      const descricao = [
        'Empresa de origem: ' + (empresa ? `${empresa.codigo}-${empresa.nome}` : form.empresa_origem),
        'Cliente: ' + form.cliente.trim(),
        'Data de emissão: ' + form.data_emissao,
        'Data de vencimento: ' + form.data_vencimento,
        'Número do pedido/venda: ' + form.numero_pedido_venda,
        'Número da nota fiscal: ' + form.numero_nota_fiscal,
        'Valor (R$): ' + Number(form.valor).toFixed(2),
        'Motivo: ' + (motivo?.label || form.motivo),
        'Justificativa: ' + form.justificativa,
        form.nova_data ? 'Nova data: ' + form.nova_data : '',
        form.justificativa !== 'Nova data' ? 'Novo valor (R$): ' + Number(form.novo_valor || 0).toFixed(2) : '',
        form.observacao.trim() ? 'Observação: ' + form.observacao.trim() : '',
      ].filter(Boolean).join('\n')

      const payload = {
        titulo,
        descricao,
        valor: Number(form.valor),
        categoria: 'Renegociação de Venda',
        formulario_tipo: 'renegociacao_venda',
        dados_formulario: {
          empresa_origem: empresa ? `${empresa.codigo}-${empresa.nome}` : form.empresa_origem,
          cliente: form.cliente.trim(),
          data_emissao: form.data_emissao,
          data_vencimento: form.data_vencimento,
          numero_pedido_venda: form.numero_pedido_venda,
          numero_nota_fiscal: form.numero_nota_fiscal,
          valor: Number(form.valor),
          motivo: form.motivo,
          motivo_label: motivo?.label || form.motivo,
          justificativa: form.justificativa,
          nova_data: form.nova_data || null,
          novo_valor: form.justificativa === 'Nova data' ? null : Number(form.novo_valor || 0),
          observacao: form.observacao.trim() || null,
        },
        setor_origem: profile.departamento || null,
        requer_tesouraria: true,
        solicitante_id: profile.id,
        status: isSupervisor ? STATUS.SUPERVISOR_APPROVED : STATUS.PENDING,
      }

      if (isSupervisor) {
        payload.supervisor_id = profile.id
        payload.supervisor_aprovado_em = new Date().toISOString()
      }

      const { data: sol, error: solErr } = await supabase
        .from('solicitacoes')
        .insert(payload)
        .select()
        .single()
      if (solErr) throw solErr

      for (const file of arquivos) {
        const path = sol.id + '/' + Date.now() + '-' + file.name
        const { error: upErr } = await supabase.storage.from('anexos').upload(path, file)
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
        descricao: 'Solicitação criada por ' + profile.nome,
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

  if (loadingSetup) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <div className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }} className="fade-in">
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
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
          <AlertCircle size={18} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--red)', marginBottom: 4 }}>Supervisor não vinculado</div>
            <div style={{ fontSize: 13, color: 'var(--red)' }}>Você não possui supervisor vinculado.</div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 'var(--radius)', padding: '12px 16px' }}>
          <AlertCircle size={16} style={{ color: 'var(--red)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--red)' }}>{error}</span>
        </div>
      )}

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="input-group">
          <label>Empresa de origem *</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            {EMPRESAS.map(emp => (
              <label key={emp.codigo} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid ' + (form.empresa_origem === emp.codigo ? 'var(--accent)' : 'var(--border)'), background: form.empresa_origem === emp.codigo ? 'var(--accent-dim)' : 'var(--bg-2)', cursor: 'pointer', transition: 'all 0.15s' }}>
                <input
                  type="radio"
                  name="empresa_origem"
                  value={emp.codigo}
                  checked={form.empresa_origem === emp.codigo}
                  onChange={() => setField('empresa_origem', emp.codigo)}
                  style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
                />
                <span style={{ fontSize: 13, fontWeight: 600, color: form.empresa_origem === emp.codigo ? 'var(--accent)' : 'var(--text)' }}>
                  {emp.codigo}-{emp.nome}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <div className="input-group" style={{ gridColumn: '1 / -1' }}>
            <label>Cliente *</label>
            <input className="input" value={form.cliente} onChange={e => setField('cliente', e.target.value)} placeholder="Nome do cliente" />
          </div>

          <div className="input-group">
            <label>Data de emissão *</label>
            <input className="input" type="date" value={form.data_emissao} onChange={e => setField('data_emissao', e.target.value)} />
          </div>

          <div className="input-group">
            <label>Data de vencimento *</label>
            <input className="input" type="date" value={form.data_vencimento} onChange={e => setField('data_vencimento', e.target.value)} />
          </div>

          <div className="input-group">
            <label>Número do pedido/venda *</label>
            <input className="input" inputMode="numeric" value={form.numero_pedido_venda} onChange={e => handleNumericText('numero_pedido_venda', e.target.value)} placeholder="Somente números" />
          </div>

          <div className="input-group">
            <label>Número da nota fiscal *</label>
            <input className="input" inputMode="numeric" value={form.numero_nota_fiscal} onChange={e => handleNumericText('numero_nota_fiscal', e.target.value)} placeholder="Somente números" />
          </div>

          <div className="input-group">
            <label>Valor (R$) *</label>
            <input className="input" type="number" min="0" step="0.01" value={form.valor} onChange={e => setField('valor', e.target.value)} />
          </div>
        </div>

        <div className="input-group">
          <label>Motivo *</label>
          <select className="input" value={form.motivo} onChange={e => setField('motivo', e.target.value)}>
            <option value="">Selecione um motivo</option>
            {MOTIVOS.map(item => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <div className="input-group">
            <label>Justificativa *</label>
            <select className="input" value={form.justificativa} onChange={e => setField('justificativa', e.target.value)}>
              <option value="">Selecione a justificativa</option>
              {JUSTIFICATIVAS.map(item => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>

          <div className="input-group">
            <label>Nova data</label>
            <input className="input" type="date" value={form.nova_data} onChange={e => setField('nova_data', e.target.value)} />
          </div>

          <div className="input-group">
            <label>Novo valor</label>
            <input className="input" type="number" min="0" step="0.01" value={form.novo_valor} onChange={e => setField('novo_valor', e.target.value)} />
          </div>
        </div>

        <div className="input-group">
          <label>Observação</label>
          <textarea className="input" rows={4} value={form.observacao} onChange={e => setField('observacao', e.target.value)} placeholder="Digite observações adicionais..." />
        </div>

        <div className="input-group">
          <label>
            Anexo{' '}
            <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--text-3)' }}>
              (PDF, imagens - máx. 10 MB cada)
            </span>
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp"
            multiple
            style={{ display: 'none' }}
            onChange={e => handleFiles(e.target.files)}
          />

          {arquivos.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              {arquivos.map((file, index) => {
                const Icon = fileIcon(file.type)
                return (
                  <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
                    <Icon size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{formatBytes(file.size)}</span>
                    <button className="btn btn-ghost btn-sm" style={{ padding: '3px 5px' }} onClick={() => setArquivos(prev => prev.filter((_, i) => i !== index))}>
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
