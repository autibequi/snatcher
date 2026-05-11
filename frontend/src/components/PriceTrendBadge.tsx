import React, { FC } from 'react'
import { useQuery } from '@tanstack/react-query'

interface VariantStats {
  p25: number
  p50: number
  p75: number
  mean: number
  current: number
  score: number | null
  count: number
  window: string
}

interface PriceTrendBadgeProps {
  variantId: number
  window?: '7d' | '30d' | '60d' | '90d'
}

// Mock API call (em prod, seria em api.ts)
const getVariantStats = async (variantId: number, window = '90d'): Promise<VariantStats> => {
  const res = await fetch(`/api/catalog/variants/${variantId}/stats?window=${window}`)
  if (!res.ok) throw new Error('Failed to fetch stats')
  return res.json()
}

export const PriceTrendBadge: FC<PriceTrendBadgeProps> = ({ variantId, window = '90d' }) => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['variantStats', variantId, window],
    queryFn: () => getVariantStats(variantId, window),
    staleTime: 10 * 60 * 1000, // 10 min
    retry: false,
  })

  if (isLoading) {
    return <span className="text-[11px] px-1.5 py-0.5 rounded-md font-medium bg-surface-2 text-fg-3 animate-pulse">…</span>
  }

  if (!stats || stats.score === null) {
    return <span className="text-[11px] px-1.5 py-0.5 rounded-md font-medium bg-surface-2 text-fg-3">sem histórico</span>
  }

  const { score, p25, p50, p75, current } = stats

  let cls: string
  let label: string

  if (score >= 0.7) {
    cls = 'bg-success-soft text-success border border-success/25'
    label = 'excelente'
  } else if (score >= 0.4) {
    cls = 'bg-warning-soft text-warning border border-warning/25'
    label = 'regular'
  } else {
    cls = 'bg-danger-soft text-danger border border-danger/25'
    label = 'caro'
  }

  const tooltip = `
    P25: R$ ${p25.toFixed(2)}
    P50: R$ ${p50.toFixed(2)}
    P75: R$ ${p75.toFixed(2)}
    Atual: R$ ${current.toFixed(2)}
    Score: ${(score * 100).toFixed(0)}%
  `.trim()

  return (
    <span
      title={tooltip}
      className={`text-[11px] px-1.5 py-0.5 rounded-md font-medium ${cls} cursor-help`}
    >
      {label}
    </span>
  )
}
