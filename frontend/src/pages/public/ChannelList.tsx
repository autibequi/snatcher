import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { publicApi } from '../../lib/publicApi'

interface Target {
  id: number
  name: string
  provider: 'wa' | 'tg' | string
  status: 'ok' | 'error' | string
}

interface ChannelData {
  id: number
  name: string
  slug: string
  description: string
  targets: Target[]
}

export default function ChannelList() {
  const { slug } = useParams<{ slug: string }>()
  const [channel, setChannel] = useState<ChannelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) {
      setError('Canal não especificado')
      setLoading(false)
      return
    }

    publicApi
      .get<ChannelData>(`/channels/${slug}`)
      .then(r => setChannel(r.data))
      .catch(err => {
        if (err.response?.status === 404) {
          setError('Canal não encontrado')
        } else if (err.response?.status === 410) {
          setError('Canal inativo')
        } else {
          setError('Não foi possível carregar o canal')
        }
      })
      .finally(() => setLoading(false))
  }, [slug])

  return (
    <div className="space-y-6">
      {/* Voltar */}
      <a href="/" className="inline-flex text-sm text-accent hover:underline">
        ← Voltar
      </a>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-center py-12">
          <p className="text-2xl font-semibold text-fg mb-2">{error}</p>
          <p className="text-sm text-fg-3">
            {error === 'Canal não encontrado' && 'Verifique o URL e tente novamente.'}
          </p>
        </div>
      )}

      {/* Success */}
      {!loading && !error && channel && (
        <>
          <section className="space-y-3 py-4">
            <h1 className="text-3xl font-bold text-fg">{channel.name}</h1>
            {channel.description && (
              <p className="text-lg text-fg-2">{channel.description}</p>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-4">Grupos vinculados</h2>

            {channel.targets.filter(t => t.status === 'ok').length === 0 ? (
              <p className="text-sm text-fg-3 py-8">Nenhum grupo vinculado no momento.</p>
            ) : (
              <div className="space-y-3">
                {channel.targets
                  .filter(t => t.status === 'ok')
                  .map(target => (
                    <div
                      key={target.id}
                      className="rounded-lg border border-border bg-surface p-4 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-semibold text-fg">{target.name}</p>
                      </div>
                      <span className="inline-block px-2 py-1 text-xs font-semibold rounded bg-accent/20 text-accent">
                        {target.provider === 'wa' ? '💬 WhatsApp' : target.provider === 'tg' ? '📱 Telegram' : target.provider}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
