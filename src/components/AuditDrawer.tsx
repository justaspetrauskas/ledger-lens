import type { AuditEntry } from '../lib/types'

const fmtTime = (t: number) =>
  new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

// The accountability trail: every approve/reject on an AI proposal, newest first. Session-scoped; a real system would persist it server-side.
export function AuditDrawer({
  entries,
  onClose,
}: {
  entries: AuditEntry[]
  onClose: () => void
}) {
  return (
    <aside className="drawer audit-drawer" aria-label="Audit log">
      <div className="drawer-head">
        <div>
          <strong>Decision log</strong>
          <div className="drawer-meta">
            {entries.length} {entries.length === 1 ? 'decision' : 'decisions'} this session
          </div>
        </div>
        <button type="button" className="drawer-close" onClick={onClose} aria-label="Close audit log">
          ✕
        </button>
      </div>

      <div className="audit-body">
        {entries.length === 0 ? (
          <p className="audit-empty">
            No decisions yet. Approvals and rejections are recorded here as you act on the
            assistant's proposals — each with a timestamp and whether you edited the draft first.
          </p>
        ) : (
          <ol className="audit-list">
            {[...entries].reverse().map((e) => (
              <li key={e.id} className={`audit-row audit-row--${e.decision}`}>
                <span className="audit-badge" aria-hidden>
                  {e.decision === 'approved' ? '✓' : '✕'}
                </span>
                <div className="audit-main">
                  <div className="audit-title">{e.title}</div>
                  <div className="audit-tags">
                    <span className={`audit-verdict audit-verdict--${e.decision}`}>
                      {e.decision === 'approved' ? 'Approved' : 'Rejected'}
                    </span>
                    {e.risk === 'elevated' && (
                      <span className="audit-chip audit-chip--elevated">Elevated</span>
                    )}
                    {e.draftEdited && <span className="audit-chip">Draft edited</span>}
                    <span className="audit-time">{fmtTime(e.at)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  )
}
