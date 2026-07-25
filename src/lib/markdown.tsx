import type { ReactNode } from 'react'

/**
 * Minimal markdown renderer for the scripted-answer subset:
 * paragraphs, unordered lists, **bold**, and [n] citation markers.
 *
 * Hand-rolled on purpose: it stays correct on *partial* input while text
 * is still streaming (an unclosed ** or a half-written list item must
 * never break the layout), which is the hard part of chat UIs that
 * generic markdown libraries don't always handle gracefully.
 */

interface RenderOptions {
  onCitationClick?: (index: number) => void
  activeCitation?: number | null
}

function renderInline(
  text: string,
  keyPrefix: string,
  { onCitationClick, activeCitation }: RenderOptions,
): ReactNode[] {
  const nodes: ReactNode[] = []
  // Split on **bold** spans and [n] citation markers in one pass.
  const re = /\*\*(.+?)\*\*|\[(\d+)\]/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[1] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-b${k++}`}>{m[1]}</strong>)
    } else if (m[2] !== undefined) {
      const n = parseInt(m[2], 10)
      nodes.push(
        <button
          key={`${keyPrefix}-c${k++}`}
          type="button"
          className={`citation${activeCitation === n ? ' citation--active' : ''}`}
          onClick={() => onCitationClick?.(n)}
          aria-label={`Show source ${n}`}
        >
          {n}
        </button>,
      )
    }
    last = re.lastIndex
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export function Markdown({
  text,
  onCitationClick,
  activeCitation,
}: { text: string } & RenderOptions) {
  const opts = { onCitationClick, activeCitation }
  const blocks = text.split(/\n\n+/)

  return (
    <>
      {blocks.map((block, bi) => {
        const lines = block.split('\n')
        const isList = lines.every((l) => l.trim() === '' || l.startsWith('- '))
        if (isList && lines.some((l) => l.startsWith('- '))) {
          return (
            <ul key={bi}>
              {lines
                .filter((l) => l.startsWith('- '))
                .map((l, li) => (
                  <li key={li}>{renderInline(l.slice(2), `${bi}-${li}`, opts)}</li>
                ))}
            </ul>
          )
        }
        return <p key={bi}>{renderInline(block, `${bi}`, opts)}</p>
      })}
    </>
  )
}
