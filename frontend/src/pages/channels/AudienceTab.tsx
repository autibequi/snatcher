import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import AudienceEditor from '../../components/AudienceEditor'
import { apiClient } from '../../lib/apiClient'
import { sectionCard } from '../../lib/uiTokens'

const MATCH_TYPES = [
  { value: 'all', label: 'Todos os produtos' },
  { value: 'category', label: 'Categoria' },
  { value: 'brand', label: 'Marca' },
  { value: 'keyword', label: 'Palavra-chave' },
]

interface AudienceTabProps {
  channelId: string
}

export function AudienceTab({ channelId }: AudienceTabProps) {
  const id = channelId

  const { data: audience } = useQuery({
    queryKey: ['channels', id, 'audience'],
    queryFn: () => apiClient.get(`/api/channels/${id}/audience`).then(r => r.data).catch(() => ({})),
    enabled: !!id,
  })

  const { data: automationRow } = useQuery<any>({
    queryKey: ['automations', id],
    queryFn: () => apiClient.get(`/api/automations/${id}`).then(r => r.data?.automation ?? null).catch(() => null),
    enabled: !!id,
  })

  return (
    <div className="space-y-6">
      <AudienceEditor channelId={id} audience={audience} />

      {/* Filtro estrito — leitura + link para Auto disparos */}
      <div className={`${sectionCard} max-w-3xl space-y-3`}>
        <p className="text-xs font-medium text-fg">Filtro estrito (descarta antes de pontuar)</p>
        <p className="text-xs text-fg-3">
          Produtos que não passam neste filtro nem entram na pontuação. Edite em{' '}
          <Link to="/automations/channels" className="text-accent hover:underline">Auto disparos → Canais</Link>
          {' '}(drawer do canal) ou use o atalho abaixo.
        </p>
        {!automationRow ? (
          <p className="text-xs text-fg-3">Carregando…</p>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-fg-2">Tipo</dt>
            <dd className="text-fg">{MATCH_TYPES.find(t => t.value === (automationRow.match_type ?? 'all'))?.label ?? automationRow.match_type}</dd>
            {(automationRow.match_type ?? 'all') !== 'all' && (
              <>
                <dt className="text-fg-2">Valor</dt>
                <dd className="text-fg font-mono text-xs">{automationRow.match_value ?? '—'}</dd>
              </>
            )}
            <dt className="text-fg-2">Preço máximo (R$)</dt>
            <dd className="text-fg">{automationRow.max_price != null && automationRow.max_price !== '' ? Number(automationRow.max_price).toFixed(2) : '—'}</dd>
          </dl>
        )}
        <Link
          to="/automations/channels"
          className="inline-flex text-sm font-medium text-accent hover:underline"
        >
          Abrir Auto disparos →
        </Link>
      </div>
    </div>
  )
}
