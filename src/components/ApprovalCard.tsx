import { useState } from 'react'
import type { ProposedAction } from '../lib/types'

type Decision = 'pending' | 'approved' | 'rejected'

/**
 * Human-in-the-loop review: the assistant proposes a side-effectful action;
 * nothing happens until the user explicitly approves. The draft is editable
 * before approval — review means being able to change it, not just rubber-
 * stamp it.
 */
export function ApprovalCard({ action }: { action: ProposedAction }) {
  const [decision, setDecision] = useState<Decision>('pending')
  const [draft, setDraft] = useState(action.draft)
  const [editing, setEditing] = useState(false)

  return (
    <div className={`approval approval--${decision}`}>
      <div className="approval-head">
        <span className="approval-icon" aria-hidden>
          {decision === 'approved' ? '✓' : decision === 'rejected' ? '✕' : '⏸'}
        </span>
        <div>
          <strong>{action.title}</strong>
          <div className="approval-desc">{action.description}</div>
        </div>
      </div>

      {editing ? (
        <textarea
          className="approval-draft-edit"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={10}
        />
      ) : (
        <pre className="approval-draft">{draft}</pre>
      )}

      {decision === 'pending' ? (
        <div className="approval-actions">
          <button type="button" className="btn btn-primary" onClick={() => setDecision('approved')}>
            Approve
          </button>
          <button type="button" className="btn" onClick={() => setEditing((e) => !e)}>
            {editing ? 'Done editing' : 'Edit draft'}
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setDecision('rejected')}>
            Reject
          </button>
        </div>
      ) : (
        <div className="approval-verdict">
          {decision === 'approved'
            ? 'Approved — queued for sending. (Demo: nothing is actually sent.)'
            : 'Rejected — no action taken.'}
        </div>
      )}
    </div>
  )
}
