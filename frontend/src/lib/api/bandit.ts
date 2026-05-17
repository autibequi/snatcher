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

// Formato persistido em channel_score_weights.ucb1_state (algo.Arm).
interface Ucb1ArmRaw {
  id: string
  weights?: Partial<BanditArmWeights>
  pulls?: number
  reward?: number
}

// Payload bruto do GET /api/admin/channels/{id}/bandit.
interface BanditApiResponse {
  channel_id: number
  weights?: unknown
  ucb1_state?: Ucb1ArmRaw[] | null
  updated_at?: string | null
  updated_by?: string | null
}

function normalizeArm(raw: Ucb1ArmRaw): BanditArm {
  const pulls = raw.pulls ?? 0
  const reward = raw.reward ?? 0
  return {
    arm_id: String(raw.id ?? ''),
    weights: {
      discount: raw.weights?.discount ?? 0,
      freshness: raw.weights?.freshness ?? 0,
      source_trust: raw.weights?.source_trust ?? 0,
    },
    pulls,
    rewards: reward,
    avg_reward: pulls > 0 ? reward / pulls : 0,
  }
}

function parseBanditState(raw: BanditApiResponse): BanditState {
  const armsRaw = Array.isArray(raw.ucb1_state) ? raw.ucb1_state : []
  const arms = armsRaw.map(normalizeArm)
  const total_pulls = arms.reduce((sum, arm) => sum + arm.pulls, 0)
  return {
    channel_id: raw.channel_id,
    arms,
    total_pulls,
    updated_at: raw.updated_at ?? undefined,
  }
}

// fetchBanditState busca o estado UCB1 do bandit de um canal específico.
export async function fetchBanditState(channelID: number): Promise<BanditState | null> {
  const r = await authFetch(`/api/admin/channels/${channelID}/bandit`)
  if (r.status === 404) {
    return null
  }
  if (!r.ok) {
    throw new Error(`fetchBanditState ${r.status}`)
  }
  const raw = (await r.json()) as BanditApiResponse
  return parseBanditState(raw)
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
