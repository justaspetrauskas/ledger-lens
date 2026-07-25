import { useCallback, useEffect, useRef, useState } from 'react'
import { scriptedFallback, scriptedQAs, type ScriptedQA } from './data/scripted'
import { streamText, type TextStreamHandle } from './lib/streamText'
import { Markdown } from './lib/markdown'
import { flaggedForReviewCount } from './lib/ledgerQuery'
import { askLive, LiveError, type LiveTurn } from './lib/liveClient'
import type { AssistantPayload, AuditEntry, ChatItem, CitationDef, ProposedAction } from './lib/types'
import { ChartMessage } from './components/ChartMessage'
import { CitationDrawer } from './components/CitationDrawer'
import { ApprovalCard } from './components/ApprovalCard'
import { AuditDrawer } from './components/AuditDrawer'
import { KpiStrip } from './components/KpiStrip'

type Mode = 'scripted' | 'live'

let nextId = 0
const uid = () => `m${++nextId}`

// Computed once from the static ledger: how many items the assistant would
// proactively flag, and the question that surfaces them.
const reviewCount = flaggedForReviewCount()
const anomalyQa = scriptedQAs.find((qa) => qa.id === 'anomalies')

// Why live mode fell back to a scripted answer — shown as a small banner.
function fallbackNoteFor(err: unknown): string {
  const reason = err instanceof LiveError ? err.reason : 'network'
  switch (reason) {
    case 'unauthorized':
      return 'That demo code wasn’t recognised — showing the scripted answer instead.'
    case 'exhausted':
      return 'The live demo budget is spent for now — showing the scripted answer instead.'
    case 'unavailable':
      return 'Live mode isn’t configured on this server — showing the scripted answer instead.'
    default:
      return 'Couldn’t reach live mode — showing the scripted answer instead.'
  }
}

export default function App() {
  const [mode, setMode] = useState<Mode>('scripted')
  const [accessCode, setAccessCode] = useState('')
  const [items, setItems] = useState<ChatItem[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [active, setActive] = useState<{ itemId: string; n: number } | null>(null)
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [auditOpen, setAuditOpen] = useState(false)
  const [fallbackNote, setFallbackNote] = useState<string | null>(null)
  const [liveStatus, setLiveStatus] = useState<{ available: boolean; remaining: number } | null>(null)
  const streamRef = useRef<TextStreamHandle | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Ask the proxy whether live mode is usable (key configured, budget left).
  useEffect(() => {
    fetch('/api/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => setLiveStatus(s))
      .catch(() => setLiveStatus({ available: false, remaining: 0 }))
  }, [])

  const scrollDown = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    })
  }

  const patchItem = useCallback((id: string, patch: Partial<ChatItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? ({ ...it, ...patch } as ChatItem) : it)))
  }, [])

  // Record a human decision on a proposed action into the audit trail. Keyed by
  // the message id so each action logs exactly once (decisions are terminal).
  const recordDecision = useCallback(
    (
      id: string,
      action: ProposedAction,
      outcome: { decision: 'approved' | 'rejected'; draftEdited: boolean },
    ) => {
      setAudit((prev) => {
        if (prev.some((e) => e.id === id)) return prev
        return [
          ...prev,
          {
            id,
            at: Date.now(),
            title: action.title,
            risk: action.risk ?? 'standard',
            decision: outcome.decision,
            draftEdited: outcome.draftEdited,
          },
        ]
      })
    },
    [],
  )

  // Open the audit drawer; the two side drawers are mutually exclusive so they
  // never fight for the right rail (or stack on top of each other on mobile).
  const openAudit = () => {
    setActive(null)
    setAuditOpen(true)
  }

  // --- scripted flow ---------------------------------------------------------

  const askScripted = (question: string, payload: AssistantPayload) => {
    if (busy) return
    setBusy(true)
    const answerId = uid()
    setItems((prev) => [
      ...prev,
      { role: 'user', id: uid(), text: question },
      { role: 'assistant', id: answerId, streamedText: '', done: false, ...payload },
    ])
    scrollDown()
    streamRef.current = streamText(payload.answer, (text, done) => {
      patchItem(answerId, { streamedText: text, done })
      if (done) setBusy(false)
      scrollDown()
    })
  }

  // --- live flow -------------------------------------------------------------

  // Ask via the proxy. On any live failure (bad code, spent budget, unreachable),
  // gracefully fall back to the supplied scripted payload so the demo never dead-ends.
  const askLiveMode = async (question: string, fallback: AssistantPayload) => {
    if (busy) return
    setBusy(true)
    setFallbackNote(null)
    const answerId = uid()
    const history: LiveTurn[] = items
      .filter((it) => it.role === 'user' || (it.role === 'assistant' && it.done && it.answer))
      .map((it): LiveTurn => ({
        role: it.role,
        text: it.role === 'user' ? it.text : it.answer,
      }))
    setItems((prev) => [
      ...prev,
      { role: 'user', id: uid(), text: question },
      { role: 'assistant', id: answerId, streamedText: '', done: false, answer: '', citations: [] },
    ])
    scrollDown()
    try {
      const payload = await askLive(accessCode, history, question, {
        onText: (text) => {
          patchItem(answerId, { streamedText: text, answer: text })
          scrollDown()
        },
        onChart: (chart) => patchItem(answerId, { chart }),
        onCitation: (c: CitationDef) =>
          setItems((prev) =>
            prev.map((it) =>
              it.id === answerId && it.role === 'assistant'
                ? { ...it, citations: [...it.citations, c] }
                : it,
            ),
          ),
      })
      patchItem(answerId, { ...payload, streamedText: payload.answer, done: true })
      setBusy(false)
      scrollDown()
    } catch (err) {
      // Reset the in-flight answer to the scripted fallback and stream it.
      setFallbackNote(fallbackNoteFor(err))
      setItems((prev) =>
        prev.map((it) =>
          it.id === answerId && it.role === 'assistant'
            ? { ...it, ...fallback, streamedText: '', done: false }
            : it,
        ),
      )
      scrollDown()
      streamRef.current = streamText(fallback.answer, (text, done) => {
        patchItem(answerId, { streamedText: text, done })
        if (done) setBusy(false)
        scrollDown()
      })
    }
  }

  const submitFreeText = () => {
    const q = input.trim()
    if (!q) return
    setInput('')
    if (mode === 'live') void askLiveMode(q, scriptedFallback)
    else askScripted(q, scriptedFallback)
  }

  // Ask a curated question — routes through live or scripted depending on mode.
  const askQa = (qa: ScriptedQA) => {
    if (busy) return
    if (mode === 'live') void askLiveMode(qa.question, qa.payload)
    else askScripted(qa.question, qa.payload)
  }

  const activeItem = items.find((it) => it.id === active?.itemId)
  const activeCitation =
    activeItem?.role === 'assistant' && active ? activeItem.citations[active.n - 1] : undefined
  const streamingNow = busy && mode === 'scripted'

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>◎</span>
          <div>
            <strong>Ledger Lens</strong>
            <span className="brand-sub">
              Trustworthy AI patterns for financial data — streaming · citations · human-in-the-loop
            </span>
          </div>
        </div>
        <div className="topbar-right">
          <div className="mode">
            <label className={`mode-pill${mode === 'scripted' ? ' mode-pill--on' : ''}`}>
              <input type="radio" checked={mode === 'scripted'} onChange={() => setMode('scripted')} />
              Scripted demo
            </label>
            <label className={`mode-pill${mode === 'live' ? ' mode-pill--on' : ''}`}>
              <input type="radio" checked={mode === 'live'} onChange={() => setMode('live')} />
              Live API
            </label>
            {mode === 'live' && (
              <input
                type="password"
                className="key-input"
                placeholder="Demo access code"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                autoComplete="off"
              />
            )}
          </div>
          <button
            type="button"
            className="audit-toggle"
            onClick={openAudit}
            aria-haspopup="dialog"
          >
            Audit log
            {audit.length > 0 && <span className="audit-toggle-count">{audit.length}</span>}
          </button>
        </div>
      </header>

      <KpiStrip />

      <div className="layout">
        <main className="chat" ref={scrollRef}>
          {items.length === 0 && (
            <div className="empty">
              <h1>Ask the books anything.</h1>
              <p>
                Two and a half years of (fictional) bookkeeping for a Copenhagen coffee roastery —
                ~1,400 ledger rows. Every answer streams in, cites the exact rows behind it, and
                asks before acting.
              </p>
              {reviewCount > 0 && anomalyQa && (
                <button type="button" className="review-banner" onClick={() => askQa(anomalyQa)}>
                  <span className="review-banner-dot" aria-hidden />
                  {reviewCount === 1 ? '1 item needs review' : `${reviewCount} items need review`}
                  <span className="review-banner-cta">Show me →</span>
                </button>
              )}
            </div>
          )}

          {items.map((it) =>
            it.role === 'user' ? (
              <div key={it.id} className="msg msg-user">{it.text}</div>
            ) : (
              <div key={it.id} className="msg msg-assistant">
                <Markdown
                  text={it.streamedText}
                  activeCitation={active?.itemId === it.id ? active.n : null}
                  onCitationClick={(n) => {
                    setAuditOpen(false)
                    setActive((cur) =>
                      cur?.itemId === it.id && cur.n === n ? null : { itemId: it.id, n },
                    )
                  }}
                />
                {!it.done && <span className="cursor" aria-hidden />}
                {it.done && it.chart && <ChartMessage spec={it.chart} />}
                {it.done && it.action && (
                  <ApprovalCard
                    action={it.action}
                    onDecision={(o) => recordDecision(it.id, it.action!, o)}
                  />
                )}
                {it.done && it.advisory && (
                  <div className="advisory-note">
                    Analysis, not financial advice — verify against the cited rows.
                  </div>
                )}
              </div>
            ),
          )}

          {fallbackNote && <div className="hint hint--fallback">{fallbackNote}</div>}

          {mode === 'live' && (
            <div className="hint">
              {liveStatus && !liveStatus.available ? (
                <>
                  Live mode is currently unavailable (budget spent or not configured) — questions
                  will answer from the scripted responses.
                </>
              ) : (
                <>
                  Live mode runs on a funded, budget-capped key (Claude Sonnet, with extended
                  reasoning) behind a server proxy — your key is never involved. Enter the demo
                  access code from the email. When the budget’s spent, it falls back to the
                  scripted answers.
                </>
              )}
            </div>
          )}
        </main>

        {activeCitation && active && (
          <CitationDrawer
            citation={activeCitation}
            index={active.n}
            onClose={() => setActive(null)}
          />
        )}

        {auditOpen && <AuditDrawer entries={audit} onClose={() => setAuditOpen(false)} />}
      </div>

      <footer className="composer">
        <div className="chips">
          {scriptedQAs.map((qa) => (
            <button
              key={qa.id}
              type="button"
              className="chip"
              disabled={busy}
              onClick={() => askQa(qa)}
            >
              {qa.question}
            </button>
          ))}
        </div>
        <div className="input-row">
          <input
            value={input}
            disabled={busy}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitFreeText()}
            placeholder={
              mode === 'live'
                ? 'Ask anything about the books…'
                : 'Free text needs Live mode — or pick a question above'
            }
          />
          {streamingNow ? (
            <button type="button" className="btn" onClick={() => streamRef.current?.stop()}>
              ⏹ Stop
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !input.trim()}
              onClick={submitFreeText}
            >
              {busy ? '…' : 'Ask'}
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}
