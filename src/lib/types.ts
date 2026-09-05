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

interface ProposedActionBase {
  title: string
  description: string
  draft: string
}

/**
 * Discriminated on `risk` so an elevated (money-moving) action cannot exist
 * without the confirmation value ApprovalCard's step-up requires.
 */
export type ProposedAction =
  | (ProposedActionBase & {
      /** 'standard' (default) approves in one click; no confirmation value. */
      risk?: 'standard'
      confirmValue?: never
    })
  | (ProposedActionBase & {
      /** 'elevated' (moves money) needs a step-up confirmation. */
      risk: 'elevated'
      /** The exact (non-empty) string the user must re-type to authorize. */
      confirmValue: string
    })

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

// One recorded decision (or pending proposal) on an action. Server-side, shared across
// every visitor and surface — see server/audit.ts for the storage ceiling this assumes.
export interface AuditEntry {
  /** The assistant message id that carried the action (one action per message). */
  id: string
  /** Wall-clock time the entry was recorded (server clock). */
  at: number
  title: string
  risk: 'standard' | 'elevated'
  /** 'proposed' = an MCP client proposed this; no human has acted on it here. */
  decision: 'approved' | 'rejected' | 'proposed'
  /** True if the human changed the AI's draft before deciding. Meaningless for 'proposed'. */
  draftEdited?: boolean
  /** Which surface produced this entry. */
  source: 'web' | 'mcp'
}
