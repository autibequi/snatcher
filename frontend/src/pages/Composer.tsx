import React from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Badge, Button, Spinner, PlatformPill, PageHeader } from '../components/ui'
import { apiClient } from '../lib/apiClient'
import { formGroup, formLabel, formHint, sectionCard, sectionTitle, switchRow, pageContainer } from '../lib/uiTokens'
import { MessagePreview } from '../components/MessagePreview'
import { authFetchJSON } from '../lib/authFetch'

interface MessageTemplate {
  id: number
  category_slug: string
  body: string
  weight: number
  enabled: boolean
}

/** Converte variáveis do formato DB ({titulo},{preco_de},...) para o formato do Composer ({produto},{de},...). */
function dbBodyToComposer(body: string): string {
  return body
    .replace(/\{titulo\}/g, '{produto}')
    .replace(/\{preco_de\}/g, '{de}')
    .replace(/\{preco_por\}/g, '{por}')
    .replace(/\{emoji\}/g, '🔥')
}

function TemplateDropdown({ onSelect }: { onSelect: (body: string) => void }) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const ref = React.useRef<HTMLDivElement>(null)

  const { data: templates = [] } = useQuery<MessageTemplate[]>({
    queryKey: ['composer-templates'],
    queryFn: () => authFetchJSON<MessageTemplate[]>('/api/admin/templates', []),
    staleTime: 5 * 60_000,
    select: (data) => data.filter((t) => t.enabled),
  })

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase()
    return templates.filter(
      (t) => !q || t.body.toLowerCase().includes(q) || t.category_slug.toLowerCase().includes(q),
    )
  }, [templates, search])

  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs border border-border rounded px-2 py-1 text-fg-2 hover:bg-surface-2 flex items-center gap-1"
        title="Escolher template cadastrado"
      >
        📋 Templates {templates.length > 0 && <span className="text-fg-3">({templates.length})</span>}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-80 bg-surface border border-border rounded-lg shadow-lg flex flex-col max-h-72">
          <div className="p-2 border-b border-border">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar template..."
              className="w-full text-xs border border-border rounded px-2 py-1.5 bg-bg focus:outline-none focus:border-accent"
            />
          </div>

          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 && (
              <p className="text-xs text-fg-3 text-center py-4">Nenhum resultado</p>
            )}
            {filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-surface-2 border-b border-border/40 last:border-b-0"
                onClick={() => {
                  onSelect(dbBodyToComposer(t.body))
                  setOpen(false)
                  setSearch('')
                }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 font-medium">
                    {t.category_slug}
                  </span>
                  <span className="text-[10px] text-fg-3">peso {t.weight}</span>
                </div>
                <p className="text-xs text-fg leading-snug line-clamp-2 whitespace-pre-wrap font-sans">
                  {t.body.slice(0, 80)}{t.body.length > 80 ? '…' : ''}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface Channel {
  id: number
  name: string
  quality_threshold: number
  daily_cap: number
  active: boolean
}

interface ChannelGroup {
  id: number
  name: string
  platform: string
  whatsapp_jid?: string
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

/** Primeira URL útil no catálogo (pai ou qualquer variante) — shortlink / texto precisam disso mesmo quando o "melhor preço" veio sem URL. */
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
    retry: false,
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

  const { data: allChannels = [] } = useQuery<Channel[]>({
    queryKey: ['channels-for-composer'],
    queryFn: () => apiClient.get('/api/channels').then(r => (Array.isArray(r.data) ? r.data : [])).catch(() => []),
    staleTime: 30_000,
    select: (data) => data.filter(c => c.active),
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
  const { data: affiliateUrl = '', isPending: shortLinkPending } = useQuery<string>({
    queryKey: ['short-link', productIds[0], urlForShortLink, realSource],
    queryFn: () =>
      apiClient
        .post('/api/links/shorten', {
          url: urlForShortLink,
          source: realSource || 'amazon',
        })
        .then((r) => (typeof r.data?.short_url === 'string' ? r.data.short_url : ''))
        .catch(() => ''),
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

  /** Catálogo / shortlink podem chegar depois do texto (IA, rascunho): reaplica variáveis e corrige "R$ --". */
  React.useEffect(() => {
    setText((prev) => {
      if (!prev.trim()) return prev
      const hasVars = /\{produto\}|\{de\}|\{por\}|\{desconto\}|\{link\}/.test(prev)
      const hasStalePrice = /R\$\s*--/.test(prev)
      const preferredLink = affiliateUrl || ''
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
    mutationFn: async (targets) => {
      const link = affiliateUrl || ''
      let finalText = applyComposeVariables(text, link)
      if (link && !finalText.includes(link)) finalText = `${finalText}\n\n${link}`

      // Expande canais → grupos e dispara via endpoint manual
      const channelIds = targets.map(t => t.channel_id)
      const groupIds: number[] = []
      for (const cid of channelIds) {
        const detail = await apiClient.get(`/api/channels/${cid}`).then(r => r.data).catch(() => null)
        if (detail?.groups) {
          for (const g of detail.groups) groupIds.push(g.id)
        }
      }
      if (groupIds.length === 0) throw new Error('Nenhum grupo vinculado aos canais selecionados')

      await apiClient.post('/api/dispatch/manual', {
        group_ids: groupIds,
        message: finalText,
        image_url: productImage || undefined,
      })
      return { id: Date.now() }
    },
    onSuccess: () => navigate('/activity'),
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
      const link = affiliateUrl || ''
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

  const previewLink = affiliateUrl || (urlForShortLink ? '… gerando link curto …' : 'https://link.produto')
  const previewText = applyComposeVariables(previewLines, previewLink)

  const VARIABLES = ['{produto}', '{de}', '{por}', '{desconto}', '{link}']

  /** Só o cartão WhatsApp — no telefone fica sticky no topo; no desktop vai na lateral. */
  const curPreviewImg =
    productImages.length > 0
      ? productImages[previewIndex % productImages.length]
      : productImage

  const previewWACard = (
    <div className={sectionCard}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className={sectionTitle}>Preview</p>
        <span className="text-[10px] text-fg-3 font-medium px-2 py-0.5 rounded-full bg-surface-2 border border-border">Ao vivo</span>
      </div>
      <MessagePreview
        text={previewText || '…'}
        mediaUrl={curPreviewImg || null}
        variant="wa-bubble"
        maxHeight={typeof window !== 'undefined' && window.innerWidth < 768 ? 120 : undefined}
      />
      {productImages.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
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
  )

  /** Resumo + agendar + afiliado + CTAs — em desktop na lateral; em mobile só no fim do formulário */
  const composerMetaActions = (
    <>
      {/* Resumo */}
      <div className={sectionCard}>
        <p className={`${sectionTitle} mb-3`}>Resumo</p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between gap-4"><span className="text-fg-2">Produtos</span><span className="text-fg font-medium tabular-nums">{productIds.length}</span></div>
          <div className="flex justify-between gap-4"><span className="text-fg-2">Canais</span><span className="text-fg font-medium tabular-nums">{channels.length}</span></div>
          <div className="h-px bg-border" />
          <div className="flex justify-between gap-4"><span className="text-fg-2">Total</span><span className="text-fg font-bold text-accent tabular-nums">{productIds.length * channels.length} envios</span></div>
        </div>
      </div>

      {/* Agendamento */}
      <div className={sectionCard}>
        <div className={formGroup}>
          <label className={formLabel}>Agendar para</label>
          <input
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-surface-2 text-fg focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
          {scheduledFor && (
            <button type="button" onClick={() => setScheduledFor('')} className={`${formHint} hover:text-danger`}>
              Remover agendamento
            </button>
          )}
        </div>
      </div>

      {missingAffiliate && (
        <div className="rounded-lg p-4 bg-danger/10 border border-danger/35">
          <p className="text-xs font-semibold text-danger mb-1">Sem afiliado para &quot;{realSource}&quot;</p>
          <button type="button" onClick={() => navigate('/affiliates')} className="text-xs font-medium text-accent hover:underline">
            Configurar Afiliados →
          </button>
        </div>
      )}

      {/* CTAs */}
      <div className="space-y-2">
        <Button
          variant="primary"
          className="w-full h-11 text-sm font-semibold"
          disabled={
            !text ||
            channels.length === 0 ||
            dispatch.isPending ||
            missingAffiliate ||
            (!!urlForShortLink && shortLinkPending && !affiliateLinkFromQuery)
          }
          onClick={() => setShowConfirm(true)}
          title={missingAffiliate ? 'Configure um programa de afiliado primeiro' : undefined}
        >
          {dispatch.isPending ? '⌛ Enviando...' : scheduledFor ? '📅 Agendar' : '✈ Disparar agora'}
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
    <div className={pageContainer}>
      <PageHeader
        title="Composer"
        subtitle={productIds.length > 0 ? `${productIds.length} produto${productIds.length !== 1 ? 's' : ''}` : undefined}
        className="mb-4"
        actions={
          <>
            <Button
              variant="ghost"
              className="h-9 text-sm"
              disabled={!text || saveRascunho.isPending}
              onClick={() => saveRascunho.mutate()}
            >
              {saveRascunho.isPending ? 'Salvando...' : 'Salvar rascunho'}
            </Button>
            <a href="/logs?status=draft" className="text-xs text-accent hover:underline">
              Ver rascunhos
            </a>
          </>
        }
      />

      {/* 2 colunas: formulário (esq) + preview/ações (dir) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">

        {/* Mobile: preview sticky no topo */}
        <div className="lg:hidden sticky top-0 z-20 bg-bg/95 backdrop-blur-md border-b border-border/80 pb-3 pt-2 col-span-full">
          {previewWACard}
        </div>

        {/* Coluna formulário */}
        <div className="min-w-0 max-h-[calc(100vh-8.25rem)] overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] space-y-4">

          {/* Etapa 1: Produtos */}
          <div className={`${sectionCard} !p-0 overflow-hidden`}>
            <div className="px-4 py-3 flex items-center justify-between border-b border-border bg-surface-2/30">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 bg-accent text-white text-xs font-bold rounded-full flex items-center justify-center">1</span>
                <span className="font-medium text-fg">Produtos ({productIds.length})</span>
              </div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => navigate('/match')} className="text-xs text-fg-2 hover:underline">Trocar</button>
                <button type="button" onClick={() => navigate('/catalog')} className="text-xs text-accent hover:underline">+ Catálogo</button>
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
                              {price > 0 && <span className="text-base font-bold text-success">R$ {Number(price).toFixed(2)}</span>}
                              {discountPct > 0 && (
                                <span className="text-xs font-semibold bg-success/15 text-success rounded px-1.5 py-0.5">-{discountPct}%</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <p className={`${formHint} mt-3`}>
                    {productIds.length} × {selectedTargets.length > 0 ? selectedTargets.length : '?'} canal{selectedTargets.length !== 1 ? 'is' : ''} ={' '}
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
                    <button type="button" className="text-xs text-accent hover:underline" onClick={() => navigate('/match')}>Match</button>
                    <span className="text-fg-3">·</span>
                    <button type="button" className="text-xs text-accent hover:underline" onClick={() => navigate('/catalog')}>Catálogo</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Etapa 2: Template */}
          <div className={`${sectionCard} !p-0 overflow-hidden`}>
            <div className="px-4 py-3 flex flex-wrap gap-2 items-center justify-between border-b border-border bg-surface-2/30">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 bg-accent text-white text-xs font-bold rounded-full flex items-center justify-center">2</span>
                <span className="font-medium text-fg">Template da mensagem</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <TemplateDropdown onSelect={(body) => setText(body)} />
                <span className="flex flex-wrap items-center gap-1">
                  {VARIABLES.map(v => (
                    <button key={v} type="button" onClick={() => setText(t => t + v)}>
                      <Badge variant="accent" size="sm" className="font-mono cursor-pointer hover:opacity-80">{v}</Badge>
                    </button>
                  ))}
                </span>
              </div>
            </div>
            <div className="p-4 space-y-3">
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

              {/* Imagem */}
              <div className="pt-3 border-t border-border">
                <div className="flex items-center gap-2">
                  <label className={`flex items-center gap-1.5 text-xs border rounded px-2 py-1.5 cursor-pointer hover:bg-surface-2 ${imageUrl ? 'border-success text-success' : 'border-border text-fg-2'}`}>
                    <span>{imageUrl ? '🖼' : '📷'}</span>
                    <span>{imageUrl ? 'Imagem ✓ (trocar)' : 'Imagem do produto'}</span>
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

              {/* Tom + IA */}
              <div className="flex items-center gap-2 flex-wrap">
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
                  {rewriteMut.isPending ? '⏳ Reescrevendo...' : '✨ IA Reescrever'}
                </button>
                <span className="ml-auto text-xs text-fg-3">{text.length} chars</span>
              </div>
            </div>
          </div>

          {/* Etapa 3: Canais destino */}
          <div className={`${sectionCard} !p-0 overflow-hidden`}>
            <div className="px-4 py-3 flex items-center justify-between border-b border-border bg-surface-2/30">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 bg-accent text-white text-xs font-bold rounded-full flex items-center justify-center">3</span>
                <span className="font-medium text-fg">Canais destino</span>
                {channels.length > 0 && (
                  <span className={formHint}>{channels.length} canal{channels.length !== 1 ? 'is' : ''}</span>
                )}
              </div>
            </div>
            <div className="p-4 space-y-3">
              {allChannels.length === 0 ? (
                <p className="text-sm text-fg-3">
                  Nenhum canal.{' '}
                  <button type="button" className="text-accent hover:underline" onClick={() => navigate('/channels')}>Criar canal</button>
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs text-fg-3">
                    <span>{selectedTargets.length}/{allChannels.length} selecionado(s)</span>
                    <div className="flex gap-2">
                      <button type="button" className="text-accent hover:underline"
                        onClick={() => setSelectedTargets(allChannels.map(c => c.id))}>Todos</button>
                      {selectedTargets.length > 0 && (
                        <button type="button" className="text-fg-3 hover:text-fg"
                          onClick={() => setSelectedTargets([])}>Limpar</button>
                      )}
                      <button type="button" className="text-accent hover:underline"
                        onClick={() => navigate(productId ? `/match?productId=${productId}` : '/match')}>Match</button>
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
                            isSelected ? 'border-accent bg-accent/5' : 'border-border bg-surface-2 hover:border-border-strong'
                          }`}
                        >
                          {/* Indicador visual — decorativo (interação via botão pai) */}
                          <span
                            aria-hidden="true"
                            className={`relative inline-flex w-8 h-4 rounded-full flex-shrink-0 transition-colors ${isSelected ? 'bg-accent' : 'bg-border-strong'}`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${isSelected ? 'translate-x-4' : 'translate-x-0'}`} />
                          </span>
                          <span className="flex-1 min-w-0 truncate text-sm text-fg font-medium">{ch.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Mobile/tablet: resumo + agendar + disparar */}
          <div className="lg:hidden space-y-4 pb-8">
            {composerMetaActions}
          </div>

        </div>

        {/* Desktop: preview + painel lateral */}
        <aside className="hidden lg:flex flex-col gap-4 sticky top-4 self-start max-h-[calc(100vh-8.25rem)] overflow-y-auto overscroll-contain pb-4">
          {previewAsideDesktop}
        </aside>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowConfirm(false)}>
          <div
            className={`${sectionCard} max-w-sm w-full mx-4 shadow-modal`}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-semibold text-fg mb-2">Confirmar disparo</h3>
            <p className={`${formHint} mb-4`}>
              {productIds.length * channels.length} envio{productIds.length * channels.length !== 1 ? 's' : ''} para {channels.length} canal{channels.length !== 1 ? 'is' : ''}. Não pode ser desfeito.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setShowConfirm(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => { setShowConfirm(false); handleDispatch() }}>Confirmar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
