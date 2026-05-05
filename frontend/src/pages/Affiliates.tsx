import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Skeleton } from '../components/ui'
import { apiClient } from '../lib/apiClient'

// Marketplaces suportados com label e campo de credencial
const MARKETPLACES = [
  { id: 'amazon',       label: 'Amazon Associates',   field: 'tag',          placeholder: 'snatcher-20',     hint: 'Amazon Associates tracking tag' },
  { id: 'mercadolivre', label: 'Mercado Livre',        field: 'affiliate_id', placeholder: '1234567',          hint: 'ID do afiliado ML' },
  { id: 'magalu',       label: 'Magalu Parceiro',      field: 'affiliate_id', placeholder: 'SEU_ID',           hint: 'ID do parceiro Magalu' },
  { id: 'shopee',       label: 'Shopee Afiliados',     field: 'affiliate_id', placeholder: 'SEU_ID',           hint: 'ID de afiliado Shopee' },
  { id: 'aliexpress',   label: 'AliExpress',           field: 'affiliate_id', placeholder: 'SEU_ID',           hint: 'ID de afiliado AliExpress' },
  { id: 'kabum',        label: 'Kabum',                field: 'affiliate_id', placeholder: 'SEU_ID',           hint: 'ID de afiliado Kabum' },
  { id: 'americanas',   label: 'Americanas',           field: 'affiliate_id', placeholder: 'SEU_ID',           hint: 'ID de afiliado Americanas' },
  { id: 'casasbahia',   label: 'Casas Bahia',          field: 'affiliate_id', placeholder: 'SEU_ID',           hint: 'ID de afiliado Casas Bahia' },
] as const

interface Program {
  id?: number
  marketplace: string
  active: boolean
  credentials: Record<string, string>
}

function AffiliateRow({ mkt, program }: { mkt: typeof MARKETPLACES[number]; program?: Program }) {
  const qc = useQueryClient()
  const [value, setValue] = React.useState(program?.credentials?.[mkt.field] ?? '')
  const [active, setActive] = React.useState(program?.active ?? false)
  const [testResult, setTestResult] = React.useState<string | null>(null)
  const [testing, setTesting] = React.useState(false)

  // Sincronizar com dados do servidor quando chegam
  React.useEffect(() => {
    setValue(program?.credentials?.[mkt.field] ?? '')
    setActive(program?.active ?? false)
  }, [program])

  const saveMut = useMutation({
    mutationFn: () => {
      const creds = { [mkt.field]: value }
      if (program?.id) {
        return apiClient.patch(`/api/affiliates/programs/${program.id}`, {
          active,
          credentials: JSON.stringify(creds),
        }).then(r => r.data)
      } else {
        return apiClient.post('/api/affiliates/programs', {
          name: mkt.label,
          marketplace: mkt.id,
          active,
          credentials: JSON.stringify(creds),
        }).then(r => r.data)
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['affiliates'] }),
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar'),
  })

  const handleTest = async () => {
    if (!value.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await apiClient.post('/api/affiliates/build-link', {
        product_url: 'https://www.amazon.com.br/dp/B08N5WRWNW',
        marketplace: mkt.id,
      })
      setTestResult(`✅ Link gerado: ${res.data.url?.slice(0, 60)}...`)
    } catch {
      setTestResult('❌ Falhou — verifique o ID/tag e tente novamente')
    } finally {
      setTesting(false)
    }
  }

  const isDirty = value !== (program?.credentials?.[mkt.field] ?? '') || active !== (program?.active ?? false)

  return (
    <div className="border border-border rounded-md p-4 bg-surface">
      <div className="flex items-start justify-between gap-4">
        {/* Esquerda: label + campo */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-sm font-medium text-fg">{mkt.label}</p>
            <Badge variant={active ? 'success' : 'default'} size="sm">
              {active ? 'ativo' : 'inativo'}
            </Badge>
          </div>
          <div className="flex gap-2 items-center">
            <input
              className="flex-1 text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent font-mono"
              placeholder={mkt.placeholder}
              value={value}
              onChange={e => setValue(e.target.value)}
            />
            <span className="text-xs text-fg-3 hidden sm:block">{mkt.hint}</span>
          </div>
          {testResult && (
            <p className="text-xs mt-2 text-fg-2">{testResult}</p>
          )}
        </div>

        {/* Direita: toggle + ações */}
        <div className="flex flex-col gap-2 items-end flex-shrink-0">
          {/* Toggle ativo */}
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={active}
              onChange={e => setActive(e.target.checked)}
              className="accent-accent"
            />
            <span className="text-xs text-fg-2">Ativo</span>
          </label>

          {/* Ações */}
          <div className="flex gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              loading={testing}
              disabled={!value.trim()}
              onClick={handleTest}
            >
              Testar
            </Button>
            <Button
              variant={isDirty ? 'primary' : 'secondary'}
              size="sm"
              loading={saveMut.isPending}
              disabled={!isDirty && !saveMut.isSuccess}
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isSuccess && !isDirty ? '✓ Salvo' : 'Salvar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Affiliates() {
  const { data: programs = [], isLoading } = useQuery<Program[]>({
    queryKey: ['affiliates'],
    queryFn: () => apiClient.get('/api/affiliates/programs').then(r => {
      const d = r.data
      // Parse credentials se vier como string JSON
      const items = Array.isArray(d) ? d : (d?.items ?? [])
      return items.map((p: any) => ({
        ...p,
        credentials: typeof p.credentials === 'string'
          ? (() => { try { return JSON.parse(p.credentials) } catch { return {} } })()
          : (p.credentials ?? {}),
      }))
    }).catch(() => []),
  })

  // Mapear programas por marketplace para lookup rápido
  const byMarketplace = React.useMemo(() => {
    const map: Record<string, Program> = {}
    for (const p of programs) {
      map[p.marketplace] = p
    }
    return map
  }, [programs])

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-fg">Afiliados</h1>
        <p className="text-sm text-fg-3 mt-0.5">
          Configure 1 ID de afiliado por marketplace. Os links de produtos serão gerados automaticamente.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {MARKETPLACES.map(m => <Skeleton key={m.id} className="h-20 w-full" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {MARKETPLACES.map(mkt => (
            <AffiliateRow
              key={mkt.id}
              mkt={mkt}
              program={byMarketplace[mkt.id]}
            />
          ))}
        </div>
      )}
    </div>
  )
}
