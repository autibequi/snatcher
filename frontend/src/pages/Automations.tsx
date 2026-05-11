import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { PageHeader, Button, Tabs } from '../components/ui'
import { apiClient } from '../lib/apiClient'
import {
  JonfreyCheckTab,
  useJonfreyReview,
  countJonfreyProblems,
} from '../components/automatch/JonfreyCheckTab'
import {
  tableContainer,
  tableRow,
  tableCell,
  tableCellMuted,
  statusChipSuccess,
  statusChipWarning,
  statusChipDanger,
  statusChipMuted,
  pageContainer,
  sectionCard,
} from '../lib/uiTokens'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PendingApprovalRow {
  id: number
  status: string
  composed_by: string
  affiliate_link: string
  channel_id?: number
  channel_name?: string
  product_name?: string
  product_image?: string
  price?: number
  source?: string
  brand?: string
  score?: number
  message_text: string
  created_at: string
}

interface SendQueueRow extends PendingApprovalRow {
  pending_targets: number
}

interface CompletedDispatch {
  id: number
  short_id: string
  product_id?: number
  composed_by: string
  message: Record<string, unknown>
  affiliate_link: string
  status: string
  created_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function ScoreBadge({ score }: { score?: number }) {
  if (score == null) return <span className={statusChipMuted}>—</span>
  const cls =
    score >= 70
      ? statusChipSuccess
      : score >= 50
      ? statusChipWarning
      : statusChipDanger
  return <span className={cls}>score {score.toFixed(0)}</span>
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending_approval: statusChipWarning,
    queued:           statusChipMuted,
    sending:          'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium bg-accent/10 text-accent',
    completed:        statusChipSuccess,
    failed:           statusChipDanger,
    draft:            statusChipMuted,
  }
  const label: Record<string, string> = {
    pending_approval: 'Aguardando',
    queued:           'Na fila',
    sending:          'Enviando',
    completed:        'Enviado',
    failed:           'Falhou',
    draft:            'Rascunho',
  }
  return (
    <span className={map[status] ?? statusChipMuted}>
      {label[status] ?? status}
    </span>
  )
}

// ── Para Enviar tab ───────────────────────────────────────────────────────────

function ParaEnviarTab() {
  const qc = useQueryClient()

  const { data: pending = [], isLoading: loadingPending } = useQuery<PendingApprovalRow[]>({
    queryKey: ['automations', 'pending-approval'],
    queryFn: () =>
      apiClient.get('/api/dispatches/pending-approval').then(r =>
        Array.isArray(r.data) ? r.data : [],
      ),
    refetchInterval: 30_000,
  })

  const { data: queue = [], isLoading: loadingQueue } = useQuery<SendQueueRow[]>({
    queryKey: ['automations', 'send-queue'],
    queryFn: () =>
      apiClient.get('/api/dispatches/send-queue').then(r =>
        Array.isArray(r.data) ? r.data : [],
      ),
    refetchInterval: 30_000,
  })

  const approveMut = useMutation({
    mutationFn: (id: number) => apiClient.post(`/api/dispatches/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['automations'] })
    },
  })

  const rejectMut = useMutation({
    mutationFn: (id: number) => apiClient.post(`/api/dispatches/${id}/reject`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['automations'] })
    },
  })

  const approveAllMut = useMutation({
    mutationFn: () =>
      apiClient.post('/api/dispatches/approve-all').then(r => r.data as { approved: number }),
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['automations'] })
      alert(`${res.approved} disparo(s) aprovado(s).`)
    },
  })

  const runNowMut = useMutation({
    mutationFn: () =>
      apiClient
        .post<{ dispatched: number; errors: string[] }>('/api/auto-match/run-now', {})
        .then(r => r.data),
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['automations'] })
      alert(
        `${res.dispatched} disparo(s) gerado(s) pelo Jonfrey.` +
          (res.errors.length ? `\nErros: ${res.errors.join(', ')}` : ''),
      )
    },
    onError: () => alert('Erro ao disparar ciclo Jonfrey.'),
  })

  const isLoading = loadingPending || loadingQueue
  const total = pending.length + queue.length

  return (
    <div className="space-y-6">
      {/* Pending approval section */}
      {pending.length > 0 && (
        <div className={sectionCard + ' p-0 overflow-hidden'}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-warning/5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-warning">Aguardando aprovacao humana</span>
              <span className="text-xs bg-warning/20 text-warning px-1.5 py-0.5 rounded-full font-mono">
                {pending.length}
              </span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => approveAllMut.mutate()}
              disabled={approveAllMut.isPending}
            >
              Aprovar todos
            </Button>
          </div>
          <div className={tableContainer + ' rounded-none border-0'}>
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-fg-3">Produto</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-fg-3">Canal</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-fg-3">Score</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-fg-3">Gerado em</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-fg-3">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {pending.map(row => (
                  <tr key={row.id} className={tableRow}>
                    <td className={tableCell}>
                      <p className="font-medium truncate max-w-[200px]">
                        {row.product_name || `Dispatch #${row.id}`}
                      </p>
                      {row.message_text && (
                        <p className="text-xs text-fg-3 truncate max-w-[200px] mt-0.5">
                          {row.message_text.slice(0, 60)}…
                        </p>
                      )}
                    </td>
                    <td className={tableCellMuted}>
                      {row.channel_id ? (
                        <Link
                          to={`/channels/${row.channel_id}`}
                          className="hover:text-accent hover:underline"
                        >
                          {row.channel_name || `#${row.channel_id}`}
                        </Link>
                      ) : (
                        row.channel_name ?? '—'
                      )}
                    </td>
                    <td className={tableCell}>
                      <ScoreBadge score={row.score} />
                    </td>
                    <td className={tableCellMuted}>{fmtDate(row.created_at)}</td>
                    <td className={tableCell}>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => approveMut.mutate(row.id)}
                          disabled={approveMut.isPending}
                          className="text-xs px-2.5 py-1 rounded bg-success/10 text-success border border-success/30 hover:bg-success/20 disabled:opacity-50"
                        >
                          Aprovar
                        </button>
                        <button
                          onClick={() => rejectMut.mutate(row.id)}
                          disabled={rejectMut.isPending}
                          className="text-xs px-2.5 py-1 rounded bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20 disabled:opacity-50"
                        >
                          Rejeitar
                        </button>
                        <Link
                          to={`/activity?tab=dispatches&dispatchId=${row.id}`}
                          className="text-xs text-fg-3 hover:text-accent hover:underline ml-1"
                        >
                          Detalhes
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Send queue section */}
      {queue.length > 0 && (
        <div className={sectionCard + ' p-0 overflow-hidden'}>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <span className="text-sm font-medium text-fg">Na fila de envio</span>
            <span className="text-xs bg-surface-2 text-fg-3 px-1.5 py-0.5 rounded-full font-mono">
              {queue.length}
            </span>
          </div>
          <div className={tableContainer + ' rounded-none border-0'}>
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-fg-3">Produto</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-fg-3">Canal</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-fg-3">Score</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-fg-3">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-fg-3">Targets</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-fg-3">Acao</th>
                </tr>
              </thead>
              <tbody>
                {queue.map(row => (
                  <tr key={row.id} className={tableRow}>
                    <td className={tableCell}>
                      <p className="font-medium truncate max-w-[200px]">
                        {row.product_name || `Dispatch #${row.id}`}
                      </p>
                    </td>
                    <td className={tableCellMuted}>
                      {row.channel_id ? (
                        <Link
                          to={`/channels/${row.channel_id}`}
                          className="hover:text-accent hover:underline"
                        >
                          {row.channel_name || `#${row.channel_id}`}
                        </Link>
                      ) : (
                        row.channel_name ?? '—'
                      )}
                    </td>
                    <td className={tableCell}>
                      <ScoreBadge score={row.score} />
                    </td>
                    <td className={tableCell}>
                      <StatusBadge status={row.status} />
                    </td>
                    <td className={tableCellMuted}>{row.pending_targets} grupo(s)</td>
                    <td className={tableCell}>
                      <Link
                        to={`/activity?tab=dispatches&dispatchId=${row.id}`}
                        className="text-xs text-fg-3 hover:text-accent hover:underline"
                      >
                        Detalhes
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && total === 0 && (
        <div className="text-center py-16 space-y-2">
          <p className="text-lg text-fg-2">Nenhum disparo pendente</p>
          <p className="text-sm text-fg-3">
            O Jonfrey nao gerou novos auto-matches ou todos foram aprovados.
          </p>
          <div className="pt-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => runNowMut.mutate()}
              disabled={runNowMut.isPending}
            >
              {runNowMut.isPending ? 'Executando...' : 'Trigger auto-match agora'}
            </Button>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}

// ── Enviados tab ──────────────────────────────────────────────────────────────

function EnviadosTab() {
  const { data: completed = [], isLoading } = useQuery<CompletedDispatch[]>({
    queryKey: ['automations', 'completed'],
    queryFn: () =>
      apiClient
        .get('/api/dispatches?status=completed&offset=0')
        .then(r => (Array.isArray(r.data) ? r.data : [])),
    staleTime: 60_000,
  })

  const { data: failed = [], isLoading: loadingFailed } = useQuery<CompletedDispatch[]>({
    queryKey: ['automations', 'failed'],
    queryFn: () =>
      apiClient
        .get('/api/dispatches?status=failed&offset=0')
        .then(r => (Array.isArray(r.data) ? r.data : [])),
    staleTime: 60_000,
  })

  // Show auto-match sourced only: composed_by = 'auto_match' or 'jonfrey'
  const autoCompleted = completed.filter(
    d => d.composed_by === 'auto_match' || d.composed_by === 'jonfrey',
  )
  const autoFailed = failed.filter(
    d => d.composed_by === 'auto_match' || d.composed_by === 'jonfrey',
  )
  const all = [...autoCompleted, ...autoFailed].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  if (isLoading || loadingFailed) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (all.length === 0) {
    return (
      <div className="text-center py-16 space-y-2">
        <p className="text-lg text-fg-2">Nenhum envio automatico ainda</p>
        <p className="text-sm text-fg-3">
          O historico de disparos gerados pelo Jonfrey aparece aqui.
        </p>
      </div>
    )
  }

  return (
    <div className={tableContainer}>
      <table className="w-full min-w-[640px]">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-fg-3">ID</th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-fg-3">Origem</th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-fg-3">Status</th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-fg-3">Enviado em</th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-fg-3">Acao</th>
          </tr>
        </thead>
        <tbody>
          {all.map(d => {
            const text =
              typeof d.message === 'object' && d.message !== null
                ? String((d.message as Record<string, unknown>).text ?? '')
                : ''
            return (
              <tr key={d.id} className={tableRow}>
                <td className={tableCellMuted}>#{d.id}</td>
                <td className={tableCellMuted}>
                  <span className="text-xs">{d.composed_by}</span>
                </td>
                <td className={tableCell}>
                  <StatusBadge status={d.status} />
                </td>
                <td className={tableCellMuted}>{fmtDate(d.created_at)}</td>
                <td className={tableCell}>
                  <Link
                    to={`/activity?tab=dispatches&dispatchId=${d.id}`}
                    className="text-xs text-fg-3 hover:text-accent hover:underline"
                    title={text || undefined}
                  >
                    Ver detalhes
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type AutoTab = 'para-enviar' | 'enviados' | 'jonfrey-check'

export default function Automations() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<AutoTab>('para-enviar')

  // Pré-busca a revisão do Jonfrey já no mount da página — assim o badge
  // de contagem (problemas) aparece na aba mesmo antes do usuário entrar
  // nela. O hook tem cache de 24h server-side + staleTime longo, então
  // isso só dispara LLM uma vez por dia (ou no force=1 do botão ↻).
  const { data: jonfreyReview } = useJonfreyReview()
  const jonfreyProblemCount = countJonfreyProblems(jonfreyReview)

  const runNowMut = useMutation({
    mutationFn: () =>
      apiClient
        .post<{ dispatched: number; errors: string[] }>('/api/auto-match/run-now', {})
        .then(r => r.data),
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['automations'] })
      alert(
        `${res.dispatched} disparo(s) gerado(s) pelo Jonfrey.` +
          (res.errors.length ? `\nErros: ${res.errors.join(', ')}` : ''),
      )
    },
    onError: () => alert('Erro ao disparar ciclo Jonfrey.'),
  })

  const tabs = [
    { id: 'para-enviar',   label: 'Para enviar' },
    { id: 'enviados',      label: 'Enviados' },
    {
      id: 'jonfrey-check',
      label: 'Jonfrey Check',
      title: 'Revisão semântica do Jonfrey sobre os disparos das últimas 24h',
      badge: jonfreyProblemCount,
    },
  ]

  return (
    <div className={pageContainer + ' flex flex-col gap-4'}>
      <PageHeader
        title="Auto-matches"
        subtitle="Dispatches gerados automaticamente pelo Jonfrey"
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => runNowMut.mutate()}
            disabled={runNowMut.isPending}
          >
            {runNowMut.isPending ? 'Executando...' : 'Trigger auto-match agora'}
          </Button>
        }
      />

      <Tabs
        tabs={tabs}
        active={tab}
        onChange={id => setTab(id as AutoTab)}
      />

      {tab === 'para-enviar'   && <ParaEnviarTab />}
      {tab === 'enviados'      && <EnviadosTab />}
      {tab === 'jonfrey-check' && <JonfreyCheckTab />}
    </div>
  )
}
