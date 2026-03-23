export const STATUS = {
  PENDING: 'pendente',
  IN_APPROVAL: 'em_aprovacao',
  APPROVED: 'aprovado',
  REJECTED: 'rejeitado',
  CANCELED: 'cancelado',
}

export const APPROVER_STATUS = {
  PENDING: 'pendente',
  APPROVED: 'aprovado',
  REJECTED: 'rejeitado',
  CANCELED: 'cancelado',
}

export const APPROVER_ROLE = {
  SUPERVISOR: 'supervisor',
  DIRECTOR: 'diretor',
  TREASURY: 'tesouraria',
  APPROVER: 'aprovador',
}

export const ROLE_LABELS = {
  solicitante: 'SOLICITANTE',
  supervisor: 'SUPERVISOR',
  diretor: 'DIRETOR',
}

export const STATUS_META = {
  [STATUS.PENDING]: {
    label: 'Pendente',
    cls: 'badge-pendente',
    dot: 'dot-pendente',
  },
  [STATUS.IN_APPROVAL]: {
    label: 'Em aprovação',
    cls: 'badge-supervisor',
    dot: 'dot-supervisor',
  },
  [STATUS.APPROVED]: {
    label: 'Aprovado',
    cls: 'badge-aprovado',
    dot: 'dot-aprovado',
  },
  [STATUS.REJECTED]: {
    label: 'Rejeitado',
    cls: 'badge-rejeitado',
    dot: 'dot-rejeitado',
  },
  [STATUS.CANCELED]: {
    label: 'Cancelado',
    cls: 'badge-rejeitado',
    dot: 'dot-rejeitado',
  },
}

export function getStatusMeta(status) {
  return STATUS_META[status] || STATUS_META[STATUS.PENDING]
}

export function normalizeFormData(dados) {
  if (!dados) return {}
  if (typeof dados === 'string') {
    try {
      return JSON.parse(dados)
    } catch {
      return {}
    }
  }
  return dados
}

export function getRequestValue(item) {
  const dados = normalizeFormData(item?.dados_formulario)
  const value = dados?.valor
  return value === undefined || value === null || value === '' ? null : Number(value)
}

export function getRequestSetor(item) {
  const dados = normalizeFormData(item?.dados_formulario)
  return (
    dados?.setor_origem ||
    dados?.departamento_origem ||
    dados?.setor ||
    dados?.origem ||
    item?.setor_origem ||
    null
  )
}

export function getRequestRequiresTreasury(item) {
  const dados = normalizeFormData(item?.dados_formulario)
  return Boolean(dados?.requer_tesouraria)
}

export function isFinishedStatus(status) {
  return [STATUS.APPROVED, STATUS.REJECTED, STATUS.CANCELED].includes(status)
}

export function isPendingStatus(status) {
  return [STATUS.PENDING, STATUS.IN_APPROVAL].includes(status)
}

export function getApproverRoleLabel(role) {
  switch (role) {
    case APPROVER_ROLE.SUPERVISOR:
      return 'supervisor'
    case APPROVER_ROLE.DIRECTOR:
      return 'diretor'
    case APPROVER_ROLE.TREASURY:
      return 'tesouraria'
    default:
      return 'aprovador'
  }
}

export function getCurrentPendingOrder(aprovadores) {
  const ordens = (aprovadores || [])
    .filter(item => item.status === APPROVER_STATUS.PENDING)
    .map(item => item.ordem)
    .filter(value => value !== undefined && value !== null)

  if (!ordens.length) return null
  return Math.min(...ordens)
}

export function getCurrentPendingApprovers(aprovadores) {
  const ordemAtual = getCurrentPendingOrder(aprovadores)
  if (ordemAtual == null) return []
  return (aprovadores || []).filter(item => item.status === APPROVER_STATUS.PENDING && item.ordem === ordemAtual)
}

export function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}
