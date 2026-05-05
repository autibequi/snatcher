import React, { useState, FC } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { getVariantHistory } from '../api'

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

interface PriceHistory {
  recorded_at: string
  price: number
}

const getVariantStats = async (variantId: string, window = '90d'): Promise<VariantStats> => {
  const res = await fetch(`/api/catalog/variants/${variantId}/stats?window=${window}`)
  if (!res.ok) throw new Error('Failed to fetch stats')
  return res.json()
}

const VariantDetail: FC = () => {
  const { id } = useParams<{ id: string }>()
  const [window, setWindow] = useState<'7d' | '30d' | '60d' | '90d'>('90d')

  const { data: history = [], isLoading: loadingHistory } = useQuery({
    queryKey: ['variantHistory', id],
    queryFn: () => (id ? getVariantHistory(id) : Promise.resolve([])),
    enabled: !!id,
  }) as { data: PriceHistory[], isLoading: boolean }

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['variantStats', id, window],
    queryFn: () => (id ? getVariantStats(id, window) : Promise.resolve(null)),
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
  }) as { data: VariantStats | null, isLoading: boolean }

  if (!id) {
    return <div className="text-gray-400">Variante não encontrada</div>
  }

  if (loadingHistory || loadingStats) {
    return <div className="text-gray-400">Carregando...</div>
  }

  // Preparar dados para o gráfico
  const chartData = history.map(h => ({
    time: new Date(h.recorded_at).toLocaleDateString('pt-BR', { month: 'short', day: '2-digit' }),
    recorded_at: h.recorded_at,
    price: h.price,
    p25: stats?.p25 || null,
    p50: stats?.p50 || null,
    p75: stats?.p75 || null,
  }))

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h1 className="text-2xl font-bold text-white mb-2">Histórico de Preços</h1>
        <p className="text-gray-400 text-sm">ID: {id}</p>

        {/* Window selector */}
        <div className="flex gap-2 mt-4 mb-6">
          {(['7d', '30d', '60d', '90d'] as const).map(w => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                window === w
                  ? 'bg-green-700 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {w}
            </button>
          ))}
        </div>

        {/* Stats summary */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6 p-4 bg-gray-800 rounded-lg">
            <div>
              <p className="text-xs text-gray-500">P25</p>
              <p className="text-lg font-semibold text-green-400">R$ {stats.p25.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">P50 (Mediana)</p>
              <p className="text-lg font-semibold text-gray-300">R$ {stats.p50.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">P75</p>
              <p className="text-lg font-semibold text-red-400">R$ {stats.p75.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Atual</p>
              <p className="text-lg font-semibold text-blue-400">R$ {stats.current.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Score</p>
              <p className={`text-lg font-semibold ${
                stats.score === null ? 'text-gray-400' : stats.score >= 0.7 ? 'text-green-400' : stats.score >= 0.4 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {stats.score === null ? '—' : `${(stats.score * 100).toFixed(0)}%`}
              </p>
            </div>
          </div>
        )}

        {/* Chart */}
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 12, fill: '#9ca3af' }}
                axisLine={{ stroke: '#4b5563' }}
              />
              <YAxis
                label={{ value: 'R$', angle: -90, position: 'insideLeft' }}
                tick={{ fontSize: 12, fill: '#9ca3af' }}
                axisLine={{ stroke: '#4b5563' }}
              />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                formatter={(v: any) => typeof v === 'number' ? `R$ ${v.toFixed(2)}` : v}
                labelFormatter={() => 'Preço'}
              />
              <Legend />

              {/* Linhas de percentis */}
              <Line
                type="monotone"
                dataKey="p25"
                stroke="#22c55e"
                strokeDasharray="5 5"
                strokeWidth={1.5}
                name="P25 (Bom)"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="p50"
                stroke="#9ca3af"
                strokeDasharray="5 5"
                strokeWidth={1.5}
                name="P50 (Mediana)"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="p75"
                stroke="#ef4444"
                strokeDasharray="5 5"
                strokeWidth={1.5}
                name="P75 (Caro)"
                isAnimationActive={false}
              />

              {/* Preços atuais como scatter */}
              <Scatter
                dataKey="price"
                fill="#3b82f6"
                name="Preço atual"
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-500 text-sm text-center py-8">Sem dados de histórico de preços</p>
        )}
      </div>
    </div>
  )
}

export default VariantDetail
