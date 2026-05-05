import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '../ui'
import { apiClient } from '../../lib/apiClient'

export interface UpcomingDispatch {
  id: string
  name: string
  subtitle: string
  scheduled_at: string // ISO-8601
}

const MOCK_UPCOMING: UpcomingDispatch[] = [
  {
    id: 'disp-suplementos',
    name: 'Suplementos',
    subtitle: '4 grupos · 1 produto destaque',
    scheduled_at: new Date(Date.now() + 12 * 60 * 1000).toISOString(),
  },
  {
    id: 'disp-eletronicos',
    name: 'Eletrônicos',
    subtitle: '2 grupos · digest top 5',
    scheduled_at: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
  },
  {
    id: 'disp-casa',
    name: 'Casa & Cozinha',
    subtitle: '1 grupo · 3 produtos',
    scheduled_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
  },
]

// ── ETA formatter — sem date-fns ──────────────────────────────────────────────

/**
 * Retorna string relativa simples como "em 12 min", "em 1h 30min", "amanhã 09:00".
 * Não depende de date-fns.
 */
export function formatRelativeEta(dateInput: string | Date): string {
  const target = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
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
        .then(r => (Array.isArray(r.data) ? (r.data as UpcomingDispatch[]) : MOCK_UPCOMING))
        .catch(() => MOCK_UPCOMING),
    refetchInterval: 60_000,
  })

  return (
    <div className="bg-surface border border-border rounded-md overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <p className="text-sm font-medium text-fg">Próximos disparos agendados</p>
      </div>

      {/* Body */}
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
          {dispatches.map((d, idx) => (
            <div
              key={d.id}
              className={`flex items-center gap-3.5 px-4 py-3.5 ${
                idx < dispatches.length - 1 ? 'border-b border-border' : ''
              }`}
            >
              {/* Ícone ✈ */}
              <div className="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center text-base bg-accent/10 text-accent">
                ✈
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-fg truncate">{d.name}</p>
                <p className="text-xs text-fg-3 truncate">{d.subtitle}</p>
              </div>

              {/* ETA */}
              <div className="text-xs text-fg-2 tabular-nums flex-shrink-0">
                {formatRelativeEta(d.scheduled_at)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
