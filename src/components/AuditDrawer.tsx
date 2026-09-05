import type { AuditEntry } from '../lib/types'

const fmtTime = (t: number) =>
  new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

const badge: Record<AuditEntry['decision'], string> = { approved: '✓', rejected: '✕', proposed: '○' }
const verdictLabel: Record<AuditEntry['decision'], string> = {
  approved: 'Approved',
  rejected: 'Rejected',
  proposed: 'Proposed',
}

// The accountability trail: every approve/reject/proposal, newest first. Shared server-side
// across every visitor and surface — see server/audit.ts for what that assumes and its ceiling.
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
            {entries.length} logged — shared across visitors, resets on redeploy
          </div>
        </div>
        <button type="button" className="drawer-close" onClick={onClose} aria-label="Close audit log">
          ✕
        </button>
      </div>

      <div className="audit-body">
        {entries.length === 0 ? (
          <p className="audit-empty">
            Nothing logged yet. Approvals, rejections, and proposals from any surface — including
            an MCP client like Claude Desktop — are recorded here as they happen.
          </p>
        ) : (
          <ol className="audit-list">
            {[...entries].reverse().map((e) => (
              <li key={e.id} className={`audit-row audit-row--${e.decision}`}>
                <span className="audit-badge" aria-hidden>
                  {badge[e.decision]}
                </span>
                <div className="audit-main">
                  <div className="audit-title">{e.title}</div>
                  <div className="audit-tags">
                    <span className={`audit-verdict audit-verdict--${e.decision}`}>
                      {verdictLabel[e.decision]}
                    </span>
                    {e.source === 'mcp' && <span className="audit-chip audit-chip--mcp">MCP</span>}
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
