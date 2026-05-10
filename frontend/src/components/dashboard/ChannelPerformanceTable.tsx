import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Skeleton } from '../ui'
import { apiClient } from '../../lib/apiClient'

export interface ChannelPerf {
  channel_id: string | number
  channel_name: string
  dispatches: number
  ctr: number
  /** Valores diários para sparkline (7 pontos idealmente) */
  daily_dispatches: number[]
}


// ── Sparkline SVG inline — sem dependências externas ──────────────────────────

interface SparklineProps {
  values: number[]
  width?: number
  height?: number
  color?: string
}

function Sparkline({ values, width = 80, height = 28, color = '#6366f1' }: SparklineProps) {
  if (values.length < 2) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const pad = 2
  const innerW = width - pad * 2
  const innerH = height - pad * 2

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * innerW
    const y = pad + innerH - ((v - min) / range) * innerH
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <polyline
        points={points.join(' ')}
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────

export function ChannelPerformanceTable() {
  const navigate = useNavigate()

  const { data: channels = [], isLoading } = useQuery<ChannelPerf[]>({
    queryKey: ['dashboard', 'channel-performance'],
    queryFn: () =>
      apiClient
        .get('/api/dashboard/channel-performance?window=7d')
        .then(r => (Array.isArray(r.data) ? (r.data as ChannelPerf[]) : []))
        .catch(() => []),
    refetchInterval: 120_000,
  })

  return (
    <div className="bg-surface border border-border rounded-md overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <p className="text-sm font-medium text-fg">Performance por canal · 7 dias</p>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="p-4 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium uppercase tracking-wide">
                Canal
              </th>
              <th className="text-right px-4 py-2.5 text-xs text-fg-2 font-medium uppercase tracking-wide">
                Disparos
              </th>
              <th className="text-right px-4 py-2.5 text-xs text-fg-2 font-medium uppercase tracking-wide">
                CTR
              </th>
              <th className="px-4 py-2.5 text-xs text-fg-2 font-medium uppercase tracking-wide">
                Tendência
              </th>
            </tr>
          </thead>
          <tbody>
            {channels.map((c, idx) => (
              <tr
                key={c.channel_id}
                className={`hover:bg-surface-2 cursor-pointer transition-colors ${
                  idx < channels.length - 1 ? 'border-b border-border' : ''
                }`}
                onClick={() => navigate(`/channels/${c.channel_id}`)}
              >
                <td className="px-4 py-2.5 font-medium text-fg">{c.channel_name}</td>
                <td className="px-4 py-2.5 text-right text-fg tabular-nums">{c.dispatches}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  <span
                    className={
                      c.ctr >= 5
                        ? 'text-success font-medium'
                        : c.ctr >= 3
                        ? 'text-fg-2'
                        : 'text-danger'
                    }
                  >
                    {c.ctr.toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <Sparkline values={c.daily_dispatches} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  )
}
