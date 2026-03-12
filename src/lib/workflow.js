export const STATUS = {
  PENDING:             'pendente',
  SUPERVISOR_APPROVED: 'aprovado_supervisor',
  PARTIAL:             'aprovado_parcial',
  APPROVED:            'aprovado',
  REJECTED:            'rejeitado',
}

export const URGENCY = {
  LOW:      'baixa',
  NORMAL:   'normal',
  HIGH:     'alta',
  CRITICAL: 'critica',
}

export const ROLE_LABELS = {
  solicitante: 'Solicitante',
  supervisor:  'Supervisor',
  diretor:     'Diretor',
}

export const STATUS_META = {
  [STATUS.PENDING]: {
    label: 'Pendente',
    cls:   'badge-pendente',
    dot:   'dot-pendente',
  },
  [STATUS.SUPERVISOR_APPROVED]: {
    label: 'Aguarda Diretor',
    cls:   'badge-supervisor',
    dot:   'dot-supervisor',
  },
  [STATUS.PARTIAL]: {
    label: 'Aprovação Parcial',
    cls:   'badge-supervisor',
    dot:   'dot-supervisor',
  },
  [STATUS.APPROVED]: {
    label: 'Aprovado',
    cls:   'badge-aprovado',
    dot:   'dot-aprovado',
  },
  [STATUS.REJECTED]: {
    label: 'Rejeitado',
    cls:   'badge-rejeitado',
    dot:   'dot-rejeitado',
  },
}

export const URGENCY_META = {
  [URGENCY.LOW]: {
    label: 'Baixa',
    color: 'var(--text-3)',
    order: 3,
  },
  [URGENCY.NORMAL]: {
    label: 'Normal',
    color: 'var(--blue)',
    order: 2,
  },
  [URGENCY.HIGH]: {
    label: 'Alta',
    color: 'var(--yellow)',
    order: 1,
  },
  [URGENCY.CRITICAL]: {
    label: 'Crítica',
    color: 'var(--red)',
    order: 0,
  },
}

export function getStatusMeta(status) {
  return STATUS_META[status] || STATUS_META[STATUS.PENDING]
}

// Supervisor vê solicitações com status pendente
export function isPendingForSupervisor(status) {
  return status === STATUS.PENDING
}

// Diretor vê solicitações que já passaram pelo supervisor (ou pularam)
export function isPendingForDirector(status) {
  return status === STATUS.SUPERVISOR_APPROVED || status === STATUS.PARTIAL
}

// Calcula novo status após um diretor aprovar
// diretores: array de { status } de solicitacao_diretores
export function calcStatusAfterDirectorApprove(diretores) {
  const total     = diretores.length
  const aprovados = diretores.filter(d => d.status === 'aprovado').length
  if (aprovados === total) return STATUS.APPROVED
  return STATUS.PARTIAL
}

export function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024)       return `${bytes} B`
  if (bytes < 1048576)    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}
