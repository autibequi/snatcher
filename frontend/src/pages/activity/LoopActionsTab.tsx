import { useQuery } from '@tanstack/react-query'
import { authFetchJSON } from '../../lib/authFetch'

const ALL_LOOPS = [
  'taxonomy_grow', 'scraper_fix', 'template_ab', 'anomaly_pause',
  'affinity_adjust', 'cooldown_suggest', 'cap_suggest', 'auto_tuning', 'content_optimize',
]

const LOOP_LABEL: Record<string, string> = {
  taxonomy_grow: 'Crescimento de taxonomia', scraper_fix: 'Correção de scrapers',
  template_ab: 'Teste A/B de templates', anomaly_pause: 'Pausa por anomalia',
  affinity_adjust: 'Ajuste de afinidade', cooldown_suggest: 'Sugestão de cooldown',
  cap_suggest: 'Sugestão de cap diário', auto_tuning: 'Auto-tuning',
  content_optimize: 'Otimização de conteúdo',
}

interface LoopAction {
  id: number
  loop_name: string
  action_type: string
  target_table: string
  target_id?: number
  reasoning?: string
  evaluation?: string
  applied_at: string
}

function humanize(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `há ${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `há ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

export function LoopActionsTab({ q }: { q?: string }) {
  const { data: actions = [], isLoading } = useQuery<LoopAction[]>({
    queryKey: ['loop-actions-all', 14],
    queryFn: async () => {
      const results = await Promise.all(
        ALL_LOOPS.map(name =>
          authFetchJSON<LoopAction[]>(`/api/admin/loops/${name}/actions?days=14`, [])
            .then(rows => rows.map(r => ({ ...r, loop_name: name })))
        )
      )
      return results.flat().sort(
        (a, b) => new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime()
      )
    },
    staleTime: 60_000,
  })

  const filtered = q
    ? actions.filter(a =>
        a.loop_name.includes(q) ||
        (LOOP_LABEL[a.loop_name] ?? '').toLowerCase().includes(q.toLowerCase()) ||
        a.action_type.includes(q) ||
        a.reasoning?.toLowerCase().includes(q.toLowerCase())
      )
    : actions

  if (isLoading) return <p className="text-fg-3 text-sm py-6">Carregando ações...</p>

  if (filtered.length === 0) {
    return (
      <div className="py-12 text-center text-fg-3 text-sm">
        Nenhuma ação de loop nos últimos 14 dias.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {filtered.map(a => (
        <div key={`${a.loop_name}-${a.id}`} className="bg-surface border border-border rounded-lg px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-xs font-medium text-accent">
              {LOOP_LABEL[a.loop_name] ?? a.loop_name}
            </span>
            <span className="text-[10px] text-fg-3 font-mono">{a.loop_name}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-fg-2 font-mono">{a.action_type}</span>
            {a.target_table && (
              <span className="text-[10px] text-fg-3">→ {a.target_table}{a.target_id ? ` #${a.target_id}` : ''}</span>
            )}
            {a.evaluation && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-success-soft text-success">{a.evaluation}</span>
            )}
            <span className="ml-auto text-[10px] text-fg-4 whitespace-nowrap">{humanize(a.applied_at)}</span>
          </div>
          {a.reasoning && (
            <p className="text-xs text-fg-2 leading-snug">{a.reasoning}</p>
          )}
        </div>
      ))}
    </div>
  )
}
