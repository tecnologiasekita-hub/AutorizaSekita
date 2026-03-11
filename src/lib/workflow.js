export const STATUS = {
  PENDING: 'pendente',
  SUPERVISOR_APPROVED: 'aprovado_supervisor',
  APPROVED: 'aprovado',
  REJECTED: 'rejeitado',
}

export const URGENCY = {
  LOW: 'baixa',
  NORMAL: 'normal',
  HIGH: 'alta',
  CRITICAL: 'critica',
}

export const ROLE_LABELS = {
  solicitante: 'Solicitante',
  supervisor: 'Supervisor',
  diretor: 'Diretor',
}

export const STATUS_META = {
  [STATUS.PENDING]: {
    label: 'Pendente',
    cls: 'badge-pendente',
    dot: 'dot-pendente',
  },
  [STATUS.SUPERVISOR_APPROVED]: {
    label: 'Aguarda Diretor',
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
    label: 'Critica',
    color: 'var(--red)',
    order: 0,
  },
}

export function getStatusMeta(status) {
  return STATUS_META[status] || STATUS_META[STATUS.PENDING]
}

export function isPendingForSupervisor(status) {
  return status === STATUS.PENDING
}

export function isPendingForDirector(status) {
  return [STATUS.PENDING, STATUS.SUPERVISOR_APPROVED].includes(status)
}
