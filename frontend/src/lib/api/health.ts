import { apiClient } from '../apiClient'

// ── Types ─────────────────────────────────────────────────────────────────────

// Alerta representa um item de alerta emitido pelo backend no endpoint health/full.
export interface Alerta {
  severity: 'critical' | 'warning' | 'info'
  area: string
  message: string
  action: string
}

// ContasWA representa o resumo de contas WhatsApp conectadas.
export interface ContasWA {
  total: number
  primary_conectadas: number
  backup_conectadas: number
  quarentena: number
  desconectadas: number
}

// ScanStatus representa o estado do scanner de marketplaces.
export interface ScanStatus {
  rodando: boolean
  ultima_coleta: string | null
  marketplaces_ativos: number
}

// JanelaStatus representa o estado da janela de envio.
export interface JanelaStatus {
  aberta: boolean
  send_start_hour: number
  send_end_hour: number
}

// HealthFull é o payload completo retornado por GET /api/admin/health/full.
export interface HealthFull {
  dispatcher: {
    queue_depth: number
    active_workers: number
  }
  circuit_breaker: Record<string, string>
  llm: {
    cost_today_usd_total: number
  }
  catalog: {
    ready: number
    sent: number
  }
  contas_wa: ContasWA
  scan: ScanStatus
  janela: JanelaStatus
  alertas: Alerta[]
}

// ── API ───────────────────────────────────────────────────────────────────────

// fetchHealthFull busca o snapshot completo de saúde do sistema.
export async function fetchHealthFull(): Promise<HealthFull> {
  const r = await apiClient.get<HealthFull>('/api/admin/health/full')
  return r.data
}
