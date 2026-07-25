import { useState } from 'react'
import type { ProposedAction } from '../lib/types'

type Decision = 'pending' | 'approved' | 'rejected'

/**
 * Human-in-the-loop review: the assistant proposes a side-effectful action;
 * nothing happens until the user explicitly approves. The draft is editable
 * before approval — review means being able to change it, not just rubber-
 * stamp it.
 *
 * Elevated actions (moving money) add a step-up: approving opens a
 * confirmation where the user must re-type the consequential value. Actively
 * re-typing the amount — rather than clicking through a second dialog — is a
 * real friction pattern (GitHub's "type the repo name to delete" style), and
 * it scales the ceremony to the stakes.
 */
export function ApprovalCard({ action }: { action: ProposedAction }) {
  const [decision, setDecision] = useState<Decision>('pending')
  const [draft, setDraft] = useState(action.draft)
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')

  const elevated = action.risk === 'elevated'
  const confirmMatches = typed.trim() === action.confirmValue

  const approve = () => {
    if (elevated && !confirming) {
      setConfirming(true)
      return
    }
    if (elevated && !confirmMatches) return
    setDecision('approved')
  }

  return (
    <div className={`approval approval--${decision}${elevated ? ' approval--elevated' : ''}`}>
      <div className="approval-head">
        <span className="approval-icon" aria-hidden>
          {decision === 'approved' ? '✓' : decision === 'rejected' ? '✕' : '⏸'}
        </span>
        <div>
          <div className="approval-title-row">
            <strong>{action.title}</strong>
            {elevated && decision === 'pending' && (
              <span className="approval-risk">Elevated · moves money</span>
            )}
          </div>
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
        confirming ? (
          <div className="approval-stepup">
            <label className="approval-stepup-label" htmlFor="approval-confirm">
              This authorizes a real payment. Type <code>{action.confirmValue}</code> to confirm.
            </label>
            <div className="approval-actions">
              <input
                id="approval-confirm"
                className="approval-stepup-input"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={action.confirmValue}
                autoComplete="off"
                autoFocus
              />
              <button
                type="button"
                className="btn btn-primary"
                disabled={!confirmMatches}
                onClick={approve}
              >
                Authorize payment
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setConfirming(false)
                  setTyped('')
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="approval-actions">
            <button type="button" className="btn btn-primary" onClick={approve}>
              {elevated ? 'Approve payment' : 'Approve'}
            </button>
            <button type="button" className="btn" onClick={() => setEditing((e) => !e)}>
              {editing ? 'Done editing' : 'Edit draft'}
            </button>
            <button type="button" className="btn btn-danger" onClick={() => setDecision('rejected')}>
              Reject
            </button>
          </div>
        )
      ) : (
        <div className="approval-verdict">
          {decision === 'approved'
            ? elevated
              ? 'Authorized — payment queued. (Demo: no money actually moves.)'
              : 'Approved — queued for sending. (Demo: nothing is actually sent.)'
            : 'Rejected — no action taken.'}
        </div>
      )}
    </div>
  )
}
