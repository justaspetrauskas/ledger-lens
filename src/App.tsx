import { useCallback, useRef, useState } from 'react'
import { scriptedFallback, scriptedQAs, type ScriptedQA } from './data/scripted'
import { streamText, type TextStreamHandle } from './lib/streamText'
import { Markdown } from './lib/markdown'
import { flaggedForReviewCount } from './lib/ledgerQuery'
import { askLive, type LiveTurn } from './lib/liveClient'
import type { AssistantPayload, ChatItem, CitationDef } from './lib/types'
import { ChartMessage } from './components/ChartMessage'
import { CitationDrawer } from './components/CitationDrawer'
import { ApprovalCard } from './components/ApprovalCard'

type Mode = 'scripted' | 'live'

let nextId = 0
const uid = () => `m${++nextId}`

// Computed once from the static ledger: how many items the assistant would
// proactively flag, and the question that surfaces them.
const reviewCount = flaggedForReviewCount()
const anomalyQa = scriptedQAs.find((qa) => qa.id === 'anomalies')

export default function App() {
  const [mode, setMode] = useState<Mode>('scripted')
  const [apiKey, setApiKey] = useState('')
  const [items, setItems] = useState<ChatItem[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [active, setActive] = useState<{ itemId: string; n: number } | null>(null)
  const streamRef = useRef<TextStreamHandle | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const scrollDown = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    })
  }

  const patchItem = useCallback((id: string, patch: Partial<ChatItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? ({ ...it, ...patch } as ChatItem) : it)))
  }, [])

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

  const askLiveMode = async (question: string) => {
    if (busy || !apiKey) return
    setBusy(true)
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
      const payload = await askLive(apiKey, history, question, {
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
    } catch (err) {
      patchItem(answerId, {
        streamedText: `**Live request failed.** ${err instanceof Error ? err.message : String(err)}`,
        done: true,
      })
    } finally {
      setBusy(false)
      scrollDown()
    }
  }

  const submitFreeText = () => {
    const q = input.trim()
    if (!q) return
    setInput('')
    if (mode === 'live') void askLiveMode(q)
    else askScripted(q, scriptedFallback)
  }

  // Ask a curated question — routes through live or scripted depending on mode.
  const askQa = (qa: ScriptedQA) => {
    if (busy) return
    if (mode === 'live') void askLiveMode(qa.question)
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
              placeholder="Anthropic API key (memory only)"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />
          )}
        </div>
      </header>

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
                  onCitationClick={(n) =>
                    setActive((cur) =>
                      cur?.itemId === it.id && cur.n === n ? null : { itemId: it.id, n },
                    )
                  }
                />
                {!it.done && <span className="cursor" aria-hidden />}
                {it.done && it.chart && <ChartMessage spec={it.chart} />}
                {it.done && it.action && <ApprovalCard action={it.action} />}
                {it.done && it.advisory && (
                  <div className="advisory-note">
                    Analysis, not financial advice — verify against the cited rows.
                  </div>
                )}
              </div>
            ),
          )}

          {mode === 'live' && !apiKey && (
            <div className="hint">
              Live mode calls the Anthropic API directly from your browser with your own key — it
              stays in memory, is sent only to api.anthropic.com, and is gone on reload.
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
