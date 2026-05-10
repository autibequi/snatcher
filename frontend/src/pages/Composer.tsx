import React from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Button, Spinner, PlatformPill } from '../components/ui'
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

/** Resposta GET /api/catalog/:id — produto + variantes (preço quando lowest_price do pai está vazio). */
interface CatalogRow {
  product: Record<string, unknown>
  variants: Array<{ price?: number; url?: string; source?: string; image_url?: unknown }>
}

function nullStr(v: unknown): string {
  return typeof v === 'string' ? v : ((v as { String?: string })?.String ?? (v as { string?: string })?.string ?? '')
}

/** Extrai número de preço de campos JSON da API (número, string BR/US, NullFloat64 antigo). */
function coerceMoney(v: unknown): number {
  if (v == null) return 0
  if (typeof v === 'bigint') return Number(v) > 0 ? Number(v) : 0
  if (typeof v === 'number' && Number.isFinite(v)) return v > 0 ? v : 0
  if (typeof v === 'string') {
    const t = v.trim().replace(/\s/g, '').replace(/R\$/gi, '')
    if (!t) return 0
    const n = /\d,\d{1,2}$/.test(t)
      ? parseFloat(t.replace(/\./g, '').replace(',', '.'))
      : parseFloat(t.replace(/,/g, ''))
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  if (typeof v === 'object') {
    const o = v as { Float64?: number; Valid?: boolean }
    if (typeof o.Float64 === 'number' && Number.isFinite(o.Float64) && o.Valid !== false) {
      return o.Float64 > 0 ? o.Float64 : 0
    }
  }
  return 0
}

/** Menor preço do produto ou, se inválido, mínimo nas variantes; URL/fonte alinhados à variante escolhida. */
function resolveCatalogPricing(
  product: Record<string, unknown> | null | undefined,
  variants: CatalogRow['variants'],
): { price: number; url: string; source: string } {
  let price = coerceMoney(product?.lowest_price)
  let url = nullStr(product?.lowest_price_url)
  let source = nullStr(product?.lowest_price_source)
  if (price > 0) {
    if (!url || !source) {
      for (const v of variants) {
        const pr = coerceMoney(v?.price as unknown)
        if (Math.abs(pr - price) < 0.009) {
          if (!url && v.url) url = typeof v.url === 'string' ? v.url : ''
          if (!source && v.source) source = v.source
          if (url && source) break
        }
      }
    }
    return { price, url, source }
  }
  let best: (typeof variants)[0] | undefined
  let bestPrice = Number.POSITIVE_INFINITY
  for (const v of variants) {
    const pr = coerceMoney(v?.price as unknown)
    if (pr <= 0) continue
    if (!best || pr < bestPrice) {
      best = v
      bestPrice = pr
    }
  }
  if (best && bestPrice > 0 && Number.isFinite(bestPrice)) {
    price = bestPrice
    if (!url && best.url) url = best.url
    if (!source && best.source) source = best.source
  }
  return { price, url, source }
}

/** Primeira URL útil no catálogo (pai ou qualquer variante) — shortlink / texto precisam disso mesmo quando o “melhor preço” veio sem URL. */
function collectAnyProductUrl(rows: CatalogRow[]): string {
  for (const row of rows) {
    const u = nullStr(row.product?.lowest_price_url)
    if (u) return u
    for (const v of row.variants ?? []) {
      const s = typeof v.url === 'string' ? v.url.trim() : ''
      if (s) return s
    }
  }
  return ''
}

/** Escolhe a melhor oferta entre vários GET /catalog/:id (multi‑produto): menor preço > 0; depois completa URL em falta. */
function resolveOfferAcrossCatalog(rows: CatalogRow[]): { price: number; url: string; source: string } {
  if (rows.length === 0) return { price: 0, url: '', source: '' }
  let best = { price: 0, url: '', source: '' }
  for (const row of rows) {
    const r = resolveCatalogPricing(row.product, row.variants ?? [])
    if (r.price <= 0) continue
    if (best.price === 0 || r.price < best.price) {
      best = { ...r }
    }
  }
  if (best.price > 0 && !best.url) {
    best = { ...best, url: collectAnyProductUrl(rows) }
  }
  if (best.price > 0 && !best.source) {
    for (const row of rows) {
      const s = nullStr(row.product?.lowest_price_source)
      if (s) {
        best = { ...best, source: s }
        break
      }
      for (const v of row.variants ?? []) {
        if (v.source) {
          best = { ...best, source: v.source }
          break
        }
      }
      if (best.source) break
    }
  }
  return best
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

  // Buscar dados de TODOS os produtos (inclui variantes para preço quando lowest_price está NULL)
  const { data: catalogRows = [] } = useQuery<CatalogRow[]>({
    queryKey: ['catalog-multi', productIds],
    queryFn: async () => {
      const results = await Promise.all(
        productIds.map((id) =>
          apiClient
            .get(`/api/catalog/${id}`)
            .then((r) => {
              const d = r.data as { product?: Record<string, unknown>; variants?: CatalogRow['variants'] }
              const product = d?.product ?? (r.data as Record<string, unknown>)
              const variants = Array.isArray(d?.variants) ? d!.variants! : []
              return product && typeof product === 'object' ? { product, variants } : null
            })
            .catch(() => null),
        ),
      )
      return results.filter((x): x is CatalogRow => x != null)
    },
    enabled: productIds.length > 0,
    staleTime: 5 * 60_000,
    retry: 2,
  })

  const productData = (catalogRows[0]?.product ?? null) as Record<string, unknown> | null

  // Imagens de todos os produtos para mosaico
  const productImages: string[] = catalogRows
    .map((row) => nullStr(row.product?.image_url))
    .filter(Boolean)

  // Imagem final: manual > foto crawleada do produto principal
  const rawImg = productData?.image_url
  const productImage = imageUrl
    || nullStr(rawImg)
    || (productImages[0] ?? null)

  const realProductName = React.useMemo(() => {
    for (const row of catalogRows) {
      const p = row.product
      const n = (nullStr(p?.canonical_name) || (p?.canonical_name as string) || '').trim()
      if (n) return n
    }
    return ''
  }, [catalogRows])

  const { price: realPrice, url: realUrl, source: realSource } = React.useMemo(
    () => resolveOfferAcrossCatalog(catalogRows),
    [catalogRows],
  )
  const realPriceStr = realPrice > 0 ? `R$ ${Number(realPrice).toFixed(2)}` : 'R$ --'

  const fallbackCatalogUrl = React.useMemo(
    () => collectAnyProductUrl(catalogRows),
    [catalogRows],
  )
  /** URL para shortlink / 👉 mesmo quando o melhor preço veio numa linha sem URL (fallback qualquer produto). */
  const urlForShortLink = (realUrl || fallbackCatalogUrl).trim()

  // Boilerplate WhatsApp: negrito/itálico com *…* ; preços e link são variáveis ou substituídos ao vivo
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

  /** Override opcional via ?affiliateLink= — senão usa shortlink gerado ou URL do produto (API exige affiliate_link não vazio ou HasAffiliate no produto). */
  const affiliateLinkFromQuery = params.get('affiliateLink') ?? ''

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

  // P7: verifica cobertura de afiliado para o marketplace do produto
  const { data: affCoverage } = useQuery<{ has_affiliate: boolean }>({
    queryKey: ['affiliate-coverage', realSource],
    queryFn: () =>
      apiClient.get(`/api/affiliates/coverage?marketplace=${encodeURIComponent(realSource)}`).then(r => r.data),
    enabled: !!realSource,
    staleTime: 30_000,
  })
  const missingAffiliate = !!realSource && affCoverage && !affCoverage.has_affiliate

  // Gerar short link rastreável com domínio próprio e tag de afiliado no redirect
  const { data: affiliateUrl = '' } = useQuery<string>({
    queryKey: ['short-link', productIds[0], urlForShortLink, realSource],
    queryFn: () =>
      apiClient.post('/api/links/shorten', {
        url: urlForShortLink,
        source: realSource || 'amazon',
      }).then(r => r.data?.short_url || urlForShortLink).catch(() => urlForShortLink),
    enabled: !!urlForShortLink,
    staleTime: Infinity,
  })

  /** Preços / desconto alinhados ao disparo (15% no "de" quando não há original real). */
  const composePricing = React.useMemo(() => {
    const dePrice = realPrice > 0 ? realPrice * 1.15 : 0
    const deStr = dePrice > 0 ? `R$ ${dePrice.toFixed(2)}` : 'R$ --'
    const porStr = realPrice > 0 ? realPriceStr : 'R$ --'
    const descontoPct =
      dePrice > 0 && realPrice > 0 ? Math.round((1 - realPrice / dePrice) * 100) : 0
    const descontoStr = descontoPct > 0 ? `-${descontoPct}%` : realSource || ''
    return { deStr, porStr, descontoStr, descontoPct }
  }, [realPrice, realPriceStr, realSource])

  /** Variáveis {…} + correção de textos da IA que copiam "R$ --" / tiram placeholders antes do catálogo carregar. */
  const applyComposeVariables = React.useCallback(
    (raw: string, linkResolved: string) => {
      const { deStr, porStr, descontoStr, descontoPct } = composePricing
      let t = raw
        .replace(/\{produto\}/g, realProductName || 'Produto')
        .replace(/\{de\}/g, deStr)
        .replace(/\{por\}/g, porStr)
        .replace(/\{desconto\}/g, descontoStr)
        .replace(/\{link\}/g, linkResolved)
      if (realProductName) {
        t = t.replace(/\*Produto\*/g, `*${realProductName}*`)
      }
      if (realPrice > 0) {
        const priceBlock = `💰 De ~${deStr}~ por *${porStr}*`
        const variants = [
          /💰\s*De\s+R\$\s*--\s*por\s+R\$\s*--/gi,
          /💰\s*De\s*~\s*R\$\s*--\s*~\s*por\s*\*?\s*R\$\s*--/gi,
          /💰\s*De\s*~\s*R\$\s*--\s*por\s+R\$\s*--/gi,
          /De\s+R\$\s*--\s*por\s+R\$\s*--/gi,
          /De\s*~\s*R\$\s*--\s*~\s*por\s*\*?\s*R\$\s*--/gi,
        ]
        for (const re of variants) {
          t = t.replace(re, priceBlock)
        }
        t = t.replace(/De\s+R\$\s*--/gi, `De ~${deStr}~`)
        t = t.replace(/por\s+R\$\s*--/gi, `por *${porStr}*`)
        if (descontoPct > 0) {
          t = t.replace(/🏷️[^\n]*OFF\b/gi, `🏷️ ${descontoStr} OFF`)
        } else if (descontoStr && realSource) {
          t = t.replace(/🏷️\s*(?:OFF|--|%?\s*OFF)\b/gi, `🏷️ ${descontoStr}`)
        }
      }
      if (linkResolved && !t.includes(linkResolved)) {
        t = t.replace(/👉\s*$/gm, `👉 ${linkResolved}`)
        t = t.replace(/👉\s*\n/g, `👉 ${linkResolved}\n`)
      }
      return t
    },
    [composePricing, realProductName, realPrice, realSource],
  )

  /** Catálogo / shortlink podem chegar depois do texto (IA, rascunho): reaplica variáveis e corrige “R$ --”. */
  React.useEffect(() => {
    setText((prev) => {
      if (!prev.trim()) return prev
      const hasVars = /\{produto\}|\{de\}|\{por\}|\{desconto\}|\{link\}/.test(prev)
      const hasStalePrice = /R\$\s*--/.test(prev)
      const preferredLink = affiliateUrl || urlForShortLink || ''
      const needsLinkFix =
        !!preferredLink && /👉/.test(prev) && !prev.includes(preferredLink)
      const needsNameFix = !!(realProductName && /\*Produto\*/.test(prev))
      const needsDiscountFix =
        realPrice > 0 && /🏷️/.test(prev) && !/-\d+%/.test(prev) && composePricing.descontoPct > 0
      if (!hasVars && !hasStalePrice && !needsLinkFix && !needsNameFix && !needsDiscountFix)
        return prev
      const next = applyComposeVariables(prev, preferredLink)
      return next !== prev ? next : prev
    })
  }, [
    realPrice,
    urlForShortLink,
    affiliateUrl,
    applyComposeVariables,
    realProductName,
    composePricing.descontoPct,
  ])

  const dispatch = useMutation<DispatchResponse, Error, DispatchTarget[]>({
    mutationFn: (targets) => {
      const link = affiliateUrl || urlForShortLink || ''
      const resolvedAffiliateLink = affiliateLinkFromQuery || affiliateUrl || urlForShortLink || ''
      let finalText = applyComposeVariables(text, link)
      if (link && !finalText.includes(link)) finalText = `${finalText}\n\n${link}`
      return apiClient
        .post<DispatchResponse>('/api/dispatches', {
          product_id: productIds[0] ?? undefined,
          message: { text: finalText, media_url: productImage || undefined },
          affiliate_link: resolvedAffiliateLink,
          scheduled_for: scheduledFor || undefined,
          targets,
        } as DispatchPayload & { scheduled_for?: string })
        .then((r) => r.data)
    },
    onSuccess: (data) => navigate(`/logs?dispatchId=${data.id}`),
    onError: (err: any) => {
      const status = err?.response?.status
      const detail = err?.response?.data?.error ?? err?.message ?? 'erro desconhecido'
      if (status === 422) {
        alert(`⚠️ ${detail}\n\nVá em "Afiliados" para configurar o programa do marketplace deste produto.`)
      } else {
        alert(`Erro ao disparar (HTTP ${status ?? '?'}): ${detail}`)
      }
    },
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
      if (!data?.text) return
      const link = affiliateUrl || urlForShortLink || ''
      setText(applyComposeVariables(data.text, link))
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

  const previewLink = affiliateUrl || urlForShortLink || 'https://link.produto'
  const previewText = applyComposeVariables(previewLines, previewLink)

  const VARIABLES = ['{produto}', '{de}', '{por}', '{desconto}', '{link}']

  /** Só o cartão WhatsApp — no telefone fica sticky no topo; no desktop vai na lateral. */
  const previewWACard = (
    <div className="rounded-xl border border-border bg-gradient-to-b from-surface to-surface-2/80 p-3 sm:p-4 shadow-sm ring-1 ring-border/60">
      <div className="flex items-center justify-between gap-2 mb-2 md:mb-3">
        <p className="text-xs font-semibold text-fg uppercase tracking-wide">Preview</p>
        <span className="text-[10px] text-fg-3 font-medium px-2 py-0.5 rounded-full bg-surface border border-border">Ao vivo</span>
      </div>
      <div className="rounded-2xl bg-[#0b141a] p-2 sm:p-3 shadow-inner ring-1 ring-black/20">
        <p className="text-[11px] text-[#8696a0] mb-1.5 ml-1">Você</p>
        <div className="bg-[#005c4b] rounded-xl max-w-[min(100%,280px)] ml-auto shadow-lg overflow-hidden ring-1 ring-white/10">
          {(() => {
            const curImg = productImages.length > 0 ? productImages[previewIndex % productImages.length] : productImage
            return curImg ? (
              <img
                src={curImg}
                alt="Produto"
                className="w-full max-h-32 md:max-h-44 object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            ) : null
          })()}
          <div className="p-2.5 sm:p-3 sm:pt-2 max-h-[28vh] md:max-h-none overflow-y-auto">
            <p className="text-[12px] sm:text-[13px] leading-snug text-white whitespace-pre-wrap break-words">
              {previewText || '…'}
            </p>
            <p className="text-[10px] text-emerald-300/90 mt-1.5 text-right tabular-nums">agora ✓✓</p>
          </div>
        </div>
        {productImages.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 mt-2 sm:mt-3">
            {productImages.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPreviewIndex(i)}
                className={`h-2 rounded-full transition-all ${i === previewIndex % productImages.length ? 'w-5 bg-accent' : 'w-2 bg-fg-3/35 hover:bg-fg-3/55'}`}
                aria-label={`Produto ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )

  /** Resumo + agendar + afiliado + CTAs — em desktop na lateral; em mobile só no fim do formulário */
  const composerMetaActions = (
    <>
      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <p className="text-sm font-semibold text-fg mb-3">Resumo</p>
        <div className="space-y-2.5 text-sm">
          <div className="flex justify-between gap-4"><span className="text-fg-2">Produtos</span><span className="text-fg font-medium tabular-nums">{productIds.length}</span></div>
          <div className="flex justify-between gap-4"><span className="text-fg-2">Canais</span><span className="text-fg font-medium tabular-nums">{channels.length}</span></div>
          <div className="h-px bg-border my-1" />
          <div className="flex justify-between gap-4"><span className="text-fg-2">Total de envios</span><span className="text-fg font-bold text-accent tabular-nums">{productIds.length * channels.length}</span></div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <label className="text-xs font-medium text-fg-2 block mb-1.5">Agendar para</label>
        <input
          type="datetime-local"
          value={scheduledFor}
          onChange={(e) => setScheduledFor(e.target.value)}
          className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-surface-2 text-fg focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
        />
        {scheduledFor && (
          <button type="button" onClick={() => setScheduledFor('')}
            className="text-xs text-fg-3 hover:text-danger mt-2">Remover agendamento</button>
        )}
      </div>

      {missingAffiliate && (
        <div className="rounded-xl p-4 bg-danger/10 border border-danger/35 shadow-sm">
          <p className="text-xs font-semibold text-danger mb-1">
            Sem código de afiliado para &quot;{realSource}&quot;
          </p>
          <p className="text-xs text-fg-2 mb-3 leading-relaxed">
            Configure um programa em <strong>Afiliados</strong> antes de disparar.
          </p>
          <button
            type="button"
            onClick={() => navigate('/affiliates')}
            className="text-xs font-medium text-accent hover:underline"
          >
            Ir para Afiliados →
          </button>
        </div>
      )}

      <div className="space-y-2 pt-1">
        <Button
          variant="primary"
          className="w-full h-11 text-sm font-semibold shadow-md shadow-accent/10"
          disabled={!text || channels.length === 0 || dispatch.isPending || missingAffiliate}
          onClick={() => setShowConfirm(true)}
          title={missingAffiliate ? 'Configure um programa de afiliado primeiro' : undefined}
        >
          {dispatch.isPending ? '⌛ Enviando...' : scheduledFor ? '📅 Agendar disparo' : '✈ Disparar agora'}
        </Button>
        <Button variant="ghost" className="w-full h-10 text-sm" onClick={() => navigate(-1)}>
          Cancelar
        </Button>
      </div>
    </>
  )

  const previewAsideDesktop = (
    <>
      {previewWACard}
      {composerMetaActions}
    </>
  )

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-4 md:py-6">
      <div className="flex flex-wrap justify-end gap-2 mb-6 md:mb-8">
        <button
          type="button"
          className="text-sm text-fg-2 border border-border rounded-lg px-3 py-2 hover:bg-surface-2 disabled:opacity-50 transition-colors"
          disabled={!text || saveRascunho.isPending}
          onClick={() => saveRascunho.mutate()}
        >
          {saveRascunho.isPending ? 'Salvando...' : 'Salvar rascunho'}
        </button>
        <a href="/logs?status=draft" className="text-xs text-accent hover:underline py-2 px-1">
          Ver rascunhos
        </a>
      </div>

      {/* md+: duas colunas — antes era só lg:, por isso “quebrava” cedo demais */}
      <div className="flex flex-col md:flex-row md:items-start md:gap-8 lg:gap-10">
        {/* Telas estreitas: só o preview fica sticky; resumo e disparar ficam após as etapas */}
        <div className="md:hidden sticky top-0 z-20 -mx-4 px-4 py-2 mb-3 bg-bg/95 backdrop-blur-md border-b border-border/80">
          {previewWACard}
        </div>

        {/* Coluna formulário: scroll próprio só em md+ para não competir com o preview */}
        <div className="order-2 md:order-1 flex-1 min-w-0 md:max-h-[calc(100vh-8.25rem)] md:overflow-y-auto md:overscroll-contain md:pr-1 space-y-4 md:[scrollbar-gutter:stable]">

          {/* Etapa 1: Produtos */}
          <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 flex items-center justify-between border-b border-border bg-surface-2/30">
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
                      const row = catalogRows[i]
                      const pd = row?.product as Record<string, unknown> | undefined
                      const img = pd ? nullStr(pd?.image_url) : null
                      const name = pd ? (nullStr(pd?.canonical_name) || (pd?.canonical_name as string) || '') : null
                      const { price } = resolveCatalogPricing(pd ?? null, row?.variants ?? [])
                      const origPrice: number =
                        (pd?.original_price as { Float64?: number } | undefined)?.Float64 ??
                        (typeof pd?.original_price === 'number' ? pd.original_price : 0)
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
          <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 flex flex-wrap gap-2 items-center justify-between border-b border-border bg-surface-2/30">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 bg-accent text-white text-xs font-bold rounded-full flex items-center justify-center">2</span>
                <p className="font-medium text-fg">Template da mensagem</p>
              </div>
              <span className="text-[11px] text-fg-3 flex flex-wrap items-center gap-x-1 gap-y-1">
                Variáveis:
                {VARIABLES.map(v => (
                  <button key={v} type="button" onClick={() => setText(t => t + v)} className="font-mono text-[11px] text-accent hover:underline px-1 rounded bg-accent/5">{v}</button>
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
                  placeholder={`🔥 OFERTA RELÂMPAGO\n\n*{produto}*\n\n💰 De ~{de}~ por *{por}*\n🏷️ {desconto} OFF\n\n👉 {link}`}
                />
              )}
              {/* Imagem do produto — em cima */}
              <div className="mt-3 pt-3 border-t border-border">
                <div className="flex items-center gap-2">
                  <label className={`flex items-center gap-1.5 text-xs border rounded px-2 py-1.5 cursor-pointer hover:bg-surface-2 ${imageUrl ? 'border-success text-success' : 'border-border text-fg-2'}`}>
                    <span>{imageUrl ? '🖼' : '📷'}</span>
                    <span>{imageUrl ? 'Imagem carregada ✓ (trocar)' : 'Imagem do produto'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        const reader = new FileReader()
                        reader.onload = () => { setImageUrl(reader.result as string); setShowImageInput(false) }
                        reader.readAsDataURL(file)
                      }}
                    />
                  </label>
                  {imageUrl && (
                    <>
                      <img src={imageUrl} alt="" className="h-8 w-8 rounded object-cover border border-border" />
                      <button type="button" onClick={() => setImageUrl('')} className="text-xs text-danger">remover</button>
                    </>
                  )}
                </div>
              </div>

              {/* Tom + IA Reescrever — juntos embaixo */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
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
                    placeholder="Descreva o tom..."
                    className="flex-1 text-xs border border-border rounded px-2 py-1 bg-surface text-fg focus:border-accent outline-none min-w-[120px]"
                  />
                )}
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
            </div>
          </div>

          {/* Etapa 3: Canais destino */}
          <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 flex items-center justify-between border-b border-border bg-surface-2/30">
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
                          <PlatformPill platform={ch.platform ?? 'whatsapp'} />
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Mobile: resumo + agendar + disparar depois das etapas (fluxo natural) */}
          <div className="md:hidden space-y-4 pb-8">
            {composerMetaActions}
          </div>

        </div>

        {/* md+: duas colunas — breakpoint md (768px), não lg — preview + painel na lateral */}
        <aside className="hidden md:flex flex-col order-1 md:order-2 w-full md:w-[min(100%,380px)] lg:w-[400px] shrink-0 gap-4 md:sticky md:top-4 md:self-start md:max-h-[calc(100vh-8.25rem)] md:overflow-y-auto md:overscroll-contain md:pb-4 md:pl-6 md:ml-2 md:border-l md:border-border/70">
          {previewAsideDesktop}
        </aside>
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
