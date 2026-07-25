import {
  ASSUMED_OPENING_BALANCE,
  cashPosition,
  flaggedForReviewCount,
  fmtDKK,
  fmtDKKCompact,
  fmtMonth,
  latestMonth,
  monthSpend,
  priorMonth,
} from '../lib/ledgerQuery'

// Always-on financial header (cash, latest-month spend, review count) computed from the ledger, with a declared opening-balance assumption and an explicit "as of" month.
export function KpiStrip() {
  const cash = cashPosition()
  const spend = monthSpend(latestMonth)
  const prevSpend = priorMonth ? monthSpend(priorMonth) : 0
  // Month-over-month spend change; for an expense, down is good, so the sign drives the color.
  const deltaPct = prevSpend ? Math.round(((spend - prevSpend) / prevSpend) * 100) : 0
  const down = deltaPct < 0
  const flagged = flaggedForReviewCount()

  return (
    <div className="kpi-strip" aria-label="Key financial indicators">
      <div className="kpi">
        <span className="kpi-label">Cash position</span>
        <span className="kpi-value">{fmtDKKCompact(cash)}</span>
        <span className="kpi-note">assumes {fmtDKK(ASSUMED_OPENING_BALANCE)} opening</span>
      </div>

      <div className="kpi">
        <span className="kpi-label">Spend · {fmtMonth(latestMonth)}</span>
        <span className="kpi-value">{fmtDKKCompact(spend)}</span>
        {deltaPct !== 0 && priorMonth ? (
          <span className={`kpi-delta kpi-delta--${down ? 'good' : 'bad'}`}>
            <span aria-hidden>{down ? '↓' : '↑'}</span> {Math.abs(deltaPct)}% vs {fmtMonth(priorMonth)}
          </span>
        ) : (
          <span className="kpi-note">flat vs {priorMonth ? fmtMonth(priorMonth) : 'prior month'}</span>
        )}
      </div>

      <div className={`kpi${flagged > 0 ? ' kpi--warn' : ''}`}>
        <span className="kpi-label">To review</span>
        <span className="kpi-value">{flagged}</span>
        <span className="kpi-note">{flagged === 1 ? 'flagged item' : 'flagged items'}</span>
      </div>

      <div className="kpi-asof">as of {fmtMonth(latestMonth)}</div>
    </div>
  )
}
