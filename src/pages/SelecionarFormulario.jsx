import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ArrowLeft, FileText } from 'lucide-react'

// Define quais setores têm acesso a cada formulário
// setores: null = todos, array = apenas esses setores
const FORMULARIOS = [
  {
    id:        'geral',
    titulo:    'Solicitação Geral',
    descricao: 'Solicitação livre para qualquer tipo de autorização interna.',
    rota:      '/nova-solicitacao/geral',
    categoria: 'Geral',
    cor:       '#2563eb',
    setores:   null,
  },
  {
    id:        'renegociacao-venda',
    titulo:    'Autorização de Renegociação de Venda',
    descricao: 'Alteração de boleto, vencimento, exclusão, devolução, abatimento ou desconto comercial.',
    rota:      '/nova-solicitacao/renegociacao-venda',
    categoria: 'Financeiro',
    cor:       '#1A5C38',
    setores:   ['Comercial'],
  },
]

export default function SelecionarFormulario() {
  const navigate = useNavigate()
  const { profile } = useAuth()

  const departamento = profile?.departamento || ''

  const disponiveis = FORMULARIOS.filter(f =>
    f.setores === null || f.setores.includes(departamento)
  )

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }} className="fade-in">

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={15} />
        </button>
        <div>
          <h1 style={{ fontFamily: 'var(--font-body)', fontSize: 22, fontWeight: 700, color: 'var(--green-brand)' }}>
            Nova solicitação
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 2 }}>
            Selecione o tipo de formulário
          </p>
        </div>
      </div>

      {disponiveis.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 52, color: 'var(--text-3)' }}>
          <FileText size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.25 }} />
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Nenhum formulário disponível</div>
          <div style={{ fontSize: 13 }}>Seu departamento não possui formulários cadastrados.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {disponiveis.map(f => (
            <div
              key={f.id}
              className="card"
              onClick={() => navigate(f.rota)}
              style={{ cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.background = 'var(--bg-card-2)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-card)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                  background: f.cor + '22', border: '1px solid ' + f.cor + '44',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <FileText size={20} style={{ color: f.cor }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 3 }}>
                    {f.titulo}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
                    {f.descricao}
                  </div>
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: f.cor,
                  background: f.cor + '18', borderRadius: 4,
                  padding: '3px 8px', flexShrink: 0,
                }}>
                  {f.categoria}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  )
}
