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
    return <span className="text-xs px-2 py-1 rounded-full font-medium bg-gray-700 text-gray-400 animate-pulse">...</span>
  }

  if (!stats || stats.score === null) {
    return <span className="text-xs px-2 py-1 rounded-full font-medium bg-gray-700 text-gray-400">Sem histórico</span>
  }

  const { score, p25, p50, p75, current } = stats

  let bgColor = 'bg-gray-700'
  let textColor = 'text-gray-300'
  let label = 'Sem info'

  if (score >= 0.7) {
    bgColor = 'bg-green-900'
    textColor = 'text-green-300'
    label = 'Excelente!'
  } else if (score >= 0.4) {
    bgColor = 'bg-yellow-900'
    textColor = 'text-yellow-300'
    label = 'Regular'
  } else {
    bgColor = 'bg-red-900'
    textColor = 'text-red-300'
    label = 'Caro'
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
      className={`text-xs px-2 py-1 rounded-full font-medium ${bgColor} ${textColor} cursor-help`}
    >
      {label}
    </span>
  )
}
