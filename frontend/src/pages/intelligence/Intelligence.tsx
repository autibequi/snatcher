import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../lib/apiClient'
import { fetchIntelligenceGroup } from '../../lib/api/intelligence'
import type { IntelligenceGroupResult, IntelligenceGates } from '../../lib/api/intelligence'
import {
  PageHeader,
  Skeleton,
  EmptyState,
} from '../../components/ui'
import {
  pageContainer,
  sectionCard,
  sectionTitle,
  tableContainer,
  tableHeaderCell,
  tableRow,
  tableCell,
  tableCellMuted,
  badgeOk,
  badgeError,
  badgeWarn,
  badgeInfo,
} from '../../lib/uiTokens'

// ── Types ─────────────────────────────────────────────────────────────────────

interface GroupOption {
  id: number
  name: string
  platform: string
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatBrl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function formatScore(value: number): string {
  return value.toFixed(3)
}

// ── GateSemaphore ─────────────────────────────────────────────────────────────

interface GateSemaphoreProps {
  gates: IntelligenceGates
}

const GATE_LABELS: Record<keyof IntelligenceGates, string> = {
  in_window: 'Janela de envio',
  pacing_ok: 'Pacing (cap diário)',
  has_channel: 'Canal vinculado',
  has_modem: 'Modem disponível',
}

function GateSemaphore({ gates }: GateSemaphoreProps) {
  const keys = Object.keys(GATE_LABELS) as Array<keyof IntelligenceGates>

  return (
    <div className={sectionCard}>
      <p className={`${sectionTitle} mb-3`}>Semáforos de disparo</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {keys.map(key => {
          const ok = gates[key]
          const chipClass = ok ? badgeOk : badgeError
          const icon = ok ? '✓' : '✕'
          return (
            <div
              key={key}
              className="flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-md border border-border bg-surface-2"
            >
              <span className={`text-lg font-bold ${ok ? 'text-success' : 'text-danger'}`}>
                {icon}
              </span>
              <span className={chipClass}>{GATE_LABELS[key]}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── EnqueuedTopCard ───────────────────────────────────────────────────────────

interface EnqueuedTopCardProps {
  result: IntelligenceGroupResult
}

function EnqueuedTopCard({ result }: EnqueuedTopCardProps) {
  const { enqueued_top } = result

  if (!enqueued_top) {
    return (
      <div className={sectionCard}>
        <p className={`${sectionTitle} mb-2`}>Próximo envio</p>
        <p className="text-sm text-fg-3">
          Nenhum produto qualificado no momento — todos os candidatos foram descartados pelo motor.
        </p>
      </div>
    )
  }

  return (
    <div className={`${sectionCard} border-accent/30 bg-accent/5`}>
      <p className={`${sectionTitle} mb-3`}>Próximo envio</p>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-fg truncate" title={enqueued_top.title}>
            {enqueued_top.title}
          </p>
          <p className="text-xs text-fg-3 mt-0.5">ID #{enqueued_top.id}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-base font-semibold text-fg tabular-nums">
            {formatBrl(enqueued_top.price)}
          </span>
          <span className={badgeInfo}>
            score {formatScore(enqueued_top.score)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── RankingTable ──────────────────────────────────────────────────────────────

interface RankingTableProps {
  result: IntelligenceGroupResult
}

function RankingTable({ result }: RankingTableProps) {
  const { ranked } = result

  if (ranked.length === 0) {
    return (
      <div className={sectionCard}>
        <p className={`${sectionTitle} mb-2`}>Ranking de candidatos</p>
        <p className="text-sm text-fg-3 py-4 text-center">
          Nenhum candidato retornado pelo motor para este grupo.
        </p>
      </div>
    )
  }

  return (
    <div>
      <p className={`${sectionTitle} mb-3`}>Ranking de candidatos</p>
      <div className={tableContainer}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th className={`${tableHeaderCell} text-left`}>#</th>
              <th className={`${tableHeaderCell} text-left`}>Produto</th>
              <th className={`${tableHeaderCell} text-right`}>Preço</th>
              <th className={`${tableHeaderCell} text-right`}>Quality</th>
              <th className={`${tableHeaderCell} text-right`}>Desconto</th>
              <th className={`${tableHeaderCell} text-right`}>Economia</th>
              <th className={`${tableHeaderCell} text-right`}>Score</th>
              <th className={`${tableHeaderCell} text-left`}>Motivos</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((entry, index) => {
              const rankLabel = index === 0 ? '🥇 1' : `${index + 1}`
              const hasEconomia = entry.economia != null && entry.economia > 0
              const targetChipClass = entry.target_reason === 'ok' ? badgeOk : badgeWarn

              return (
                <tr key={entry.id} className={tableRow}>
                  <td className={tableCellMuted + ' tabular-nums font-mono text-xs'}>
                    {rankLabel}
                  </td>
                  <td className={tableCell}>
                    <p className="font-medium leading-snug">{entry.title}</p>
                    <span className={`mt-1 inline-block text-[11px] ${targetChipClass}`}>
                      {entry.target_reason}
                    </span>
                  </td>
                  <td className={tableCellMuted + ' text-right tabular-nums'}>
                    {formatBrl(entry.price)}
                  </td>
                  <td className={tableCellMuted + ' text-right tabular-nums'}>
                    {formatScore(entry.quality_score)}
                  </td>
                  <td className={tableCellMuted + ' text-right tabular-nums'}>
                    {formatPct(entry.discount_pct)}
                  </td>
                  <td className={tableCellMuted + ' text-right tabular-nums'}>
                    {hasEconomia ? formatBrl(entry.economia!) : '—'}
                  </td>
                  <td className={`${tableCell} text-right tabular-nums font-semibold text-accent`}>
                    {formatScore(entry.score)}
                  </td>
                  <td className={tableCell}>
                    <ReasonsList reasons={entry.reasons} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── ReasonsList ───────────────────────────────────────────────────────────────

function ReasonsList({ reasons }: { reasons: string[] }) {
  if (!reasons || reasons.length === 0) {
    return <span className="text-xs text-fg-3">—</span>
  }
  return (
    <ul className="space-y-0.5">
      {reasons.map((r, i) => (
        <li key={i} className="text-xs text-fg-2 leading-snug">
          • {r}
        </li>
      ))}
    </ul>
  )
}

// ── GroupSelector ─────────────────────────────────────────────────────────────

interface GroupSelectorProps {
  groups: GroupOption[]
  selectedId: number | null
  onChange: (id: number | null) => void
}

function GroupSelector({ groups, selectedId, onChange }: GroupSelectorProps) {
  function handleChange(e: { target: { value: string } }) {
    const val = e.target.value
    if (!val) {
      onChange(null)
      return
    }
    onChange(Number(val))
  }

  return (
    <div className="flex items-center gap-3">
      <label className="text-sm text-fg-2 flex-shrink-0">Grupo</label>
      <select
        className="text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent min-w-[240px]"
        value={selectedId ?? ''}
        onChange={handleChange}
      >
        <option value="">Selecione um grupo…</option>
        {groups.map(g => (
          <option key={g.id} value={g.id}>
            {g.name} (#{g.id})
          </option>
        ))}
      </select>
    </div>
  )
}

// ── Intelligence (page) ───────────────────────────────────────────────────────

export default function Intelligence() {
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)

  const { data: groupsRaw = [], isLoading: groupsLoading } = useQuery<GroupOption[]>({
    queryKey: ['groups'],
    queryFn: () =>
      apiClient
        .get<GroupOption[]>('/api/groups')
        .then(r => (Array.isArray(r.data) ? r.data : []))
        .catch(() => []),
    staleTime: 30_000,
  })

  const {
    data: intelligenceResult,
    isLoading: intelligenceLoading,
    isError: intelligenceError,
  } = useQuery<IntelligenceGroupResult | null>({
    queryKey: ['intelligence-group', selectedGroupId],
    queryFn: () => {
      if (selectedGroupId == null) return Promise.resolve(null)
      return fetchIntelligenceGroup(selectedGroupId)
    },
    enabled: selectedGroupId != null,
    staleTime: 15_000,
    retry: 1,
  })

  function handleGroupChange(id: number | null) {
    setSelectedGroupId(id)
  }

  const isLoadingIntelligence = selectedGroupId != null && intelligenceLoading

  return (
    <div className={pageContainer}>
      <PageHeader
        title="Hub Inteligência"
        subtitle="Auditoria do motor de seleção — por grupo, o que seria enviado e por quê."
        className="mb-6"
      />

      {/* Seletor */}
      <div className="mb-6">
        {groupsLoading ? (
          <Skeleton className="h-9 w-64" />
        ) : (
          <GroupSelector
            groups={groupsRaw}
            selectedId={selectedGroupId}
            onChange={handleGroupChange}
          />
        )}
      </div>

      {/* Estado inicial: nenhum grupo selecionado */}
      {selectedGroupId == null && !groupsLoading && (
        <EmptyState
          title="Selecione um grupo"
          description="Escolha um grupo para ver o ranking de produtos e os semáforos de disparo."
        />
      )}

      {/* Carregando resultado de inteligência */}
      {isLoadingIntelligence && (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {/* Erro ao carregar */}
      {intelligenceError && selectedGroupId != null && !intelligenceLoading && (
        <div className="px-4 py-3 rounded-md bg-danger/10 border border-danger/30 text-sm text-danger">
          Erro ao carregar dados do motor para este grupo. Verifique se o grupo existe e se o backend está disponível.
        </div>
      )}

      {/* Resultado carregado */}
      {intelligenceResult != null && !intelligenceLoading && (
        <div className="space-y-6">
          <GateSemaphore gates={intelligenceResult.gates} />
          <EnqueuedTopCard result={intelligenceResult} />
          <RankingTable result={intelligenceResult} />
        </div>
      )}
    </div>
  )
}
