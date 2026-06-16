import React from 'react'
import { Clock, Wifi, WifiOff, Zap, ZapOff, Server } from '../../lib/icons'
import type { HealthFull } from '../../lib/api/health'

// ── Helpers ───────────────────────────────────────────────────────────────────

// relativeTime converte uma ISO string para tempo relativo em PT-BR (ex: "há 12 min").
// Recebe `now` como parâmetro para manter a função pura e testável.
// Retorna "agora" se for menos de 60s, e "—" se a string for nula.
function relativeTime(isoStr: string | null | undefined, now: number): string {
  if (!isoStr) return '—'
  const diffMs = now - new Date(isoStr).getTime()
  if (diffMs < 0) return 'agora'
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return 'agora'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `há ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `há ${diffH}h`
  return `há ${Math.floor(diffH / 24)}d`
}

// scanStatusTone determina a tonalidade do mini-card do Scan com base no estado atual.
// Recebe `now` como parâmetro puro para evitar chamada impura em contexto de hooks.
function scanStatusTone(rodando: boolean, ultimaColeta: string | null | undefined, now: number): Tone {
  if (rodando) return 'success'
  const diffMs = ultimaColeta ? now - new Date(ultimaColeta).getTime() : Infinity
  return diffMs < 60 * 60 * 1000 ? 'warning' : 'danger'
}

// circuitBreakerBadge retorna classes CSS para o badge de circuit breaker por estado.
function circuitBreakerBadge(state: string): string {
  if (state === 'closed') return 'bg-success/15 text-success border border-success/30'
  if (state === 'open') return 'bg-danger/15 text-danger border border-danger/30'
  return 'bg-warning/15 text-warning border border-warning/30'
}

// miniCardTone resolve a cor de um mini-card por estado booleano ou contagem.
type Tone = 'success' | 'warning' | 'danger' | 'neutral'

function toneClasses(tone: Tone): string {
  if (tone === 'success') return 'border-success/30 bg-success/10'
  if (tone === 'warning') return 'border-warning/30 bg-warning/10'
  if (tone === 'danger') return 'border-danger/30 bg-danger/10'
  return 'border-border bg-surface'
}

function labelToneClass(tone: Tone): string {
  if (tone === 'success') return 'text-success'
  if (tone === 'warning') return 'text-warning'
  if (tone === 'danger') return 'text-danger'
  return 'text-fg-3'
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface MiniCardProps {
  label: string
  tone: Tone
  children: React.ReactNode
}

function MiniCard({ label, tone, children }: MiniCardProps) {
  return (
    <div className={`flex flex-col gap-1 rounded-lg border p-3 ${toneClasses(tone)}`}>
      <span className="text-2xs font-semibold uppercase tracking-wide text-fg-3">{label}</span>
      <div className={`flex min-w-0 items-baseline gap-1 text-sm font-medium ${labelToneClass(tone)}`}>
        {children}
      </div>
    </div>
  )
}

// ── Interfaces ────────────────────────────────────────────────────────────────

interface SubsystemStatusProps {
  data: HealthFull
  /** Timestamp de referência para cálculos de tempo relativo (ms desde epoch). Padrão: Date.now() do caller. */
  now: number
}

// ── Component ─────────────────────────────────────────────────────────────────

// SubsystemStatus exibe uma linha de mini-cards com o estado dos subsistemas.
// Verde/amarelo/vermelho refletem saúde operacional imediata.
export function SubsystemStatus({ data, now }: SubsystemStatusProps) {
  const { dispatcher, contas_wa, scan, janela, circuit_breaker } = data

  // Fila: vermelho se queue_depth > 50; amarelo se > 10; verde se ok
  const filaTone: Tone =
    dispatcher.queue_depth > 50
      ? 'danger'
      : dispatcher.queue_depth > 10
        ? 'warning'
        : 'success'

  // Contas WA: vermelho se desconectadas > 0 ou quarentena > 0; verde ok
  const waTone: Tone =
    contas_wa.desconectadas > 0
      ? 'danger'
      : contas_wa.quarentena > 0
        ? 'warning'
        : 'success'

  const waConectadas = contas_wa.primary_conectadas + contas_wa.backup_conectadas

  // Scan: verde se rodando; amarelo se parado mas última coleta recente (<1h); vermelho se muito antigo
  const scanTone = scanStatusTone(scan.rodando, scan.ultima_coleta, now)

  // Janela: success se aberta, neutro se fechada
  const janelaTone: Tone = janela.aberta ? 'success' : 'neutral'

  // Circuit breakers: danger se algum open; warning se algum half_open; success se todos closed
  const cbEntries = Object.entries(circuit_breaker)
  let cbTone: Tone = 'success'
  if (cbEntries.some(([, state]) => state === 'open')) cbTone = 'danger'
  else if (cbEntries.some(([, state]) => state !== 'closed')) cbTone = 'warning'

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">

      {/* Fila / Dispatcher */}
      <MiniCard label="Fila" tone={filaTone}>
        <span className="text-lg font-bold">{dispatcher.queue_depth}</span>
        <span className="text-xs text-fg-3">/{dispatcher.active_workers} workers</span>
      </MiniCard>

      {/* Contas WA */}
      <MiniCard label="Contas WA" tone={waTone}>
        <span className="flex items-center gap-1">
          {waTone === 'danger' ? (
            <WifiOff className="h-3.5 w-3.5" />
          ) : (
            <Wifi className="h-3.5 w-3.5" />
          )}
          <span className="text-lg font-bold">{waConectadas}</span>
          <span className="text-xs text-fg-3">/{contas_wa.total}</span>
        </span>
        {contas_wa.quarentena > 0 && (
          <span className="text-2xs text-warning">{contas_wa.quarentena} em quarentena</span>
        )}
      </MiniCard>

      {/* Scan */}
      <MiniCard label="Scan" tone={scanTone}>
        <span className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1">
            {scan.rodando ? (
              <Zap className="h-3.5 w-3.5 text-success" />
            ) : (
              <ZapOff className="h-3.5 w-3.5" />
            )}
            <span>{scan.rodando ? 'Rodando' : 'Parado'}</span>
          </span>
          <span className="flex items-center gap-1 text-xs text-fg-3">
            <Clock className="h-3 w-3" />
            {relativeTime(scan.ultima_coleta, now)}
          </span>
        </span>
      </MiniCard>

      {/* Janela de envio */}
      <MiniCard label="Janela" tone={janelaTone}>
        <span className="flex items-center gap-1">
          {janela.aberta ? (
            <Zap className="h-3.5 w-3.5 text-success" />
          ) : (
            <ZapOff className="h-3.5 w-3.5 text-fg-3" />
          )}
          <span>{janela.aberta ? 'Aberta' : 'Fechada'}</span>
        </span>
        <span className="text-xs text-fg-3">
          {janela.send_start_hour}h–{janela.send_end_hour}h
        </span>
      </MiniCard>

      {/* Circuit Breakers */}
      <MiniCard label="Circuit Breakers" tone={cbTone}>
        {cbEntries.length === 0 ? (
          <span className="text-xs text-fg-3">Nenhum</span>
        ) : (
          <div className="flex min-w-0 w-full flex-wrap gap-1">
            {cbEntries.map(([upstream, state]) => (
              <span
                key={upstream}
                className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs font-semibold ${circuitBreakerBadge(state)}`}
                title={`${upstream}: ${state}`}
              >
                <Server className="h-2.5 w-2.5" />
                <span className="max-w-[7rem] truncate font-mono">{upstream}</span>
              </span>
            ))}
          </div>
        )}
      </MiniCard>

    </div>
  )
}
