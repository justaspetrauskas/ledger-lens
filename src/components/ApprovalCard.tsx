import { useId, useState } from 'react'
import type { ProposedAction } from '../lib/types'

type Decision = 'pending' | 'approved' | 'rejected'

// Human-in-the-loop review: nothing happens until approved; draft is editable; elevated actions require re-typing the value; the decision is lifted out via onDecision for the audit log.
export function ApprovalCard({
  action,
  onDecision,
}: {
  action: ProposedAction
  onDecision?: (outcome: { decision: 'approved' | 'rejected'; draftEdited: boolean }) => void
}) {
  const [decision, setDecision] = useState<Decision>('pending')
  const [draft, setDraft] = useState(action.draft)
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')
  const confirmId = useId()

  const elevated = action.risk === 'elevated'
  const confirmMatches = typed.trim() === action.confirmValue

  // Did the human alter the draft? Compared at decision time, so edit-then-revert reads as "not edited".
  const draftEdited = () => draft.trim() !== action.draft.trim()

  const approve = () => {
    if (elevated && !confirming) {
      setConfirming(true)
      return
    }
    if (elevated && !confirmMatches) return
    setDecision('approved')
    onDecision?.({ decision: 'approved', draftEdited: draftEdited() })
  }

  const reject = () => {
    setDecision('rejected')
    onDecision?.({ decision: 'rejected', draftEdited: draftEdited() })
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
            <label className="approval-stepup-label" htmlFor={confirmId}>
              This authorizes a real payment. Type <code>{action.confirmValue}</code> to confirm.
            </label>
            <div className="approval-actions">
              <input
                id={confirmId}
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
            <button type="button" className="btn btn-danger" onClick={reject}>
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
