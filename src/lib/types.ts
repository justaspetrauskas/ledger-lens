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
}

export interface AssistantPayload {
  answer: string
  citations: CitationDef[]
  chart?: ChartSpec
  action?: ProposedAction
}

export type ChatItem =
  | { role: 'user'; id: string; text: string }
  | ({ role: 'assistant'; id: string; streamedText: string; done: boolean } & AssistantPayload)
