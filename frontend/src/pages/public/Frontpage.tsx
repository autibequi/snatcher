import { useEffect, useState } from 'react'
import { publicApi } from '../../lib/publicApi'

interface Channel {
  id: number
  name: string
  slug: string
  telegram_url: string
  member_count?: number
  description?: string
}

function ChannelCard({ ch }: { ch: Channel }) {
  return (
    <a
      href={`/canais/${ch.slug}`}
      className="block rounded-lg border border-border bg-surface p-4 hover:border-accent transition-colors"
    >
      <p className="font-semibold text-fg">{ch.name}</p>
      {ch.description && (
        <p className="mt-1 text-sm text-fg-2 line-clamp-2">{ch.description}</p>
      )}
      {ch.member_count != null && (
        <p className="mt-2 text-xs text-fg-3">{ch.member_count.toLocaleString('pt-BR')} membros</p>
      )}
    </a>
  )
}

export default function Frontpage() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    publicApi
      .get<Channel[]>('/channels')
      .then(r => setChannels(r.data ?? []))
      .catch(() => setError('Não foi possível carregar os canais.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="text-center space-y-3 py-8">
        <h1 className="text-4xl font-bold text-fg">
          Promoções <span className="text-accent">24/7</span>
        </h1>
        <p className="text-lg text-fg-2 max-w-lg mx-auto">
          Os melhores canais de promoções do Telegram, reunidos em um só lugar.
        </p>
      </section>

      {/* Canais */}
      <section>
        <h2 className="text-lg font-semibold text-fg mb-4">Canais disponíveis</h2>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <p className="text-sm text-fg-3 text-center py-8">{error}</p>
        )}

        {!loading && !error && channels.length === 0 && (
          <p className="text-sm text-fg-3 text-center py-8">Nenhum canal disponível no momento.</p>
        )}

        {channels.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {channels.map(ch => (
              <ChannelCard key={ch.id} ch={ch} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
