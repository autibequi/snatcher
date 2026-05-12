// authFetch — wrapper de fetch que injeta o Bearer token (mesmo storage do apiClient).
// Use nas telas /admin/* que ainda usam fetch() em vez de apiClient (axios).

const ACCESS_KEY = 'snatcher.access_token'

export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = sessionStorage.getItem(ACCESS_KEY)
  const headers = new Headers(init?.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (!headers.has('Content-Type') && init?.body) headers.set('Content-Type', 'application/json')
  return fetch(input, { ...init, headers })
}

/** Lê JSON com defesa contra null/objeto-de-erro/parsing-fail. Retorna fallback em caso de erro. */
export async function authFetchJSON<T>(input: RequestInfo | URL, fallback: T, init?: RequestInit): Promise<T> {
  try {
    const r = await authFetch(input, init)
    if (!r.ok) return fallback
    const data = await r.json().catch(() => null)
    return (data ?? fallback) as T
  } catch {
    return fallback
  }
}
