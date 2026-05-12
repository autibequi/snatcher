import { useEffect, useState } from 'react'
import { authFetch } from '../lib/authFetch'

interface Suggestion {
  id: number
  loop_name: string
  target_type: string
  target_id: number
  suggestion: string
  reasoning?: string
  proposed_change: any
  confidence?: number
  created_at: string
}

export default function SuggestionsL4() {
  const [items, setItems] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const r = await authFetch('/api/admin/suggestions?status=pending')
      const data = await r.json()
      setItems(data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const approve = async (id: number) => {
    await authFetch(`/api/admin/suggestions/${id}/approve`, { method: 'POST' })
    load()
  }

  const dismiss = async (id: number) => {
    const reason = prompt('Motivo da rejeição (opcional):') || ''
    await authFetch(`/api/admin/suggestions/${id}/dismiss?reason=${encodeURIComponent(reason)}`, { method: 'POST' })
    load()
  }

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-2xl font-bold mb-4">Sugestões dos Loops LLM (L4)</h1>
      {loading && <p>Carregando...</p>}
      {!loading && items.length === 0 && (
        <p className="text-gray-500">Sem sugestões pendentes.</p>
      )}
      <div className="space-y-4">
        {items.map((s) => (
          <div key={s.id} className="border rounded-lg p-4 bg-white shadow-sm">
            <div className="flex justify-between items-start">
              <div>
                <span className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded mr-2">
                  {s.loop_name}
                </span>
                <span className="text-sm text-gray-500">
                  {s.target_type} #{s.target_id}
                </span>
              </div>
              <span className="text-xs text-gray-400">{s.created_at}</span>
            </div>
            <p className="mt-2 font-medium">{s.suggestion}</p>
            {s.reasoning && (
              <p className="mt-1 text-sm text-gray-600">Motivo: {s.reasoning}</p>
            )}
            <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-auto max-h-48">
              {JSON.stringify(s.proposed_change, null, 2)}
            </pre>
            {s.confidence != null && (
              <p className="text-xs text-gray-500 mt-1">
                Confiança: {(s.confidence * 100).toFixed(0)}%
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => approve(s.id)}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium"
              >
                Aprovar
              </button>
              <button
                onClick={() => dismiss(s.id)}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm font-medium"
              >
                Rejeitar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
