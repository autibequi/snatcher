import { authFetch } from '../authFetch'

// BanditArmWeights contém os pesos usados pelo algoritmo UCB1 para um arm.
export interface BanditArmWeights {
  discount: number
  freshness: number
  source_trust: number
}

// BanditArm representa um arm do UCB1 state de um canal.
export interface BanditArm {
  arm_id: string
  weights: BanditArmWeights
  pulls: number
  rewards: number
  avg_reward: number
}

// BanditState representa o estado UCB1 completo de um canal.
export interface BanditState {
  channel_id: number
  arms: BanditArm[]
  total_pulls: number
  updated_at?: string
}

// fetchBanditState busca o estado UCB1 do bandit de um canal específico.
// Retorna null se o endpoint retornar 404 (canal sem estado ou feature desabilitada).
export async function fetchBanditState(channelID: number): Promise<BanditState | null> {
  const r = await authFetch(`/api/admin/channels/${channelID}/bandit`)
  if (r.status === 404) {
    return null
  }
  if (!r.ok) {
    throw new Error(`fetchBanditState ${r.status}`)
  }
  return r.json()
}

// resetBanditState envia POST para resetar o estado UCB1 de um canal.
export async function resetBanditState(channelID: number): Promise<void> {
  const r = await authFetch(`/api/admin/channels/${channelID}/bandit/reset`, {
    method: 'POST',
  })
  if (!r.ok) {
    throw new Error(`resetBanditState ${r.status}`)
  }
}
