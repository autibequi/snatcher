import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { deleteProduct, sendProduct, getProductHistory } from '../api'
import { SourceBadge } from './SourceBadge'

interface Product {
  id: string
  title: string
  price: number
  url: string
  image_url?: string
  sent_at?: string
  group_id: string
  group_name?: string
  source: string
}

interface PriceHistory {
  recorded_at: string
  price: number
}

interface ProductCardProps {
  product: Product
  showGroup?: boolean
}

export default function ProductCard({ product, showGroup = false }: ProductCardProps): React.ReactElement {
  const qc = useQueryClient()
  const [showHistory, setShowHistory] = useState(false)

  const del = useMutation({
    mutationFn: () => deleteProduct(product.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products', product.group_id] }),
  })

  const send = useMutation({
    mutationFn: () => sendProduct(product.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products', product.group_id] }),
  })

  const { data: history = [], isLoading: loadingHistory } = useQuery({
    queryKey: ['history', product.id],
    queryFn: () => getProductHistory(product.id),
    enabled: showHistory,
  }) as { data: PriceHistory[], isLoading: boolean }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
      <div className="flex">
        {product.image_url && (
          <img
            src={product.image_url}
            alt={product.title}
            className="w-24 h-24 object-contain bg-white flex-shrink-0"
          />
        )}
        <div className="p-4 flex flex-col gap-2 flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-200 line-clamp-2">{product.title}</p>
              {showGroup && product.group_name && (
                <span className="inline-block text-xs text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded mt-1">
                  {product.group_name}
                </span>
              )}
            </div>
            <SourceBadge sourceId={product.source} size="sm" />
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-green-400">
              R$ {product.price.toFixed(2).replace('.', ',')}
            </span>
            {product.sent_at && (
              <span className="text-xs text-blue-400">✓ Enviado</span>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            <a
              href={product.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded-lg transition-colors"
            >
              🔗 Ver produto
            </a>
            <button
              onClick={() => setShowHistory(h => !h)}
              className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded-lg transition-colors"
            >
              📈 {showHistory ? 'Fechar' : 'Histórico'}
            </button>
            {product.sent_at ? (
              <button
                onClick={() => {
                  if (window.confirm('Reenviar este produto para o grupo WA?')) send.mutate()
                }}
                disabled={send.isPending}
                className="text-xs bg-gray-700 hover:bg-green-800 disabled:opacity-50 text-white px-3 py-1 rounded-lg transition-colors"
              >
                {send.isPending ? '⏳' : '🔁 Reenviar'}
              </button>
            ) : (
              <button
                onClick={() => send.mutate()}
                disabled={send.isPending}
                className="text-xs bg-green-800 hover:bg-green-700 disabled:opacity-50 text-white px-3 py-1 rounded-lg transition-colors"
              >
                {send.isPending ? '⏳' : '📤 Enviar WA'}
              </button>
            )}
            <button
              onClick={() => del.mutate()}
              className="text-xs bg-red-900 hover:bg-red-700 text-white px-3 py-1 rounded-lg transition-colors ml-auto"
            >
              🗑️
            </button>
          </div>
        </div>
      </div>

      {/* Painel de histórico de preços */}
      {showHistory && (
        <div className="px-4 pb-4 border-t border-gray-800 mt-0 pt-3">
          {loadingHistory && (
            <p className="text-xs text-gray-500">Carregando histórico...</p>
          )}
          {!loadingHistory && history.length <= 1 && (
            <p className="text-xs text-gray-500">
              {history.length === 0
                ? 'Nenhum registro de histórico.'
                : 'Sem variações de preço registradas ainda.'}
            </p>
          )}
          {!loadingHistory && history.length > 1 && (
            <>
              <p className="text-xs text-gray-500 mb-2">
                Variações de preço ({history.length} pontos)
              </p>
              <ResponsiveContainer width="100%" height={110}>
                <LineChart data={history} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <XAxis
                    dataKey="recorded_at"
                    tickFormatter={v =>
                      new Date(v).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                    }
                    tick={{ fontSize: 10, fill: '#9ca3af' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tickFormatter={v => `R$${v.toFixed(0)}`}
                    tick={{ fontSize: 10, fill: '#9ca3af' }}
                    tickLine={false}
                    axisLine={false}
                    width={55}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    // @ts-expect-error Recharts Tooltip type generics mismatch
                    formatter={(v: number) => [`R$ ${(v ?? 0).toFixed(2).replace('.', ',')}`, 'Preço']}
                    // @ts-expect-error Recharts Tooltip type generics mismatch
                    labelFormatter={(v: number) => new Date(v).toLocaleString('pt-BR')}
                    contentStyle={{
                      background: '#111827',
                      border: '1px solid #374151',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="#4ade80"
                    strokeWidth={2}
                    dot={history.length <= 10}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      )}
    </div>
  )
}
