import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Skeleton, Sparkline } from '../ui'
import { apiClient } from '../../lib/apiClient'
import { tblDense, thDense, thDenseRight, tdDense, tdDenseRight, trDense } from '../../lib/uiTokens'

export interface ChannelPerf {
  channel_id: string | number
  channel_name: string
  dispatches: number
  ctr: number
  clicks?: number
  /** Valores diários para sparkline (7 pontos idealmente) */
  daily_dispatches: number[]
}

// CTR thresholds — spec v4:
//   ≥3% verde · ≥2% padrão · <2% âmbar
function ctrTone(ctr: number): string {
  if (ctr >= 3) return 'text-success font-semibold'
  if (ctr >= 2) return 'text-fg-2'
  return 'text-warning font-medium'
}

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
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <p className="text-sm font-semibold text-fg">Performance por canal · 7D</p>
      </div>

      {isLoading ? (
        <div className="p-4 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : channels.length === 0 ? (
        <div className="px-4 py-8 text-center text-fg-3 text-sm">
          Sem dados de performance no período.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className={`${tblDense} min-w-[520px]`}>
            <thead>
              <tr>
                <th className={thDense}>Canal</th>
                <th className={thDenseRight}>Disparos</th>
                <th className={thDenseRight}>CTR</th>
                <th className={thDenseRight}>Cliques</th>
                <th className={`${thDense} w-[110px]`}>Tendência</th>
              </tr>
            </thead>
            <tbody>
              {channels.map(c => (
                <tr
                  key={c.channel_id}
                  className={`${trDense} cursor-pointer`}
                  onClick={() => navigate(`/channels/${c.channel_id}`)}
                >
                  <td className={`${tdDense} font-medium text-fg`}>{c.channel_name}</td>
                  <td className={tdDenseRight}>{c.dispatches.toLocaleString('pt-BR')}</td>
                  <td className={tdDenseRight}>
                    <span className={ctrTone(c.ctr)}>{c.ctr.toFixed(1)}%</span>
                  </td>
                  <td className={tdDenseRight}>
                    {c.clicks !== undefined ? c.clicks.toLocaleString('pt-BR') : '—'}
                  </td>
                  <td className={tdDense}>
                    <Sparkline values={c.daily_dispatches.slice(-8)} />
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
