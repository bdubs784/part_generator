// Frontend calls to the Worker. The site works without it (no catalog, no
// share links), so every call can fail without breaking anything else.

import type { BearingInputs } from '../../shared/bearing'

// Set at build time (CI, e2e). Falls back to wrangler dev only in dev mode, so
// a production build without it never pokes at localhost.
const API = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://127.0.0.1:8787' : '')).replace(/\/$/, '')

export const apiConfigured = API !== ''

export interface CatalogBearing {
  designation: string
  bore_mm: number
  od_mm: number
  width_mm: number
  notes: string | null
}

export interface SavedDesign {
  id: string
  part_type: string
  schema_ver: number
  params: unknown // untrusted until parsed
  created_at: string
  downloads: number
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public issues: string[] = [],
  ) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API) throw new ApiError('Saving and the size catalog are not set up on this build', 0)
  const res = await fetch(`${API}${path}`, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status, body.issues)
  return body as T
}

export async function fetchCatalog(): Promise<CatalogBearing[]> {
  const { bearings } = await request<{ bearings: CatalogBearing[] }>('/api/catalog/bearings')
  return bearings
}

export async function saveDesign(inputs: BearingInputs): Promise<{ id: string }> {
  return request('/api/designs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ part_type: 'bearing', params: inputs }),
  })
}

export async function loadDesign(id: string): Promise<SavedDesign> {
  return request(`/api/designs/${encodeURIComponent(id)}`)
}

// Link back to this page with the design id, wherever the page is hosted.
export function shareUrl(id: string): string {
  return `${location.origin}${location.pathname}?d=${id}`
}

export interface GalleryPage {
  designs: SavedDesign[]
  next: string | null
}

export async function listDesigns(before?: string): Promise<GalleryPage> {
  const q = new URLSearchParams({ sort: 'recent', limit: '12' })
  if (before) q.set('before', before)
  return request(`/api/designs?${q}`)
}

// Fire and forget: a missed count isn't worth bothering the user about.
export function recordDownload(id: string): void {
  if (!API) return
  fetch(`${API}/api/designs/${encodeURIComponent(id)}/download`, { method: 'POST' }).catch(() => {})
}
