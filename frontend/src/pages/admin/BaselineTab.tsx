import { useEffect, useRef, useState } from 'react'
import {
  listBaselineSnapshots,
  compareBaseline,
  BaselineSnapshot,
  BaselineDiff,
} from '../../lib/api/baseline'
import {
  sectionCard,
  tblDense,
  thDense,
  tdDense,
  trDense,
  rowSelected,
} from '../../lib/uiTokens'
import { mythosEmpty, mythosTooltip } from '../../lib/copy/mythos'

// Métricas onde valores menores são melhores (queda = verde)
const LOWER_IS_BETTER = new Set([
  'ban_rate_per_channel',
  'dispatch_latency_p95_ms',
  'dispatch_latency_p99_ms',
  'queue_depth_p95',
  'discount_zero_messages_today',
  'quarantine_events_today',
])

// Métricas onde valores maiores são melhores (subida = verde)
const HIGHER_IS_BETTER = new Set([
  'ctr_per_channel_7d',
])

// Determina se a variação de delta_pct é uma melhora para a métrica
function isImprovement(metricName: string, deltaPct: number): boolean {
  if (LOWER_IS_BETTER.has(metricName)) {
    return deltaPct < 0
  }
  if (HIGHER_IS_BETTER.has(metricName)) {
    return deltaPct > 0
  }
  // Métrica desconhecida — sem coloração direcional
  return false
}

// Determina se a variação é piora para a métrica
function isWorsening(metricName: string, deltaPct: number): boolean {
  if (LOWER_IS_BETTER.has(metricName)) {
    return deltaPct > 0
  }
  if (HIGHER_IS_BETTER.has(metricName)) {
    return deltaPct < 0
  }
  return false
}

// Retorna a classe de cor CSS para o delta com base na direção da métrica
function deltaColorClass(metricName: string, deltaPct: number): string {
  if (deltaPct === 0) {
    return 'text-fg-3'
  }
  if (isImprovement(metricName, deltaPct)) {
    return 'text-success font-semibold'
  }
  if (isWorsening(metricName, deltaPct)) {
    return 'text-danger font-semibold'
  }
  // Direção desconhecida — neutro
  return 'text-fg-3'
}

// Formata o delta em porcentagem com sinal
function formatDeltaPct(deltaPct: number): string {
  const sign = deltaPct > 0 ? '+' : ''
  return `${sign}${deltaPct.toFixed(1)}%`
}

// Formata a data de captura do snapshot para exibição legível
function formatCapturedAt(capturedAt: string): string {
  const date = new Date(capturedAt)
  return date.toLocaleString('pt-BR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Painel de diff entre dois snapshots — lista métricas com delta colorido
function DiffPanel({ diff }: { diff: BaselineDiff }) {
  const entries = Object.entries(diff.diff)

  if (entries.length === 0) {
    return (
      <div className={`${sectionCard} mt-4`}>
        <p className="text-fg-3 text-sm">Nenhuma métrica em comum entre os dois snapshots.</p>
      </div>
    )
  }

  return (
    <div className={`${sectionCard} mt-4`}>
      <h3 className="text-sm font-semibold text-fg mb-3">
        Diff #{diff.from.id} &rarr; #{diff.to.id}
      </h3>
      <div className="overflow-x-auto rounded border border-border">
        <table className={tblDense}>
          <thead>
            <tr>
              <th className={thDense}>Métrica</th>
              <th className={`${thDense} text-right`}>Antes</th>
              <th className={`${thDense} text-right`}>Depois</th>
              <th className={`${thDense} text-right`}>Delta</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([metricName, values]) => {
              const { before, after, delta_pct } = values
              const colorClass = deltaColorClass(metricName, delta_pct)

              return (
                <tr key={metricName} className={trDense}>
                  <td className={`${tdDense} font-mono text-[12px] text-fg-3`}>{metricName}</td>
                  <td className={`${tdDense} text-right tabular-nums text-sm`}>
                    {before.toFixed(4)}
                  </td>
                  <td className={`${tdDense} text-right tabular-nums text-sm`}>
                    {after.toFixed(4)}
                  </td>
                  <td className={`${tdDense} text-right tabular-nums text-sm ${colorClass}`}>
                    {formatDeltaPct(delta_pct)}
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

// Lista de snapshots com seletores "from" e "to"
function SnapshotsList({
  snapshots,
  fromID,
  toID,
  onSelectFrom,
  onSelectTo,
}: {
  snapshots: BaselineSnapshot[]
  fromID: number | null
  toID: number | null
  onSelectFrom: (id: number | null) => void
  onSelectTo: (id: number | null) => void
}) {
  if (snapshots.length === 0) {
    return (
      <div className={sectionCard}>
        <p className="text-fg-3 text-sm">{mythosEmpty.baseline}</p>
      </div>
    )
  }

  return (
    <div className={sectionCard}>
      <h3 className="text-sm font-semibold text-fg mb-1">
        Snapshots (últimos {snapshots.length})
      </h3>
      <p className="text-xs text-fg-3 mb-3">
        Selecione From e To para comparar dois snapshots.
      </p>
      <div className="overflow-x-auto rounded border border-border">
        <table className={tblDense}>
          <thead>
            <tr>
              <th className={thDense}>#ID</th>
              <th className={thDense}>Capturado em</th>
              <th className={thDense}>Escopo</th>
              <th className={`${thDense} text-center`}>From</th>
              <th className={`${thDense} text-center`}>To</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map(snapshot => {
              const isFrom = fromID === snapshot.id
              const isTo = toID === snapshot.id
              const rowClass = [
                trDense,
                isFrom || isTo ? rowSelected : '',
              ]
                .filter(Boolean)
                .join(' ')

              return (
                <tr key={snapshot.id} className={rowClass}>
                  <td className={`${tdDense} font-mono text-[12px] text-fg-3`}>
                    #{snapshot.id}
                  </td>
                  <td className={`${tdDense} text-sm`}>
                    {formatCapturedAt(snapshot.captured_at)}
                  </td>
                  <td className={`${tdDense} text-sm text-fg-3`}>{snapshot.scope}</td>
                  <td className={`${tdDense} text-center`}>
                    <input
                      type="radio"
                      name="baseline-from"
                      checked={isFrom}
                      onChange={() => onSelectFrom(isFrom ? null : snapshot.id)}
                      title={`Selecionar snapshot #${snapshot.id} como From`}
                      className="cursor-pointer accent-accent"
                    />
                  </td>
                  <td className={`${tdDense} text-center`}>
                    <input
                      type="radio"
                      name="baseline-to"
                      checked={isTo}
                      onChange={() => onSelectTo(isTo ? null : snapshot.id)}
                      title={`Selecionar snapshot #${snapshot.id} como To`}
                      className="cursor-pointer accent-accent"
                    />
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

// Tab principal readonly de Baseline — lista snapshots e renderiza diff quando 2 estão selecionados
export function BaselineTab() {
  const [snapshots, setSnapshots] = useState<BaselineSnapshot[]>([])
  const [fromID, setFromID] = useState<number | null>(null)
  const [toID, setToID] = useState<number | null>(null)
  const [diff, setDiff] = useState<BaselineDiff | null>(null)
  const [loadingSnapshots, setLoadingSnapshots] = useState(true)
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [errorSnapshots, setErrorSnapshots] = useState<string | null>(null)
  const [errorDiff, setErrorDiff] = useState<string | null>(null)

  // Ref para evitar atualização de estado em componente desmontado
  const mountedRef = useRef(true)

  // Marca desmontagem para cancelar setState pendentes
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Carrega a lista de snapshots ao montar
  useEffect(() => {
    // Reinicia flags via ref antes de disparar o fetch (sem setState síncrono)
    let cancelled = false

    listBaselineSnapshots(30)
      .then(data => {
        if (!cancelled && mountedRef.current) {
          setSnapshots(data)
          setLoadingSnapshots(false)
          setErrorSnapshots(null)
        }
      })
      .catch(err => {
        if (!cancelled && mountedRef.current) {
          setErrorSnapshots(String(err))
          setLoadingSnapshots(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Dispara compare quando ambos fromID e toID estão definidos
  useEffect(() => {
    if (fromID === null || toID === null) {
      setDiff(null)
      setLoadingDiff(false)
      return
    }

    let cancelled = false
    setLoadingDiff(true)

    compareBaseline(fromID, toID)
      .then(data => {
        if (!cancelled && mountedRef.current) {
          setDiff(data)
          setErrorDiff(null)
          setLoadingDiff(false)
        }
      })
      .catch(err => {
        if (!cancelled && mountedRef.current) {
          setErrorDiff(String(err))
          setDiff(null)
          setLoadingDiff(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [fromID, toID])

  // Renderização do estado de loading de snapshots
  function renderSnapshotsBody() {
    if (loadingSnapshots) {
      return (
        <div className={sectionCard}>
          <p className="text-fg-3 text-sm animate-pulse">Carregando snapshots...</p>
        </div>
      )
    }

    if (errorSnapshots) {
      return (
        <div className={sectionCard}>
          <p className="text-danger text-sm">{errorSnapshots}</p>
        </div>
      )
    }

    return (
      <SnapshotsList
        snapshots={snapshots}
        fromID={fromID}
        toID={toID}
        onSelectFrom={setFromID}
        onSelectTo={setToID}
      />
    )
  }

  // Renderização do estado de loading do diff
  function renderDiffBody() {
    if (fromID === null || toID === null) {
      return null
    }

    if (loadingDiff) {
      return (
        <div className={`${sectionCard} mt-4`}>
          <p className="text-fg-3 text-sm animate-pulse">Calculando diff...</p>
        </div>
      )
    }

    if (errorDiff) {
      return (
        <div className={`${sectionCard} mt-4`}>
          <p className="text-danger text-sm">{errorDiff}</p>
        </div>
      )
    }

    if (diff) {
      return <DiffPanel diff={diff} />
    }

    return null
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-3 mb-1" title={mythosTooltip.baseline}>
          Baseline T-0 (W-1 readonly)
        </h2>
        <p className="text-xs text-fg-3">
          Visão somente leitura dos snapshots de métricas capturados. Verde = melhora, Vermelho = piora (direcional por métrica).
        </p>
      </div>

      {renderSnapshotsBody()}
      {renderDiffBody()}
    </div>
  )
}
