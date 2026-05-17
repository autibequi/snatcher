import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchBanditState,
  resetBanditState,
  type BanditArm,
} from '../../lib/api/bandit'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { Modal } from '../../components/ui/Modal'
import {
  pageContainer,
  sectionCard,
  tblDense,
  thDense,
  thDenseRight,
  tdDense,
  tdDenseRight,
  trDense,
} from '../../lib/uiTokens'
import { authFetchJSON } from '../../lib/authFetch'
import { mythosEmpty, mythosTooltip } from '../../lib/copy/mythos'

// Channel é a interface mínima necessária para popular o seletor de canal.
interface Channel {
  id: number
  name: string
}

// fetchChannels busca a lista de canais disponíveis para o seletor.
async function fetchChannels(): Promise<Channel[]> {
  return authFetchJSON<Channel[]>('/api/channels', [])
}

// avgRewardColor retorna a classe de cor conforme a média de reward.
function avgRewardColor(avg: number): string {
  if (avg >= 0.7) {
    return 'text-success font-semibold'
  }
  if (avg >= 0.4) {
    return 'text-warning font-semibold'
  }
  return 'text-danger'
}

// ArmsTable exibe os arms UCB1 com pulls, rewards e pesos.
function ArmsTable({ arms }: { arms: BanditArm[] }) {
  const rows = arms ?? []
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nenhum arm registrado"
        description="O estado UCB1 existe mas não há arms ainda."
      />
    )
  }

  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className={tblDense}>
        <thead>
          <tr>
            <th className={thDense}>Arm ID</th>
            <th className={thDenseRight}>Discount</th>
            <th className={thDenseRight}>Freshness</th>
            <th className={thDenseRight}>Source trust</th>
            <th className={thDenseRight}>Pulls</th>
            <th className={thDenseRight}>Rewards</th>
            <th className={thDenseRight}>Avg reward</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((arm) => (
            <tr key={arm.arm_id} className={trDense}>
              <td className={`${tdDense} font-mono text-xs`}>{arm.arm_id}</td>
              <td className={tdDenseRight}>{arm.weights.discount.toFixed(3)}</td>
              <td className={tdDenseRight}>{arm.weights.freshness.toFixed(3)}</td>
              <td className={tdDenseRight}>{arm.weights.source_trust.toFixed(3)}</td>
              <td className={tdDenseRight}>{arm.pulls}</td>
              <td className={tdDenseRight}>{arm.rewards}</td>
              <td className={`${tdDenseRight} ${avgRewardColor(arm.avg_reward)}`}>
                {arm.avg_reward.toFixed(4)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ConfirmResetModal exibe o dialog de confirmação antes de resetar o estado UCB1.
function ConfirmResetModal({
  channelName,
  onConfirm,
  onCancel,
}: {
  channelName: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal open onClose={onCancel}>
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-fg">Resetar estado UCB1?</h3>
        <p className="text-sm text-fg-2">
          Esta ação irá apagar todo o histórico de pulls e rewards do canal{' '}
          <strong>{channelName}</strong>. O algoritmo voltará a explorar do zero.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm}>
            Confirmar reset
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// BanditDebugger é a tela de debug do algoritmo UCB1 (bandit) por canal.
export default function BanditDebugger() {
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const qc = useQueryClient()

  const channelsQuery = useQuery({
    queryKey: ['channels'],
    queryFn: fetchChannels,
  })

  const banditQuery = useQuery({
    queryKey: ['bandit', selectedChannelId],
    queryFn: () => fetchBanditState(selectedChannelId!),
    enabled: selectedChannelId !== null,
  })

  const resetMutation = useMutation({
    mutationFn: () => resetBanditState(selectedChannelId!),
    onSuccess: () => {
      setConfirmReset(false)
      qc.invalidateQueries({ queryKey: ['bandit', selectedChannelId] })
    },
  })

  // selectedChannel retorna o canal atualmente selecionado.
  const selectedChannel = (channelsQuery.data ?? []).find(
    (channel) => channel.id === selectedChannelId,
  )

  function renderBanditContent() {
    if (selectedChannelId === null) {
      return (
        <EmptyState
          title="Selecione um canal"
          description={mythosEmpty.bandit}
        />
      )
    }

    if (banditQuery.isLoading) {
      return <Skeleton variant="table" rows={5} />
    }

    if (banditQuery.isError) {
      return (
        <EmptyState
          title="Erro ao carregar estado UCB1"
          description="O endpoint retornou um erro. Verifique o backend."
        />
      )
    }

    if (!banditQuery.data) {
      return (
        <EmptyState
          title="Estado UCB1 não disponível"
          description="Este canal ainda não possui estado UCB1 registrado ou o endpoint retornou 404."
        />
      )
    }

    const state = banditQuery.data

    return (
      <div className={`${sectionCard} space-y-4`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-fg" title={mythosTooltip.bandit}>
              Estado UCB1 — Canal {selectedChannelId}
            </h3>
            <Badge variant="default">{state.total_pulls} pulls totais</Badge>
          </div>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setConfirmReset(true)}
          >
            Reset state
          </Button>
        </div>

        <ArmsTable arms={state.arms ?? []} />
      </div>
    )
  }

  return (
    <div className={pageContainer}>
      <PageHeader title="Bandit Debugger — UCB1" className="mb-4" />

      {/* Seletor de canal */}
      <div className={`${sectionCard} mb-4`}>
        <label className="text-sm font-medium text-fg-2 block mb-2">Canal</label>
        {channelsQuery.isLoading ? (
          <Skeleton className="h-8 w-64" />
        ) : (
          <select
            className="bg-bg border border-border rounded px-3 py-1.5 text-sm text-fg focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent w-64"
            value={selectedChannelId ?? ''}
            onChange={(e) => {
              const value = e.target.value
              setSelectedChannelId(value ? Number(value) : null)
            }}
          >
            <option value="">Selecione um canal...</option>
            {(channelsQuery.data ?? []).map((channel) => (
              <option key={channel.id} value={channel.id}>
                #{channel.id} — {channel.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {renderBanditContent()}

      {/* Dialog de confirmação de reset */}
      {confirmReset && selectedChannel && (
        <ConfirmResetModal
          channelName={selectedChannel.name}
          onConfirm={() => resetMutation.mutate()}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </div>
  )
}
