import { supabase } from './supabase'

/**
 * Envia notificação interna + push para um usuário
 * @param {string} userId - ID do destinatário
 * @param {string} solicitacaoId - ID da solicitação
 * @param {string} mensagem - Texto da notificação
 * @param {string} titulo - Título do push (opcional)
 */
export async function notificar(userId, solicitacaoId, mensagem, titulo = 'AutorizaSekita') {
  // 1. Salva notificação interna no banco
  await supabase.from('notificacoes').insert({
    usuario_id:     userId,
    solicitacao_id: solicitacaoId,
    mensagem,
    lida: false,
  })

  // 2. Dispara push via Edge Function
  try {
    await supabase.functions.invoke('send-push', {
      body: {
        user_id: userId,
        title:   titulo,
        body:    mensagem,
        url:     `/solicitacao/${solicitacaoId}`,
      }
    })
  } catch (err) {
    // Push falhou mas notificação interna foi salva — não é crítico
    console.warn('Push não enviado:', err)
  }
}
