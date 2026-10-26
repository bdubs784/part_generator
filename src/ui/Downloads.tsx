import type { Shape3D } from 'replicad'

interface Props {
  shapes: Record<string, Shape3D> | null
  disabled: boolean
}

// Same tolerance the CadQuery script exported STLs with.
const STL_OPTS = { tolerance: 0.01, angularTolerance: 0.1, binary: true }

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function Downloads({ shapes, disabled }: Props) {
  if (!shapes) return null
  return (
    <div className="downloads">
      {Object.entries(shapes).map(([name, shape]) => (
        <div key={name} className="download-row">
          <span>{name.replace('_', ' ')}</span>
          <button disabled={disabled} onClick={() => save(shape.blobSTEP(), `${name}.step`)}>
            STEP
          </button>
          <button disabled={disabled} onClick={() => save(shape.blobSTL(STL_OPTS), `${name}.stl`)}>
            STL
          </button>
        </div>
      ))}
    </div>
  )
}
