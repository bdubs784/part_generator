import { useState } from 'react'

export type ShareState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'done'; link: string }
  | { status: 'error'; message: string }

interface Props {
  state: ShareState
  disabled: boolean
  onShare: () => void
}

export function Share({ state, disabled, onShare }: Props) {
  const [copied, setCopied] = useState(false)

  if (state.status === 'done') {
    return (
      <div className="share">
        <input readOnly value={state.link} aria-label="Share link" onFocus={(e) => e.target.select()} />
        <button
          onClick={() => {
            navigator.clipboard.writeText(state.link).then(() => setCopied(true))
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    )
  }

  return (
    <div className="share">
      <button onClick={onShare} disabled={disabled || state.status === 'saving'}>
        {state.status === 'saving' ? 'Saving…' : 'Share link'}
      </button>
      {state.status === 'error' && <span className="share-error">{state.message}</span>}
    </div>
  )
}
