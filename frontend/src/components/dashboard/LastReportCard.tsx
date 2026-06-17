import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../lib/apiClient'

interface LastReport {
  report_text: string
  source: string // 'cron' | 'manual'
  sent: boolean
  generated_at: string
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// LastReportCard — mostra o último relatório diário de métricas (gerado pelo cron
// à meia-noite ou pelo botão manual) como referência. A query é invalidada pelo
// botão "Gerar relatório" do dashboard, então atualiza na hora.
export function LastReportCard() {
  const { data, isLoading } = useQuery<LastReport | null>({
    queryKey: ['dashboard', 'last-report'],
    queryFn: () =>
      apiClient
        .get('/api/dashboard/last-report')
        .then(r => (r.data ?? null) as LastReport | null)
        .catch(() => null),
    refetchInterval: 60_000,
    retry: 0,
  })

  return (
    <div className="bg-surface border border-border rounded-md p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-base">📊</span>
          <p className="text-sm font-semibold text-fg">Último relatório diário</p>
        </div>
        {data && (
          <span className="text-[10px] text-fg-3">
            {data.source === 'manual' ? 'gerado manualmente' : 'automático'} · {formatWhen(data.generated_at)}
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs text-fg-3 mt-2">Carregando…</p>
      ) : !data ? (
        <p className="text-xs text-fg-3 mt-2">
          Nenhum relatório gerado ainda. O resumo sai automático à meia-noite — ou clique em “Gerar relatório” acima.
        </p>
      ) : (
        <pre className="text-xs text-fg-2 mt-2 whitespace-pre-wrap break-words font-sans leading-relaxed">
          {data.report_text}
        </pre>
      )}
    </div>
  )
}
