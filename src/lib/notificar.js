import { APPROVER_ROLE } from './workflow'
import { supabase } from './supabase'

const FLOW_EVENTS = {
  CREATED: 'criada',
  SUPERVISOR_APPROVED: 'supervisor_aprovou',
  SUPERVISOR_REJECTED: 'supervisor_rejeitou',
  DIRECTOR_APPROVED: 'diretor_aprovou',
  DIRECTOR_REJECTED: 'diretor_rejeitou',
  TREASURY_APPROVED: 'tesouraria_aprovou',
  TREASURY_REJECTED: 'tesouraria_rejeitou',
}

async function salvarNotificacao(usuarioId, solicitacaoId, mensagem, tipo = 'sistema') {
  await supabase.from('notificacoes').insert({
    usuario_id: usuarioId,
    solicitacao_id: solicitacaoId,
    tipo,
    mensagem,
    lida: false,
  })
}

async function enviarPush(usuarioId, solicitacaoId, mensagem, titulo = 'AutorizaSekita') {
  try {
    await supabase.functions.invoke('send-push', {
      body: {
        user_id: usuarioId,
        title: titulo,
        body: mensagem,
        url: `/solicitacao/${solicitacaoId}`,
      },
    })
  } catch (err) {
    console.warn('Push não enviado:', err)
  }
}

export async function notificar(usuarioId, solicitacaoId, mensagem, tipo = 'sistema', titulo = 'AutorizaSekita') {
  await salvarNotificacao(usuarioId, solicitacaoId, mensagem, tipo)
  await enviarPush(usuarioId, solicitacaoId, mensagem, titulo)
}

export async function notificarLote(userIds, solicitacaoId, mensagem, tipo = 'sistema', titulo = 'AutorizaSekita') {
  const ids = [...new Set((userIds || []).filter(Boolean))]
  for (const userId of ids) {
    await notificar(userId, solicitacaoId, mensagem, tipo, titulo)
  }
}

function getRenegociacaoRecipients(evento, contexto) {
  const {
    solicitanteId,
    supervisorId,
    diretorIds = [],
    tesourariaIds = [],
  } = contexto

  switch (evento) {
    case FLOW_EVENTS.CREATED:
      return [supervisorId]

    case FLOW_EVENTS.SUPERVISOR_APPROVED:
      return [solicitanteId, ...diretorIds]

    case FLOW_EVENTS.SUPERVISOR_REJECTED:
      return [solicitanteId]

    case FLOW_EVENTS.DIRECTOR_APPROVED:
      return [solicitanteId, supervisorId, ...tesourariaIds]

    case FLOW_EVENTS.DIRECTOR_REJECTED:
      return [solicitanteId, supervisorId]

    case FLOW_EVENTS.TREASURY_APPROVED:
      return [solicitanteId, supervisorId, ...diretorIds]

    case FLOW_EVENTS.TREASURY_REJECTED:
      return [solicitanteId, supervisorId, ...diretorIds]

    default:
      return []
  }
}

function getRenegociacaoMensagem(evento, contexto) {
  const { titulo, actorNome } = contexto

  switch (evento) {
    case FLOW_EVENTS.CREATED:
      return {
        tipo: 'aprovacao_pendente',
        mensagem: `A solicitação "${titulo}" aguarda sua aprovação.`,
      }

    case FLOW_EVENTS.SUPERVISOR_APPROVED:
      return {
        tipo: 'fluxo_atualizado',
        mensagem: `A solicitação "${titulo}" foi aprovada pelo supervisor ${actorNome}.`,
      }

    case FLOW_EVENTS.SUPERVISOR_REJECTED:
      return {
        tipo: 'rejeicao',
        mensagem: `A solicitação "${titulo}" foi rejeitada pelo supervisor ${actorNome}.`,
      }

    case FLOW_EVENTS.DIRECTOR_APPROVED:
      return {
        tipo: 'fluxo_atualizado',
        mensagem: `A solicitação "${titulo}" foi aprovada pelo diretor ${actorNome}.`,
      }

    case FLOW_EVENTS.DIRECTOR_REJECTED:
      return {
        tipo: 'rejeicao',
        mensagem: `A solicitação "${titulo}" foi rejeitada pelo diretor ${actorNome}.`,
      }

    case FLOW_EVENTS.TREASURY_APPROVED:
      return {
        tipo: 'autorizacao_tesouraria',
        mensagem: `A solicitação "${titulo}" foi aprovada pela Tesouraria.`,
      }

    case FLOW_EVENTS.TREASURY_REJECTED:
      return {
        tipo: 'rejeicao',
        mensagem: `A solicitação "${titulo}" foi rejeitada pela Tesouraria.`,
      }

    default:
      return {
        tipo: 'sistema',
        mensagem: `Houve uma atualização na solicitação "${titulo}".`,
      }
  }
}

const FORM_NOTIFICATION_RULES = {
  renegociacao_venda: {
    getRecipients: getRenegociacaoRecipients,
    getMessage: getRenegociacaoMensagem,
  },
}

export async function notificarFluxoFormulario(formularioTipo, evento, contexto) {
  const flowRules = FORM_NOTIFICATION_RULES[formularioTipo]
  if (!flowRules) return

  const recipients = flowRules.getRecipients(evento, contexto)
  const userIds = [...new Set((recipients || []).filter(Boolean))]
  if (!userIds.length) return

  const { tipo, mensagem } = flowRules.getMessage(evento, contexto)
  await notificarLote(userIds, contexto.solicitacaoId, mensagem, tipo)
}

export function getNextApproverRole(currentRole) {
  if (currentRole === APPROVER_ROLE.SUPERVISOR) return APPROVER_ROLE.DIRECTOR
  if (currentRole === APPROVER_ROLE.DIRECTOR) return APPROVER_ROLE.TREASURY
  return null
}

export { FLOW_EVENTS }
