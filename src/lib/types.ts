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
  /**
   * Risk tier. 'elevated' actions (moving money) require a step-up
   * confirmation before they can be approved; 'standard' (the default,
   * e.g. sending an email) approves in one click.
   */
  risk?: 'standard' | 'elevated'
  /** For elevated actions: the exact string the user must re-type to authorize. */
  confirmValue?: string
}

export interface AssistantPayload {
  answer: string
  citations: CitationDef[]
  chart?: ChartSpec
  action?: ProposedAction
  /**
   * Marks an interpretive answer (analysis, recommendation) rather than a
   * plain factual lookup — renders a quiet "not financial advice" footer.
   */
  advisory?: boolean
}

export type ChatItem =
  | { role: 'user'; id: string; text: string }
  | ({ role: 'assistant'; id: string; streamedText: string; done: boolean } & AssistantPayload)
