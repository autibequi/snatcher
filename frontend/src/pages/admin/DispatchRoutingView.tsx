import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchModemRouting,
  toggleRouting,
  type ModemRoutingRow,
} from '../../lib/api/dispatch'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import {
  pageContainer,
  tblDense,
  thDense,
  thDenseRight,
  tdDense,
  tdDenseRight,
  trDense,
} from '../../lib/uiTokens'
import { mythosEmpty } from '../../lib/copy/mythos'

// formatDate formata uma string ISO em data legível ou retorna '—' se ausente.
function formatDate(iso?: string): string {
  if (!iso) {
    return '—'
  }
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso))
}

// ToggleButton exibe o botão de toggle de afinidade com estado de loading.
function ToggleButton({
  row,
  isLoading,
  onToggle,
}: {
  row: ModemRoutingRow
  isLoading: boolean
  onToggle: (row: ModemRoutingRow) => void
}) {
  return (
    <Button
      variant={row.enabled ? 'danger' : 'primary'}
      size="sm"
      loading={isLoading}
      onClick={() => onToggle(row)}
    >
      {row.enabled ? 'Desativar' : 'Ativar'}
    </Button>
  )
}

// RoutingTable exibe a tabela de entradas modem × domain.
function RoutingTable({
  rows,
  pendingKey,
  onToggle,
}: {
  rows: ModemRoutingRow[]
  pendingKey: string | null
  onToggle: (row: ModemRoutingRow) => void
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className={tblDense}>
        <thead>
          <tr>
            <th className={thDense}>Modem ID</th>
            <th className={thDense}>Domain ID</th>
            <th className={thDense}>Domain</th>
            <th className={thDenseRight}>Affinity</th>
            <th className={thDense}>Status</th>
            <th className={thDense}>Último uso</th>
            <th className={thDense}>Ação</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rowKey = `${row.modem_id}-${row.domain_id}`
            const isPending = pendingKey === rowKey

            return (
              <tr key={rowKey} className={trDense}>
                <td className={`${tdDense} font-mono text-xs`}>{row.modem_id}</td>
                <td className={`${tdDense} font-mono text-xs`}>{row.domain_id}</td>
                <td className={tdDense}>{row.domain_name ?? '—'}</td>
                <td className={tdDenseRight}>{row.affinity_score.toFixed(3)}</td>
                <td className={tdDense}>
                  <Badge variant={row.enabled ? 'success' : 'default'}>
                    {row.enabled ? 'ativo' : 'inativo'}
                  </Badge>
                </td>
                <td className={tdDense}>{formatDate(row.last_used_at)}</td>
                <td className={tdDense}>
                  <ToggleButton row={row} isLoading={isPending} onToggle={onToggle} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// DispatchRoutingView é a tela de gerenciamento de roteamento por modem.
export default function DispatchRoutingView() {
  const [modemFilter, setModemFilter] = useState('')
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const qc = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dispatch', 'routing'],
    queryFn: fetchModemRouting,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ modemID, domainID, enabled }: { modemID: number; domainID: number; enabled: boolean }) =>
      toggleRouting(modemID, domainID, enabled),
    onSettled: () => {
      setPendingKey(null)
      qc.invalidateQueries({ queryKey: ['dispatch', 'routing'] })
    },
  })

  // handleToggle dispara a mutação de toggle de afinidade para um par modem × domain.
  function handleToggle(row: ModemRoutingRow) {
    const key = `${row.modem_id}-${row.domain_id}`
    setPendingKey(key)
    toggleMutation.mutate({
      modemID: row.modem_id,
      domainID: row.domain_id,
      enabled: !row.enabled,
    })
  }

  function renderContent() {
    if (isLoading) {
      return <Skeleton variant="table" rows={8} />
    }

    if (isError) {
      return (
        <EmptyState
          title="Erro ao carregar roteamento"
          description="Não foi possível buscar os dados de roteamento. Verifique o backend."
        />
      )
    }

    const filtered = modemFilter
      ? (data ?? []).filter((row) => String(row.modem_id).includes(modemFilter))
      : (data ?? [])

    if (filtered.length === 0) {
      return (
        <EmptyState
          title="Nenhuma entrada de roteamento encontrada"
          description={mythosEmpty.routing}
        />
      )
    }

    return (
      <RoutingTable rows={filtered} pendingKey={pendingKey} onToggle={handleToggle} />
    )
  }

  return (
    <div className={pageContainer}>
      <PageHeader title="Roteamento por Modem" className="mb-4" />

      {/* Filtro por modem_id */}
      <div className="mb-4">
        <Input
          placeholder="Filtrar por Modem ID..."
          value={modemFilter}
          onChange={(e) => setModemFilter(e.target.value)}
          className="w-56"
        />
      </div>

      {renderContent()}
    </div>
  )
}
