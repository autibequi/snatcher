import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, SegmentedControl, Switch } from '../../components/ui'
import { apiClient } from '../../lib/apiClient'
import { useTheme } from '../../lib/theme'
import { sectionCard, sectionTitle, switchRow, formLabel } from '../../lib/uiTokens'

type Accent = 'indigo' | 'green' | 'orange' | 'pink'

/** Igual a softWipeConfirmPhrase no backend (danger.go); so o servidor valida. */
const SOFT_WIPE_CONFIRM_PHRASE = 'EU CONFIRMO APAGAR TODOS OS DADOS OPERACIONAIS'

const ACCENT_COLORS: Record<Accent, string> = {
  indigo: '#bd93f9',
  green: '#50fa7b',
  orange: '#ffb86c',
  pink: '#ff79c6',
}

export function AppearanceTab() {
  const { theme, setTheme, density, setDensity, accent, setAccent } = useTheme()
  const qc = useQueryClient()

  const [phrase, setPhrase] = useState('')
  const [reseedTaxonomy, setReseedTaxonomy] = useState(false)
  const [reseedCrawlers, setReseedCrawlers] = useState(false)

  const wipeMut = useMutation({
    mutationFn: () =>
      apiClient.post('/api/admin/danger/soft-wipe', {
        confirm: phrase.trim(),
        reseed_taxonomy: reseedTaxonomy,
        reseed_crawlers_channels: reseedCrawlers,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries()
      setPhrase('')
      let msg = 'Soft wipe aplicado.'
      if (reseedTaxonomy) msg += ' Seeds de taxonomia reaplicados.'
      if (reseedCrawlers) msg += ' Seeds de crawlers e canais reaplicados.'
      alert(msg)
    },
    onError: (err: unknown) =>
      alert(String((err as any)?.response?.data?.error ?? (err as Error)?.message ?? 'Erro')),
  })

  return (
    <div className="space-y-5 max-w-sm">

      {/* Tema */}
      <div className={sectionCard}>
        <p className={`${sectionTitle} mb-3`}>Tema</p>
        <SegmentedControl
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'system', label: 'Sistema' },
            { value: 'light', label: 'Claro' },
            { value: 'dark', label: 'Escuro' },
          ]}
        />
      </div>

      {/* Densidade */}
      <div className={sectionCard}>
        <p className={`${sectionTitle} mb-3`}>Densidade</p>
        <SegmentedControl
          value={density}
          onChange={setDensity}
          options={[
            { value: 'compact', label: 'Compacto' },
            { value: 'comfy', label: 'Confortavel' },
          ]}
        />
      </div>

      {/* Acento */}
      <div className={sectionCard}>
        <p className={`${sectionTitle} mb-3`}>Cor de Acento</p>
        <div className="flex gap-3">
          {(Object.keys(ACCENT_COLORS) as Accent[]).map(a => (
            <button
              key={a}
              type="button"
              onClick={() => setAccent(a)}
              className={`w-8 h-8 rounded-full border-2 transition-colors ${accent === a ? 'border-fg' : 'border-transparent'}`}
              style={{ backgroundColor: ACCENT_COLORS[a] }}
              title={a.charAt(0).toUpperCase() + a.slice(1)}
            />
          ))}
        </div>
      </div>

      {/* Danger zone */}
      <div className="rounded-lg border border-danger/40 bg-danger/5 p-4 space-y-4">
        <p className="text-sm font-semibold text-danger">Zona perigosa</p>
        <p className="text-xs text-fg-3">
          Arquiva grupos, desativa canais e marca catalogo como inativo. Contas, usuarios e configuracoes nao sao apagados.
        </p>

        <label className="block">
          <span className="text-xs font-medium text-fg-2">Confirmacao (digite exatamente)</span>
          <Input
            className="mt-1 font-mono text-sm"
            placeholder={SOFT_WIPE_CONFIRM_PHRASE}
            value={phrase}
            onChange={e => setPhrase(e.target.value)}
            autoComplete="off"
          />
        </label>

        <div className="space-y-2">
          <div className={switchRow}>
            <p className={formLabel}>Reaplicar seeds de taxonomia</p>
            <Switch checked={reseedTaxonomy} onChange={setReseedTaxonomy} />
          </div>
          <div className={switchRow}>
            <p className={formLabel}>Reaplicar seeds de crawlers e canais</p>
            <Switch checked={reseedCrawlers} onChange={setReseedCrawlers} />
          </div>
        </div>

        <Button
          variant="danger"
          size="sm"
          loading={wipeMut.isPending}
          disabled={phrase.trim() !== SOFT_WIPE_CONFIRM_PHRASE}
          onClick={() => {
            if (!confirm('Tem a certeza? Esta operacao e irreversivel sem backup.')) return
            wipeMut.mutate()
          }}
        >
          Executar soft wipe
        </Button>
        <p className="text-[11px] text-fg-3">Apenas usuarios com role <code className="bg-surface-2 px-1 rounded">admin</code>.</p>
      </div>
    </div>
  )
}
