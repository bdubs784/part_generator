import { useEffect, useState } from 'react'
import { BALL_SIZES, migrateInputs, resolveBearing, type BearingInputs } from '../../shared/bearing'
import { parseBearingInputs } from '../../shared/validate'
import { listDesigns, type SavedDesign } from '../api/client'
import { BearingThumb } from './BearingThumb'

interface Props {
  onOpen: (id: string, inputs: BearingInputs) => void
  onClose: () => void
}

interface Card {
  design: SavedDesign
  inputs: BearingInputs
}

function ago(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}

// Saved designs from older schema versions are upgraded; anything that still
// can't be read is skipped rather than breaking the page.
function toCards(designs: SavedDesign[]): Card[] {
  return designs.flatMap((design) => {
    const inputs = parseBearingInputs(migrateInputs(design.schema_ver, design.params))
    return inputs ? [{ design, inputs }] : []
  })
}

export function Gallery({ onOpen, onClose }: Props) {
  const [cards, setCards] = useState<Card[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    listDesigns().then(
      (page) => {
        setCards(toCards(page.designs))
        setNext(page.next)
        setState('ready')
      },
      () => setState('error'),
    )
  }, [])

  const more = () => {
    if (!next) return
    listDesigns(next).then((page) => {
      setCards((c) => [...c, ...toCards(page.designs)])
      setNext(page.next)
    })
  }

  return (
    <div className="gallery-backdrop" onClick={onClose}>
      <section className="gallery" role="dialog" aria-label="Gallery" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Recent designs</h2>
          <button onClick={onClose} aria-label="Close gallery">
            ✕
          </button>
        </header>
        {state === 'loading' && <p className="hint">Loading…</p>}
        {state === 'error' && <p className="hint">Couldn't load the gallery.</p>}
        {state === 'ready' && cards.length === 0 && <p className="hint">Nothing shared yet. Make a share link to add one.</p>}
        <ul className="cards">
          {cards.map(({ design, inputs }) => {
            const p = resolveBearing(inputs)
            const ball = BALL_SIZES.find((b) => b.value === p.ball_d)?.label ?? `${p.ball_d} mm`
            return (
              <li key={design.id}>
                <button className="card" onClick={() => onOpen(design.id, inputs)} data-testid={`card-${design.id}`}>
                  <BearingThumb p={p} />
                  <span className="card-title">
                    Ø{p.od} × Ø{p.bore} × {p.width}
                  </span>
                  <span className="card-sub">
                    {p.ball_n} × {ball} balls
                  </span>
                  <span className="card-sub">
                    {design.downloads} download{design.downloads === 1 ? '' : 's'} · {ago(design.created_at)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        {next && (
          <button className="more" onClick={more}>
            Load more
          </button>
        )}
      </section>
    </div>
  )
}
