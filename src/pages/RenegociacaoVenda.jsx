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

const MOTIVO_PRINCIPAL_OPTIONS = [
  { value: 'desconto_comercial', label: 'Desconto comercial' },
  { value: 'renegociacao', label: 'Renegocia\u00e7\u00e3o' },
  { value: 'faturamento', label: 'Faturamento' },
  { value: 'mudanca_forma_pagamento', label: 'Mudan\u00e7a de forma de pagamento' },
]

const MOTIVO_SUBGRUPO_OPTIONS = {
  renegociacao: [
    { value: 'qualidade', label: 'Qualidade do produto' },
    { value: 'financeira', label: 'Condi\u00e7\u00e3o financeira do cliente' },
  ],
}

const MOTIVO_ACAO_OPTIONS = {
  renegociacao_qualidade: [
    { value: 'devolucao', label: 'Devolu\u00e7\u00e3o' },
    { value: 'desconto', label: 'Desconto' },
    { value: 'data_vencimento', label: 'Data de vencimento' },
  ],
  renegociacao_financeira: [
    { value: 'data_vencimento', label: 'Data de vencimento' },
    { value: 'multa', label: 'Abatimento de multa' },
    { value: 'juros', label: 'Abatimento de juros' },
  ],
  faturamento: [
    { value: 'dados_incorretos', label: 'Dados da empresa incorretos' },
  ],
  mudanca_forma_pagamento: [
    { value: 'exclusao_boleto', label: 'Exclus\u00e3o de boleto' },
  ],
}

const MOTIVO_VALUE_MAP = {
  desconto_comercial: {
    value: 'desconto_comercial',
    label: 'Desconto comercial',
  },
  renegociacao_qualidade_devolucao: {
    value: 'renegociacao_qualidade_devolucao',
    label: 'Renegocia\u00e7\u00e3o > Qualidade do produto > Devolu\u00e7\u00e3o',
  },
  renegociacao_qualidade_desconto: {
    value: 'renegociacao_qualidade_desconto',
    label: 'Renegocia\u00e7\u00e3o > Qualidade do produto > Desconto',
  },
  renegociacao_qualidade_data_vencimento: {
    value: 'renegociacao_qualidade_data_vencimento',
    label: 'Renegocia\u00e7\u00e3o > Qualidade do produto > Data de vencimento',
  },
  renegociacao_financeira_data_vencimento: {
    value: 'renegociacao_financeira_data_vencimento',
    label: 'Renegocia\u00e7\u00e3o > Condi\u00e7\u00e3o financeira do cliente > Data de vencimento',
  },
  renegociacao_financeira_multa: {
    value: 'renegociacao_financeira_multa',
    label: 'Renegocia\u00e7\u00e3o > Condi\u00e7\u00e3o financeira do cliente > Abatimento de multa',
  },
  renegociacao_financeira_juros: {
    value: 'renegociacao_financeira_juros',
    label: 'Renegocia\u00e7\u00e3o > Condi\u00e7\u00e3o financeira do cliente > Abatimento de juros',
  },
  faturamento_dados_incorretos: {
    value: 'faturamento_dados_incorretos',
    label: 'Faturamento > Dados da empresa incorretos',
  },
  mudanca_forma_pagamento_exclusao_boleto: {
    value: 'mudanca_forma_pagamento_exclusao_boleto',
    label: 'Mudan\u00e7a de forma de pagamento > Exclus\u00e3o de boleto',
  },
}

const JUSTIFICATIVAS = [
  { value: 'Nova data', label: 'Nova data' },
  { value: 'Novo valor', label: 'Novo valor' },
  { value: 'Nova data e novo valor', label: 'Nova data e novo valor' },
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
  const [motivoPrincipal, setMotivoPrincipal] = useState('')
  const [motivoSubgrupo, setMotivoSubgrupo] = useState('')
  const [motivoAcao, setMotivoAcao] = useState('')
  const [justificativaTipo, setJustificativaTipo] = useState('')

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
    nova_data_2: '',
    nova_data_3: '',
    novo_valor: '0.00',
    observacao: '',
  })

  function setField(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function handleNumericText(key, value) {
    setField(key, value.replace(/\D/g, ''))
  }

  function clearMotivoSelection() {
    setMotivoPrincipal('')
    setMotivoSubgrupo('')
    setMotivoAcao('')
    setField('motivo', '')
  }

  function handleMotivoPrincipalChange(value) {
    setMotivoPrincipal(value)
    setMotivoSubgrupo('')
    setMotivoAcao('')

    if (value === 'desconto_comercial') {
      setField('motivo', 'desconto_comercial')
      return
    }

    setField('motivo', '')
  }

  function handleMotivoSubgrupoChange(value) {
    setMotivoSubgrupo(value)
    setMotivoAcao('')
    setField('motivo', '')
  }

  function handleMotivoAcaoChange(value) {
    setMotivoAcao(value)

    if (motivoPrincipal === 'renegociacao' && motivoSubgrupo) {
      setField('motivo', `renegociacao_${motivoSubgrupo}_${value}`)
      return
    }

    if (motivoPrincipal === 'faturamento') {
      setField('motivo', `faturamento_${value}`)
      return
    }

    if (motivoPrincipal === 'mudanca_forma_pagamento') {
      setField('motivo', `mudanca_forma_pagamento_${value}`)
    }
  }

  function getParcelDates() {
    return [form.nova_data, form.nova_data_2, form.nova_data_3].filter(Boolean)
  }

  function handleJustificativaChange(value) {
    setJustificativaTipo(value)
    setField('justificativa', value)

    if (value === 'Nova data') {
      setField('novo_valor', '0.00')
    }

    if (value === 'Novo valor') {
      setField('nova_data', '')
      setField('nova_data_2', '')
      setField('nova_data_3', '')
    }
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
    const parcelDates = getParcelDates()
    const exigeNovaData = form.justificativa === 'Nova data' || form.justificativa === 'Nova data e novo valor'

    if (!form.empresa_origem) return setError('Selecione a empresa de origem.')
    if (!form.cliente.trim()) return setError('Informe o cliente.')
    if (!form.data_emissao) return setError('Informe a data de emissão.')
    if (!form.data_vencimento) return setError('Informe a data de vencimento.')
    if (!form.numero_pedido_venda.trim()) return setError('Informe o número do pedido/venda.')
    if (!form.numero_nota_fiscal.trim()) return setError('Informe o número da nota fiscal.')
    if (Number(form.valor) < 0) return setError('O valor não pode ser negativo.')
    if (!form.motivo) return setError('Selecione um motivo.')
    if (!form.justificativa) return setError('Selecione a justificativa.')

    if (exigeNovaData && parcelDates.length < 1) {
      return setError('Informe pelo menos uma nova data.')
    }

    if ((form.justificativa === 'Novo valor' || form.justificativa === 'Nova data e novo valor') && String(form.novo_valor).trim() === '') {
      return setError('Informe o novo valor.')
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
      const motivo = MOTIVO_VALUE_MAP[form.motivo]

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
        parcelDates.length > 0 ? 'Novas datas: ' + parcelDates.join(', ') : '',
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
          nova_data_2: form.nova_data_2 || null,
          nova_data_3: form.nova_data_3 || null,
          novas_datas: parcelDates,
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
        const path = `${sol.id}/${Date.now()}-${file.name}`
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

        <div className="card" style={{ padding: 16, background: 'var(--bg-2)', borderColor: 'var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 14 }}>
            Motivo
          </div>

          <div className="input-group" style={{ marginBottom: 14 }}>
            <label>Motivo principal *</label>
            <select className="input" value={motivoPrincipal} onChange={e => handleMotivoPrincipalChange(e.target.value)}>
              <option value="">Selecione o motivo principal</option>
              {MOTIVO_PRINCIPAL_OPTIONS.map(item => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>

          {motivoPrincipal === 'renegociacao' && (
            <div className="input-group" style={{ marginBottom: 14 }}>
              <label>Contexto da renegociação *</label>
              <select className="input" value={motivoSubgrupo} onChange={e => handleMotivoSubgrupoChange(e.target.value)}>
                <option value="">Selecione o contexto</option>
                {MOTIVO_SUBGRUPO_OPTIONS.renegociacao.map(item => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>
          )}

          {motivoPrincipal && motivoPrincipal !== 'desconto_comercial' && (
            <div className="input-group">
              <label>{'A\u00e7\u00e3o solicitada *'}</label>
              <select className="input" value={motivoAcao} onChange={e => handleMotivoAcaoChange(e.target.value)}>
                <option value="">{'Selecione a a\u00e7\u00e3o'}</option>
                {(MOTIVO_ACAO_OPTIONS[`${motivoPrincipal}_${motivoSubgrupo}`] || MOTIVO_ACAO_OPTIONS[motivoPrincipal] || []).map(item => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>
          )}

          {form.motivo && (
            <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--accent)', background: 'var(--accent-dim)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 3 }}>
                Motivo selecionado
              </div>
              <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>
                {MOTIVO_VALUE_MAP[form.motivo]?.label || form.motivo}
              </div>
            </div>
          )}

          {motivoPrincipal && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearMotivoSelection} style={{ marginTop: 12 }}>
              Limpar motivo
            </button>
          )}
        </div>

        <div className="card" style={{ padding: 16, background: 'var(--bg-2)', borderColor: 'var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 14 }}>
            Justificativa
          </div>

          <div className="input-group" style={{ marginBottom: justificativaTipo ? 14 : 0 }}>
            <label>Justificativa principal *</label>
            <select className="input" value={form.justificativa} onChange={e => handleJustificativaChange(e.target.value)}>
              <option value="">Selecione a justificativa</option>
              {JUSTIFICATIVAS.map(item => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>

          {(justificativaTipo === 'Nova data' || justificativaTipo === 'Nova data e novo valor') && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: justificativaTipo === 'Nova data e novo valor' ? 14 : 0 }}>
              <div className="input-group">
                <label>Nova data 1 *</label>
                <input className="input" type="date" value={form.nova_data} onChange={e => setField('nova_data', e.target.value)} />
              </div>

              <div className="input-group">
                <label>Nova data 2</label>
                <input className="input" type="date" value={form.nova_data_2} onChange={e => setField('nova_data_2', e.target.value)} />
              </div>

              <div className="input-group">
                <label>Nova data 3</label>
                <input className="input" type="date" value={form.nova_data_3} onChange={e => setField('nova_data_3', e.target.value)} />
              </div>
            </div>
          )}

          {(justificativaTipo === 'Novo valor' || justificativaTipo === 'Nova data e novo valor') && (
            <div className="input-group">
              <label>Novo valor *</label>
              <input className="input" type="number" min="0" step="0.01" value={form.novo_valor} onChange={e => setField('novo_valor', e.target.value)} />
            </div>
          )}

          {justificativaTipo && (
            <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--accent)', background: 'var(--accent-dim)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 3 }}>
                Justificativa selecionada
              </div>
              <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>
                {form.justificativa}
              </div>
            </div>
          )}
        </div>

        <div className="input-group">
          <label>Observação</label>
          <textarea className="input" rows={4} value={form.observacao} onChange={e => setField('observacao', e.target.value)} placeholder="Digite observações adicionais..." />
        </div>

        <div className="input-group">
          <label>
            Anexo{' '}
            <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--text-3)' }}>
              (PDF, imagens - max. 10 MB cada)
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
