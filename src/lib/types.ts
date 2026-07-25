import type { LedgerFilter } from './ledgerQuery'

export interface ChartSpec {
  type: 'line' | 'bar' | 'donut'
  title: string
  /** x-axis labels (months, categories, …) or donut slice labels */
  labels: string[]
  series: { name: string; data: number[] }[]
}

/** A citation resolves to actual ledger rows, shown in the source drawer. */
export interface CitationDef {
  label: string
  filter?: LedgerFilter
  /** Explicit row ids (takes precedence over filter when set). */
  entryIds?: string[]
}

export interface ProposedAction {
  title: string
  description: string
  draft: string
  /** 'elevated' (moves money) needs a step-up confirmation; 'standard' (default) approves in one click. */
  risk?: 'standard' | 'elevated'
  /** For elevated actions: the exact string the user must re-type to authorize. */
  confirmValue?: string
}

export interface AssistantPayload {
  answer: string
  citations: CitationDef[]
  chart?: ChartSpec
  action?: ProposedAction
  /** Interpretive answer (analysis, not a plain lookup) — renders a quiet "not financial advice" footer. */
  advisory?: boolean
}

export type ChatItem =
  | { role: 'user'; id: string; text: string }
  | ({ role: 'assistant'; id: string; streamedText: string; done: boolean } & AssistantPayload)

// One recorded human decision on a proposed action (what, when, whether the draft was edited).
export interface AuditEntry {
  /** The assistant message id that carried the action (one action per message). */
  id: string
  /** Wall-clock time the decision was made. */
  at: number
  title: string
  risk: 'standard' | 'elevated'
  decision: 'approved' | 'rejected'
  /** True if the human changed the AI's draft before deciding. */
  draftEdited: boolean
}
