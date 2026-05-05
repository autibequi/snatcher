import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getBroadcasts, sendBroadcast, deleteBroadcast, getChannels } from '../api'
import type { Channel } from '../types/extended'

interface BroadcastData {
  id: string
  text: string
  image_url?: string
  status: string
  sent_count: number
  sent_at?: string
  created_at: string
  channel_ids: string | string[]
  error_msg?: string
}

interface SendBroadcastPayload {
  text: string
  image_url?: string
  channel_ids: string | string[]
}

interface BroadcastError {
  response?: {
    data?: {
      detail?: string
    }
  }
  message?: string
}

const field = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors'
const badge = 'text-xs px-2 py-0.5 rounded-full font-medium'

const STATUS: Record<string, string> = {
  sent:    'bg-green-900 text-green-300',
  error:   'bg-red-900 text-red-300',
  pending: 'bg-yellow-900 text-yellow-300',
}

function fmt(dt: string | null | undefined): string {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function Broadcast(): React.ReactElement {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [selectedChannels, setSelectedChannels] = useState<'all' | string[]>('all')
  const [error, setError] = useState('')

  const { data: channels = [] } = useQuery({ queryKey: ['channels'], queryFn: getChannels }) as { data: Channel[] }
  const { data: broadcasts = [] } = useQuery({ queryKey: ['broadcasts'], queryFn: getBroadcasts, refetchInterval: 10_000 }) as { data: BroadcastData[] }

  const send = useMutation({
    mutationFn: (data: SendBroadcastPayload) => sendBroadcast(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['broadcasts'] })
      setText('')
      setImageUrl('')
      setSelectedChannels('all')
      setError('')
    },
    onError: (e: BroadcastError) => setError(e.response?.data?.detail || e.message || 'Erro ao enviar'),
  })

  const del = useMutation({
    mutationFn: (id: string) => deleteBroadcast(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['broadcasts'] }),
  })

  const toggleChannel = (id: string): void => {
    if (selectedChannels === 'all') {
      setSelectedChannels([id])
    } else {
      const arr = selectedChannels as string[]
      setSelectedChannels(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id])
    }
  }

  const handleSend = () => {
    if (!text.trim()) return setError('Mensagem não pode ser vazia')
    if (selectedChannels !== 'all' && selectedChannels.length === 0) return setError('Selecione ao menos um canal')
    send.mutate({ text: text.trim(), image_url: imageUrl.trim() || undefined, channel_ids: selectedChannels })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">📢 Broadcast</h1>
          <p className="text-gray-500 text-sm mt-1">Envie mensagens livres para canais sem ser anúncio de produto</p>
        </div>
      </div>

      {/* Compose */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6 space-y-4">
        <h2 className="text-sm font-medium text-gray-300">Nova mensagem</h2>

        <div>
          <label className="text-xs text-gray-400 block mb-1">Mensagem <span className="text-red-400">*</span></label>
          <textarea
            className={`${field} resize-none`}
            rows={4}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Escreva a mensagem... Suporte a *negrito*, _itálico_"
          />
          <p className="text-xs text-gray-600 mt-1">{text.length} caracteres</p>
        </div>

        <div>
          <label className="text-xs text-gray-400 block mb-1">URL da imagem (opcional)</label>
          <input className={field} value={imageUrl} onChange={e => setImageUrl(e.target.value)}
            placeholder="https://..." />
        </div>

        <div>
          <label className="text-xs text-gray-400 block mb-2">Canais destino</label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedChannels('all')}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                selectedChannels === 'all'
                  ? 'bg-green-700 border-green-600 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              Todos os canais
            </button>
            {channels.map((ch: Channel) => {
              const isSelected = selectedChannels === 'all' || (Array.isArray(selectedChannels) && selectedChannels.includes(String(ch.id)))
              return (
                <button
                  key={ch.id}
                  onClick={() => toggleChannel(String(ch.id || ''))}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    isSelected && selectedChannels !== 'all'
                      ? 'bg-blue-900 border-blue-700 text-blue-300'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                  }`}
                >
                  {ch.name}
                  <span className="ml-1 text-gray-500">({ch.targets?.length ?? 0})</span>
                </button>
              )
            })}
          </div>
          {selectedChannels === 'all' && (
            <p className="text-xs text-gray-600 mt-1">Enviando para todos os {channels.length} canais ativos</p>
          )}
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSend}
            disabled={send.isPending || !text.trim()}
            className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm px-5 py-2 rounded-lg transition-colors font-medium"
          >
            {send.isPending ? '⏳ Enviando...' : '📤 Enviar agora'}
          </button>
        </div>
      </div>

      {/* History */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-medium text-gray-300 mb-4">Histórico ({broadcasts.length})</h2>

        {broadcasts.length === 0 && (
          <p className="text-gray-600 text-sm text-center py-8">Nenhum broadcast enviado ainda.</p>
        )}

        <div className="space-y-2">
          {broadcasts.map(b => (
            <div key={b.id} className="flex items-start gap-3 p-3 bg-gray-800 rounded-lg">
              {b.image_url && (
                <img src={b.image_url} alt="" className="w-12 h-12 object-cover rounded flex-shrink-0 bg-gray-700" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-gray-200 text-sm whitespace-pre-wrap line-clamp-3">{b.text}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <span className={`${badge} ${STATUS[b.status] || STATUS.pending}`}>{b.status}</span>
                  <span className="text-xs text-gray-500">{b.sent_count} enviados</span>
                  <span className="text-xs text-gray-600">{fmt(b.sent_at || b.created_at)}</span>
                  {b.channel_ids !== 'all' && (
                    <span className="text-xs text-gray-600">canais: {b.channel_ids}</span>
                  )}
                  {b.error_msg && (
                    <span className="text-xs text-red-400 truncate max-w-xs" title={b.error_msg}>{b.error_msg}</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => del.mutate(b.id)}
                className="text-gray-600 hover:text-red-400 text-sm flex-shrink-0 p-1"
                title="Remover do histórico"
              >×</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
