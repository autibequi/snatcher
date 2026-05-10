/** Rótulo PT-BR para `dispatches.composed_by` (Logs, Auto disparos, export CSV). */
export function dispatchOriginLabel(composedBy?: string): string {
  const v = (composedBy ?? '').trim()
  if (!v) return '—'
  const map: Record<string, string> = {
    'auto-match': 'Auto-match',
    auto: 'Auto (legado)',
    manual: 'Manual',
    api: 'API',
    'scheduled-ad': 'Anúncio agendado',
  }
  return map[v] ?? v
}
