import React from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Button, Spinner, Badge } from '../components/ui'
import { apiClient } from '../lib/apiClient'

interface Channel {
  id: number
  name: string
  platform: string
}

interface DispatchTarget {
  channel_id: number
}

interface DispatchPayload {
  product_id?: number
  message: { text: string }
  affiliate_link?: string
  targets: DispatchTarget[]
}

interface DispatchResponse {
  id: number
}

interface ComposePreviewResponse {
  text?: string
}

export default function Composer() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const productId = params.get('productId')
  const targetsParam = params.get('targets') ?? ''
  const targetIds = React.useMemo(
    () =>
      targetsParam
        .split(',')
        .map(Number)
        .filter((n) => !Number.isNaN(n) && n > 0),
    [targetsParam]
  )

  const [text, setText] = React.useState('')
  const [scheduledFor, setScheduledFor] = React.useState('')
  const [showConfirm, setShowConfirm] = React.useState(false)
  const [showImageInput, setShowImageInput] = React.useState(false)
  const [imageUrl, setImageUrl] = React.useState('')

  // Buscar preview gerado pelo LLM — onSuccess nao existe em RQ5, usar useEffect
  const { data: previewData, isLoading: loadingPreview } = useQuery<ComposePreviewResponse>({
    queryKey: ['compose', 'preview', productId],
    queryFn: () =>
      apiClient
        .post('/api/compose/preview', {
          product_id: productId ? Number(productId) : undefined,
        })
        .then((r) => r.data),
    enabled: !!productId,
    staleTime: Infinity,
  })

  React.useEffect(() => {
    if (previewData?.text && !text) {
      setText(previewData.text)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewData])

  // Buscar detalhes dos canais selecionados
  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: ['channels', targetIds],
    queryFn: () =>
      apiClient.get('/api/channels').then((r) => {
        const all: Channel[] = Array.isArray(r.data) ? r.data : (r.data?.items ?? [])
        return targetIds.length > 0
          ? all.filter((c) => targetIds.includes(c.id))
          : all
      }),
    enabled: targetIds.length > 0,
  })

  const affiliateLink = params.get('affiliateLink') ?? undefined

  const dispatch = useMutation<DispatchResponse, Error, DispatchTarget[]>({
    mutationFn: (targets) =>
      apiClient
        .post<DispatchResponse>('/api/dispatches', {
          product_id: productId ? Number(productId) : undefined,
          message: { text },
          affiliate_link: affiliateLink,
          scheduled_for: scheduledFor || undefined,
          targets,
        } as DispatchPayload & { scheduled_for?: string })
        .then((r) => r.data),
    onSuccess: (data) => navigate(`/logs?dispatchId=${data.id}`),
  })

  const saveRascunho = useMutation({
    mutationFn: () =>
      apiClient
        .post('/api/dispatches', {
          product_id: productId ? Number(productId) : undefined,
          message: { text },
          targets: [],
        })
        .then((r) => r.data),
    onSuccess: () => alert('Rascunho salvo! Acesse em Logs > Rascunhos.'),
  })

  const encurtar = useMutation({
    mutationFn: () =>
      productId
        ? apiClient
            .post('/api/affiliates/build-link', {
              product_url: `https://example.com/produto/${productId}`,
              marketplace: 'amazon',
            })
            .then((r) => r.data.url)
        : Promise.resolve('https://snatcher.link/' + Math.random().toString(36).slice(2, 8)),
    onSuccess: (url: string) => {
      setText((t) => t.replace('{link}', url))
      setImageUrl('')
    },
  })

  const rewriteMut = useMutation({
    mutationFn: () =>
      apiClient
        .post('/api/compose/preview', {
          product_id: productId ? Number(productId) : undefined,
        })
        .then((r) => r.data),
    onSuccess: (data: { text?: string }) => {
      if (data?.text) setText(data.text)
    },
  })

  const handleDispatch = () => {
    const targets: DispatchTarget[] =
      targetIds.length > 0
        ? targetIds.map((id) => ({ channel_id: id }))
        : channels.map((c) => ({ channel_id: c.id }))
    dispatch.mutate(targets)
  }

  const previewLines = text
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const previewText = previewLines
    .replace(/{produto}/g, 'Produto')
    .replace(/{de}/g, '149,90')
    .replace(/{por}/g, '89,90')
    .replace(/{desconto}/g, '-40%')
    .replace(/{link}/g, 'https://snatcher.link/1')

  const VARIABLES = ['{produto}', '{de}', '{por}', '{desconto}', '{link}']

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-fg">Compor disparo</h1>
          <p className="text-sm text-fg-3">Selecione produtos, canais, edite a mensagem e envie ou agende</p>
        </div>
        <button
          className="text-sm text-fg-2 border border-border rounded-md px-3 py-1.5 disabled:opacity-50"
          disabled={!text || saveRascunho.isPending}
          onClick={() => saveRascunho.mutate()}
        >
          {saveRascunho.isPending ? 'Salvando...' : 'Salvar rascunho'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna principal: etapas 1, 2, 3 */}
        <div className="lg:col-span-2 space-y-4">

          {/* Etapa 1: Produtos */}
          <div className="bg-surface border border-border rounded-md overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between border-b border-border">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 bg-accent text-white text-xs font-bold rounded-full flex items-center justify-center">1</span>
                <p className="font-medium text-fg">Produtos ({productId ? 1 : 0})</p>
              </div>
              <button type="button" onClick={() => navigate('/catalog')} className="text-xs text-accent hover:underline">
                + Selecionar do catálogo
              </button>
            </div>
            <div className="p-4">
              {productId ? (
                <div className="flex items-center gap-3 p-2 bg-surface-2 rounded-md">
                  <span className="text-fg font-mono text-xs">Produto #{productId}</span>
                  <button type="button" onClick={() => navigate('/match')} className="text-xs text-accent hover:underline ml-auto">Trocar</button>
                </div>
              ) : (
                <p className="text-sm text-fg-3">
                  Nenhum produto.{' '}
                  <button type="button" className="text-accent hover:underline" onClick={() => navigate('/match')}>Escolher via Match</button>
                </p>
              )}
            </div>
          </div>

          {/* Etapa 2: Template */}
          <div className="bg-surface border border-border rounded-md overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between border-b border-border">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 bg-accent text-white text-xs font-bold rounded-full flex items-center justify-center">2</span>
                <p className="font-medium text-fg">Template da mensagem</p>
              </div>
              <span className="text-xs text-fg-3">
                Variáveis:{' '}
                {VARIABLES.map(v => (
                  <button key={v} type="button" onClick={() => setText(t => t + v)} className="font-mono text-accent hover:underline mr-1">{v}</button>
                ))}
              </span>
            </div>
            <div className="p-4">
              {loadingPreview && !text ? (
                <div className="flex items-center gap-2 text-fg-3 text-sm py-3">
                  <Spinner size="sm" /> Gerando com IA...
                </div>
              ) : (
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  rows={6}
                  className="w-full resize-none text-sm text-fg bg-transparent outline-none placeholder:text-fg-3"
                  placeholder={'🔥 OFERTA RELÂMPAGO\n\n*{produto}*\n\nDe ~{de}~ por *{por}*\n{desconto} OFF\n{link}'}
                />
              )}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                <button
                  type="button"
                  className="text-xs border border-border rounded px-2 py-1 text-fg-2 hover:bg-surface-2"
                  onClick={() => setShowImageInput((prev) => !prev)}
                >
                  📷 Imagem do produto
                </button>
                <button
                  type="button"
                  className="text-xs border border-border rounded px-2 py-1 text-fg-2 hover:bg-surface-2 disabled:opacity-50"
                  disabled={encurtar.isPending}
                  onClick={() => encurtar.mutate()}
                >
                  {encurtar.isPending ? '⏳ Encurtando...' : '🔗 Encurtador'}
                </button>
                <button
                  type="button"
                  className="text-xs border border-border rounded px-2 py-1 text-accent hover:bg-accent/5 disabled:opacity-50"
                  disabled={rewriteMut.isPending}
                  onClick={() => rewriteMut.mutate()}
                >
                  {rewriteMut.isPending ? '⏳ Reescrevendo...' : '✨ IA Reescrever para audiência'}
                </button>
                <span className="ml-auto text-xs text-fg-3">{text.length} caracteres</span>
              </div>
              {showImageInput && (
                <div className="mt-2 flex gap-2">
                  <input
                    className="flex-1 text-xs border border-border rounded px-2 py-1 bg-surface text-fg outline-none focus:border-accent"
                    placeholder="URL da imagem..."
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setText((t) => t + (imageUrl ? `\n\n🖼 ${imageUrl}` : ''))
                      setShowImageInput(false)
                      setImageUrl('')
                    }}
                    className="text-xs bg-accent text-white px-2 py-1 rounded"
                  >
                    OK
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Etapa 3: Canais destino */}
          <div className="bg-surface border border-border rounded-md overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between border-b border-border">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 bg-accent text-white text-xs font-bold rounded-full flex items-center justify-center">3</span>
                <p className="font-medium text-fg">Canais destino</p>
                {channels.length > 0 && (
                  <span className="text-xs text-fg-3">{channels.length} canal{channels.length !== 1 ? 'is' : ''}</span>
                )}
              </div>
            </div>
            <div className="p-4">
              {channels.length === 0 ? (
                <p className="text-sm text-fg-3">
                  Selecione canais no{' '}
                  <button type="button" className="text-accent hover:underline" onClick={() => navigate(productId ? `/match?productId=${productId}` : '/match')}>Match</button>.
                </p>
              ) : (
                <div className="space-y-2">
                  {channels.map(ch => (
                    <div key={ch.id} className="flex items-center gap-2 text-sm">
                      <span className="text-fg font-medium">{ch.name}</span>
                      <Badge size="sm">{ch.platform ?? 'WA'}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Lateral: Preview + Resumo + Ações */}
        <div className="space-y-4">
          {/* Preview WA */}
          <div className="bg-surface border border-border rounded-md p-4">
            <p className="text-xs font-medium text-fg-2 mb-3 uppercase tracking-wide">Preview WhatsApp</p>
            <div className="bg-[#0b141a] rounded-lg p-3 min-h-32">
              <div className="bg-[#005c4b] rounded-lg p-3 max-w-xs ml-auto shadow">
                <p className="text-sm text-white whitespace-pre-wrap break-words">
                  {previewText || '...'}
                </p>
                <p className="text-xs text-green-300 mt-1 text-right opacity-60">agora ✓✓</p>
              </div>
            </div>
          </div>

          {/* Resumo */}
          <div className="bg-surface border border-border rounded-md p-4">
            <p className="text-sm font-medium text-fg mb-3">Resumo</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-fg-2">Produtos</span><span className="text-fg font-medium">{productId ? 1 : 0}</span></div>
              <div className="flex justify-between"><span className="text-fg-2">Canais</span><span className="text-fg font-medium">{channels.length}</span></div>
              <div className="flex justify-between"><span className="text-fg-2">Total de envios</span><span className="text-fg font-bold text-accent">{channels.length * Math.max(1, productId ? 1 : 0)}</span></div>
            </div>
          </div>

          {/* Agendamento */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-fg-2">Agendar para</label>
            <input
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              className="text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg"
            />
            {scheduledFor && (
              <button type="button" onClick={() => setScheduledFor('')}
                className="text-xs text-fg-3 hover:text-danger">× Remover agendamento</button>
            )}
          </div>

          {/* Ações */}
          <div className="space-y-2">
            <Button
              variant="primary"
              className="w-full"
              disabled={!text || channels.length === 0 || dispatch.isPending}
              onClick={() => setShowConfirm(true)}
            >
              {dispatch.isPending ? '⌛ Enviando...' : scheduledFor ? '📅 Agendar disparo' : '✈ Disparar agora'}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => navigate(-1)}>
              Cancelar
            </Button>
          </div>
        </div>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowConfirm(false)}>
          <div
            className="bg-surface border border-border rounded-lg p-6 max-w-sm w-full mx-4 shadow-modal"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-semibold text-fg mb-2">Confirmar disparo</h3>
            <p className="text-sm text-fg-2 mb-4">
              A mensagem será enviada para os grupos selecionados. Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-sm rounded-md bg-surface-2 text-fg-2 hover:bg-border"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => { setShowConfirm(false); handleDispatch() }}
                className="px-4 py-2 text-sm rounded-md bg-accent text-white hover:bg-accent-hover"
              >
                Confirmar disparo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
