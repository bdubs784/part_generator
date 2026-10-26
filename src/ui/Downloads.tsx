import { useState, type ReactNode } from 'react'
import type { ExportFormat } from '../geometry/service'

interface Props {
  bodies: string[]
  disabled: boolean
  onDownload: (body: string, format: ExportFormat) => Promise<Blob>
  children?: ReactNode
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function Downloads({ bodies, disabled, onDownload, children }: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (bodies.length === 0) return null

  // the file is made in the geometry worker, so the page stays responsive
  const get = (body: string, format: ExportFormat) => {
    setBusy(`${body}.${format}`)
    setError(null)
    onDownload(body, format)
      .then((blob) => save(blob, `${body}.${format}`))
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(null))
  }

  return (
    <div className="downloads">
      {bodies.map((name) => (
        <div key={name} className="download-row">
          <span>{name.replace('_', ' ')}</span>
          {(['step', 'stl'] as const).map((format) => (
            <button key={format} disabled={disabled || busy !== null} onClick={() => get(name, format)}>
              {busy === `${name}.${format}` ? '…' : format.toUpperCase()}
            </button>
          ))}
        </div>
      ))}
      {error && <div className="share-error">{error}</div>}
      {children}
    </div>
  )
}
