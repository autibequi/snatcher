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

export default function Composer() {
  const [params, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const productId = params.get('productId')
  // Suporte a múltiplos produtos: ?productIds=1,2,3 ou ?productId=1
  const productIdsParam = params.get('productIds')
  const productIds: number[] = productIdsParam
    ? productIdsParam.split(',').map(Number).filter(n => !isNaN(n) && n > 0)
    : productId ? [Number(productId)] : []
  const draftId = params.get('draftId')
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
  const [previewIndex, setPreviewIndex] = React.useState(0)

  // Carregar rascunho se draftId presente
  useQuery({
    queryKey: ['draft', draftId],
    queryFn: () => apiClient.get(`/api/dispatches/${draftId}`).then(r => r.data),
    enabled: !!draftId,
    staleTime: Infinity,
    select: (data: any) => {
      if (data?.dispatch?.message?.text && !text) {
        setText(data.dispatch.message.text)
      }
      return data
    },
  })
  const [scheduledFor, setScheduledFor] = React.useState('')
  const [showConfirm, setShowConfirm] = React.useState(false)
  const [showImageInput, setShowImageInput] = React.useState(false)
  const [imageUrl, setImageUrl] = React.useState('')
  const [tone, setTone] = React.useState('promocional')
  const [customContext, setCustomContext] = React.useState('')

  // Extrair campos NullString do Go (pode vir como {String:"...",Valid:true} ou string direta)
  const nullStr = (v: any): string => (typeof v === 'string' ? v : v?.String || v?.string || '')

  // Buscar dados de TODOS os produtos
  const { data: productsData = [] } = useQuery({
    queryKey: ['catalog-multi', productIds],
    queryFn: async () => {
      const results = await Promise.all(
        productIds.map(id => apiClient.get(`/api/catalog/${id}`).then(r => r.data?.product ?? r.data).catch(() => null))
      )
      return results.filter(Boolean)
    },
    enabled: productIds.length > 0,
    staleTime: 5 * 60_000,
    retry: 2,
  })

  // Produto principal (primeiro)
  const productData = productsData[0] ?? null

  // Imagens de todos os produtos para mosaico
  const productImages: string[] = productsData
    .map((p: any) => nullStr(p?.image_url))
    .filter(Boolean)

  // Imagem final: manual > foto crawleada do produto principal
  const rawImg = productData?.image_url
  const productImage = imageUrl
    || nullStr(rawImg)
    || (productImages[0] ?? null)

  // Dados reais do produto para substituição de variáveis
  const realProductName = nullStr(productData?.canonical_name) || productData?.canonical_name || ''
  // lowest_price vem como número direto (NullFloat64 marshala como float ou omitido)
  const realPrice = typeof productData?.lowest_price === 'number'
    ? productData.lowest_price
    : (productData?.lowest_price?.Float64 ?? 0)
  const realPriceStr = realPrice > 0 ? `R$ ${Number(realPrice).toFixed(2)}` : 'R$ --'
  const realUrl = nullStr(productData?.lowest_price_url) || ''
  const realSource = nullStr(productData?.lowest_price_source) || ''

  // Template default genérico com variáveis — só preenche se vazio e sem draft
  const DEFAULT_TEMPLATE = `🔥 OFERTA RELÂMPAGO

*{produto}*

💰 De ~{de}~ por *{por}*
🏷️ {desconto} OFF

👉 {link}`

  React.useEffect(() => {
    if (!text && !draftId) {
      setText(DEFAULT_TEMPLATE)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId])

  const loadingPreview = false

  // Lista completa de canais disponíveis (sempre carregada para seletor inline)
  const { data: allChannels = [] } = useQuery<Channel[]>({
    queryKey: ['channels', 'all'],
    queryFn: () =>
      apiClient.get('/api/channels').then((r) => {
        return Array.isArray(r.data) ? r.data : (r.data?.items ?? [])
      }),
    staleTime: 60_000,
  })

  // Seleção local sincronizada com query string ?targets=
  const [selectedTargets, setSelectedTargets] = React.useState<number[]>(targetIds)
  React.useEffect(() => { setSelectedTargets(targetIds) }, [targetsParam])

  const channels = allChannels.filter((c) => selectedTargets.includes(c.id))

  const toggleChannel = (id: number) => {
    setSelectedTargets((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const affiliateLink = params.get('affiliateLink') ?? undefined

  const dispatch = useMutation<DispatchResponse, Error, DispatchTarget[]>({
    mutationFn: (targets) => {
      const link = affiliateUrl || realUrl || ''
      // Se "de" e "por" forem iguais (sem preço original real), inflar "de" em 15% e calcular desconto
      const dePrice = realPrice > 0 ? realPrice * 1.15 : 0
      const deStr = dePrice > 0 ? `R$ ${dePrice.toFixed(2)}` : 'R$ --'
      const porStr = realPrice > 0 ? realPriceStr : 'R$ --'
      const descontoPct = dePrice > 0 && realPrice > 0
        ? Math.round((1 - realPrice / dePrice) * 100)
        : 0
      const descontoStr = descontoPct > 0 ? `-${descontoPct}%` : (realSource || '')
      // Substituir todas as variáveis com dados reais do produto
      let finalText = text
        .replace(/\{produto\}/g, realProductName || 'Produto')
        .replace(/\{de\}/g, deStr)
        .replace(/\{por\}/g, porStr)
        .replace(/\{desconto\}/g, descontoStr)
        .replace(/\{link\}/g, link)
      if (link && !finalText.includes(link)) finalText = finalText + '\n\n' + link
      return apiClient
        .post<DispatchResponse>('/api/dispatches', {
          product_id: productIds[0] ?? undefined,
          message: { text: finalText, media_url: productImage || undefined },
          affiliate_link: affiliateLink,
          scheduled_for: scheduledFor || undefined,
          targets,
        } as DispatchPayload & { scheduled_for?: string })
        .then((r) => r.data)
    },
    onSuccess: (data) => navigate(`/logs?dispatchId=${data.id}`),
  })

  const saveRascunho = useMutation({
    mutationFn: () =>
      apiClient
        .post('/api/dispatches', {
          product_id: productIds[0] ?? undefined,
          message: { text },
          targets: [],
        })
        .then((r) => r.data),
    onSuccess: () => alert('Rascunho salvo! Acesse em Logs > Rascunhos.'),
  })

  // Gerar short link rastreável com domínio próprio e tag de afiliado no redirect
  const { data: affiliateUrl = '' } = useQuery<string>({
    queryKey: ['short-link', productIds[0], realUrl, realSource],
    queryFn: () =>
      apiClient.post('/api/links/shorten', {
        url: realUrl,
        source: realSource || 'amazon',
      }).then(r => r.data?.short_url || realUrl).catch(() => realUrl),
    enabled: !!realUrl,
    staleTime: Infinity,
  })

  const rewriteMut = useMutation({
    mutationFn: () =>
      apiClient
        .post('/api/compose/preview', {
          product_id: productIds[0] ?? undefined,
          tone,
          custom_context: customContext || undefined,
        })
        .then((r) => r.data),
    onSuccess: (data: { text?: string }) => {
      if (data?.text) setText(data.text)
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Erro desconhecido na IA'
      alert(`❌ IA falhou:\n\n${msg}`)
    },
  })

  const handleDispatch = () => {
    const targets: DispatchTarget[] = selectedTargets.map((id) => ({ channel_id: id }))
    dispatch.mutate(targets)
  }

  const previewLines = text
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // Preview WA com dados reais do produto — "de" inflado 15% para simular preço original
  const previewDePrice = realPrice > 0 ? realPrice * 1.15 : 0
  const previewDeStr = previewDePrice > 0 ? `R$ ${previewDePrice.toFixed(2)}` : 'R$ --'
  const previewDescontoPct = previewDePrice > 0 && realPrice > 0
    ? Math.round((1 - realPrice / previewDePrice) * 100)
    : 0
  const previewDescontoStr = previewDescontoPct > 0 ? `-${previewDescontoPct}%` : '--%'
  const previewText = previewLines
    .replace(/{produto}/g, realProductName || 'Produto')
    .replace(/{de}/g, previewDeStr)
    .replace(/{por}/g, realPrice > 0 ? realPriceStr : 'R$ --')
    .replace(/{desconto}/g, previewDescontoStr)
    .replace(/{link}/g, affiliateUrl || realUrl || 'https://link.produto')

  const VARIABLES = ['{produto}', '{de}', '{por}', '{desconto}', '{link}']

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-fg">Compor disparo</h1>
          <p className="text-sm text-fg-3">Selecione produtos, canais, edite a mensagem e envie ou agende</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="text-sm text-fg-2 border border-border rounded-md px-3 py-1.5 disabled:opacity-50"
            disabled={!text || saveRascunho.isPending}
            onClick={() => saveRascunho.mutate()}
          >
            {saveRascunho.isPending ? 'Salvando...' : 'Salvar rascunho'}
          </button>
          <a href="/logs?status=draft" className="text-xs text-accent hover:underline">
            Ver rascunhos
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna principal: etapas 1, 2, 3 */}
        <div className="lg:col-span-2 space-y-4">

          {/* Etapa 1: Produtos */}
          <div className="bg-surface border border-border rounded-md overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between border-b border-border">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 bg-accent text-white text-xs font-bold rounded-full flex items-center justify-center">1</span>
                <p className="font-medium text-fg">Produtos ({productIds.length})</p>
              </div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => navigate('/match')} className="text-xs text-fg-2 hover:underline">
                  Trocar
                </button>
                <button type="button" onClick={() => navigate('/catalog')} className="text-xs text-accent hover:underline">
                  + Selecionar do catálogo
                </button>
              </div>
            </div>
            <div className="p-4">
              {productIds.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {productIds.map((pid, i) => {
                      const pd = productsData[i] as any
                      const img = pd ? nullStr(pd?.image_url) : null
                      const name = pd ? (nullStr(pd?.canonical_name) || pd?.canonical_name || '') : null
                      const price: number = pd?.lowest_price?.Float64 ?? pd?.lowest_price ?? 0
                      const origPrice: number = pd?.original_price?.Float64 ?? pd?.original_price ?? 0
                      const discountPct = origPrice > 0 && price > 0 && origPrice > price
                        ? Math.round((origPrice - price) / origPrice * 100)
                        : 0
                      const removeProduct = () => {
                        const next = productIds.filter(id => id !== pid)
                        const newParams = new URLSearchParams(params)
                        if (next.length > 0) {
                          newParams.set('productIds', next.join(','))
                        } else {
                          newParams.delete('productIds')
                          newParams.delete('productId')
                        }
                        setSearchParams(newParams)
                      }
                      return (
                        <div key={pid} className="relative bg-surface-2 rounded-lg overflow-hidden border border-border">
                          <button
                            type="button"
                            onClick={removeProduct}
                            className="absolute top-2 right-2 z-10 w-6 h-6 flex items-center justify-center rounded-full bg-black/50 text-white text-xs hover:bg-black/70"
                            aria-label="Remover produto"
                          >
                            ×
                          </button>
                          <div className="aspect-square w-full bg-surface flex items-center justify-center overflow-hidden">
                            {img ? (
                              <img
                                src={img}
                                alt={name || `Produto #${pid}`}
                                className="w-full h-full object-cover"
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                              />
                            ) : (
                              <span className="text-4xl">📦</span>
                            )}
                          </div>
                          <div className="p-3">
                            <p className="text-sm font-semibold text-fg leading-snug line-clamp-2">{name || `Produto #${pid}`}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              {price > 0 && (
                                <span className="text-base font-bold text-success">R$ {Number(price).toFixed(2)}</span>
                              )}
                              {discountPct > 0 && (
                                <span className="text-xs font-semibold bg-success/15 text-success rounded px-1.5 py-0.5">
                                  -{discountPct}%
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {/* Card 02: summary footer */}
                  <p className="text-xs text-fg-3 mt-3">
                    {productIds.length} mensagem{productIds.length !== 1 ? 's' : ''} × {selectedTargets.length > 0 ? selectedTargets.length : '?'} canal{selectedTargets.length !== 1 ? 'is' : ''} = {' '}
                    {selectedTargets.length > 0
                      ? <strong className="text-fg font-bold">{productIds.length * selectedTargets.length} envios</strong>
                      : <span className="italic">selecione canais abaixo</span>
                    }
                  </p>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <span className="text-4xl">📦</span>
                  <p className="text-sm text-fg-3">Selecione produtos no Match ou Catálogo</p>
                  <div className="flex gap-2 mt-1">
                    <button type="button" className="text-xs text-accent hover:underline" onClick={() => navigate('/match')}>Ir para Match</button>
                    <span className="text-fg-3">·</span>
                    <button type="button" className="text-xs text-accent hover:underline" onClick={() => navigate('/catalog')}>Ir para Catálogo</button>
                  </div>
                </div>
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
              {/* Tom da mensagem */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border flex-wrap">
                <select
                  value={tone}
                  onChange={e => setTone(e.target.value)}
                  className="text-xs border border-border rounded px-2 py-1 bg-surface text-fg focus:border-accent outline-none"
                >
                  <option value="promocional">🔥 Promocional</option>
                  <option value="animada">🎉 Animada</option>
                  <option value="chamativa">⚡ Chamativa</option>
                  <option value="urgente">⏰ Urgente</option>
                  <option value="casual">😊 Casual</option>
                  <option value="formal">🎩 Formal</option>
                  <option value="personalizado">✏️ Personalizado</option>
                </select>
                {tone === 'personalizado' && (
                  <input
                    type="text"
                    value={customContext}
                    onChange={e => setCustomContext(e.target.value)}
                    placeholder="Descreva o tom desejado..."
                    className="flex-1 text-xs border border-border rounded px-2 py-1 bg-surface text-fg focus:border-accent outline-none min-w-0"
                  />
                )}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  className={`text-xs border rounded px-2 py-1 hover:bg-surface-2 ${imageUrl ? 'border-success text-success' : 'border-border text-fg-2'}`}
                  onClick={() => setShowImageInput((prev) => !prev)}
                >
                  {imageUrl ? '🖼 Imagem carregada ✓' : '📷 Imagem do produto'}
                </button>
                <button
                  type="button"
                  className="text-xs border border-border rounded px-2 py-1 text-accent hover:bg-accent/5 disabled:opacity-50"
                  disabled={rewriteMut.isPending || productIds.length === 0}
                  title={productIds.length === 0 ? 'Selecione um produto primeiro' : undefined}
                  onClick={() => rewriteMut.mutate()}
                >
                  {rewriteMut.isPending ? '⏳ Reescrevendo...' : '✨ IA Reescrever para audiência'}
                </button>
                <span className="ml-auto text-xs text-fg-3">{text.length} caracteres</span>
              </div>
              {showImageInput && (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="flex-1 flex items-center gap-2 text-xs border border-border rounded px-2 py-1.5 bg-surface text-fg cursor-pointer hover:border-accent">
                      <span>📁</span>
                      <span className="text-fg-3">{imageUrl ? 'Imagem selecionada — clique para trocar' : 'Selecionar imagem do computador...'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          const reader = new FileReader()
                          reader.onload = () => setImageUrl(reader.result as string)
                          reader.readAsDataURL(file)
                        }}
                      />
                    </label>
                    {imageUrl && (
                      <button
                        type="button"
                        onClick={() => setImageUrl('')}
                        className="text-xs text-danger hover:text-danger/80"
                      >
                        remover
                      </button>
                    )}
                  </div>
                  {imageUrl && (
                    <img src={imageUrl} alt="Preview" className="h-20 rounded-md object-cover border border-border" />
                  )}
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
            <div className="p-4 space-y-3">
              {allChannels.length === 0 ? (
                <p className="text-sm text-fg-3">
                  Nenhum canal disponível.{' '}
                  <button type="button" className="text-accent hover:underline" onClick={() => navigate('/channels')}>
                    Criar canal
                  </button>
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs text-fg-3">
                    <span>{selectedTargets.length} de {allChannels.length} selecionado(s)</span>
                    <div className="flex gap-2">
                      <button type="button" className="text-accent hover:underline"
                        onClick={() => setSelectedTargets(allChannels.map(c => c.id))}>
                        Selecionar todos
                      </button>
                      {selectedTargets.length > 0 && (
                        <button type="button" className="text-fg-3 hover:text-fg"
                          onClick={() => setSelectedTargets([])}>
                          Limpar
                        </button>
                      )}
                      <button type="button" className="text-accent hover:underline"
                        onClick={() => navigate(productId ? `/match?productId=${productId}` : '/match')}>
                        Sugerir via Match
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                    {allChannels.map((ch) => {
                      const isSelected = selectedTargets.includes(ch.id)
                      return (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => toggleChannel(ch.id)}
                          className={`flex items-center gap-2 p-2 rounded-md border text-left transition-colors ${
                            isSelected
                              ? 'border-accent bg-accent/5'
                              : 'border-border bg-surface-2 hover:border-border-strong'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            className="accent-accent flex-shrink-0"
                          />
                          <span className="flex-1 min-w-0 truncate text-sm text-fg font-medium">
                            {ch.name}
                          </span>
                          <Badge size="sm">{ch.platform ?? 'WA'}</Badge>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

        </div>

        {/* Lateral: Preview + Resumo + Ações */}
        <div className="space-y-4">
          {/* Preview WA */}
          <div className="bg-surface border border-border rounded-md p-4">
            <p className="text-xs font-medium text-fg-2 mb-3 uppercase tracking-wide">Preview WhatsApp</p>
            <div className="bg-[#0b141a] rounded-lg p-2 min-h-32">
              {/* "Você" sender label */}
              <p className="text-xs text-[#8696a0] mb-1 ml-1">Você</p>
              <div className="bg-[#005c4b] rounded-lg max-w-xs ml-auto shadow overflow-hidden">
                {/* Single product image for currently previewed product */}
                {(() => {
                  const curImg = productImages.length > 0 ? productImages[previewIndex % productImages.length] : productImage
                  return curImg ? (
                    <img
                      src={curImg}
                      alt="Produto"
                      className="w-full max-h-48 object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  ) : null
                })()}
                <div className="p-3">
                  <p className="text-sm text-white whitespace-pre-wrap break-words">
                    {previewText || '...'}
                  </p>
                  <p className="text-xs text-green-300 mt-1 text-right opacity-60">agora ✓✓</p>
                </div>
              </div>
              {/* Pagination dots — only when multiple products */}
              {productImages.length > 1 && (
                <div className="flex items-center justify-center gap-1.5 mt-2">
                  {productImages.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPreviewIndex(i)}
                      className={`w-1.5 h-1.5 rounded-full transition-colors ${i === previewIndex % productImages.length ? 'bg-accent' : 'bg-fg-3/40'}`}
                      aria-label={`Produto ${i + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Resumo */}
          <div className="bg-surface border border-border rounded-md p-4">
            <p className="text-sm font-medium text-fg mb-3">Resumo</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-fg-2">Produtos</span><span className="text-fg font-medium">{productIds.length}</span></div>
              <div className="flex justify-between"><span className="text-fg-2">Canais</span><span className="text-fg font-medium">{channels.length}</span></div>
              <div className="flex justify-between"><span className="text-fg-2">Total de envios</span><span className="text-fg font-bold text-accent">{productIds.length * channels.length}</span></div>
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
