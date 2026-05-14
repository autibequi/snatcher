import { useQuery } from '@tanstack/react-query'
import { Skeleton, Tile } from '../ui'
import { apiClient } from '../../lib/apiClient'

export interface UpcomingDispatch {
  id: string
  name: string
  subtitle: string
  scheduled_at: string // ISO-8601
}


// ── ETA formatter — sem date-fns ──────────────────────────────────────────────

/**
 * Retorna string relativa simples como "em 12 min", "em 1h 30min", "amanhã 09:00".
 * Não depende de date-fns.
 */
export function formatRelativeEta(dateInput: string | Date | null | undefined): string {
  if (dateInput == null) return '—'
  const target = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  if (isNaN(target.getTime())) return '—'
  const now = new Date()
  const diffMs = target.getTime() - now.getTime()

  if (diffMs < 0) {
    return 'agora'
  }

  const totalMinutes = Math.round(diffMs / 60_000)

  if (totalMinutes < 1) {
    return 'em instantes'
  }

  if (totalMinutes < 60) {
    return `em ${totalMinutes} min`
  }

  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60

  if (hours < 24) {
    if (mins === 0) return `em ${hours}h`
    return `em ${hours}h ${mins}min`
  }

  // Mais de 24h: mostrar data/hora
  const pad = (n: number) => String(n).padStart(2, '0')
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (
    target.getDate() === tomorrow.getDate() &&
    target.getMonth() === tomorrow.getMonth() &&
    target.getFullYear() === tomorrow.getFullYear()
  ) {
    return `amanhã ${pad(target.getHours())}:${pad(target.getMinutes())}`
  }

  return `${pad(target.getDate())}/${pad(target.getMonth() + 1)} ${pad(target.getHours())}:${pad(target.getMinutes())}`
}

// ── Componente principal ───────────────────────────────────────────────────────

export function UpcomingDispatches() {
  const { data: dispatches = [], isLoading } = useQuery<UpcomingDispatch[]>({
    queryKey: ['dashboard', 'upcoming-dispatches'],
    queryFn: () =>
      apiClient
        .get('/api/dashboard/upcoming-dispatches?limit=5')
        .then(r => (Array.isArray(r.data) ? (r.data as UpcomingDispatch[]) : []))
        .catch(() => []),
    refetchInterval: 60_000,
  })

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <p className="text-sm font-semibold text-fg">Próximos disparos</p>
      </div>

      {isLoading ? (
        <div className="p-4 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : dispatches.length === 0 ? (
        <div className="px-4 py-8 text-sm text-fg-3 text-center">Nenhum disparo agendado.</div>
      ) : (
        <div>
          {dispatches.map((d, idx) => {
            const eta = formatRelativeEta(d.scheduled_at)
            const isImminent = /^em (instantes|\d+ min$|\dh)/.test(eta)
            return (
              <div
                key={d.id}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors ${
                  idx < dispatches.length - 1 ? 'border-b border-border' : ''
                }`}
              >
                <Tile className="bg-accent-soft text-accent">✈</Tile>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-fg truncate">{d.name}</p>
                  <p className="text-[12px] text-fg-3 truncate">{d.subtitle}</p>
                </div>

                <div className={`text-xs tabular-nums flex-shrink-0 ${isImminent ? 'text-accent font-semibold' : 'text-fg-2'}`}>
                  {eta}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
