import { useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Switch } from '../../components/ui'
import { apiClient } from '../../lib/apiClient'
import { sectionCard, sectionTitle, formGroup, formLabel, formHint, switchRow } from '../../lib/uiTokens'

interface AppConfig {
  gtm_container_id?: string | null
  global_interval?: number
  send_start_hour?: number
  send_end_hour?: number
  dispatch_send_window_enabled?: boolean
  dispatch_send_timezone?: string
  dispatch_min_interval_ms?: number
  dispatch_max_per_group_per_hour?: number
  notifications_group_id?: number | null
  [key: string]: unknown
}

interface GroupOption {
  id: number
  name: string
  platform: string
  channel_name?: string
  account_label?: string
  status?: string
  member_count?: number
  archived?: boolean
}

function NotifGroupCombobox({
  groups,
  value,
  onChange,
}: {
  groups: GroupOption[]
  value: number | null
  onChange: (id: number | null) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = value != null ? groups.find(g => g.id === value) : null
  const displayName = selected
    ? `${selected.name}${selected.channel_name ? ` · ${selected.channel_name}` : ''}`
    : ''

  const filtered = groups.filter(g =>
    g.name.toLowerCase().includes(query.toLowerCase()) ||
    (g.channel_name ?? '').toLowerCase().includes(query.toLowerCase()),
  ).slice(0, 30)

  const handleSelect = (g: GroupOption | null) => {
    onChange(g ? g.id : null)
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

  // Fecha ao clicar fora
  const handleBlur = (e: React.FocusEvent) => {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-md" onBlur={handleBlur}>
      <input
        ref={inputRef}
        type="text"
        value={open ? query : displayName}
        placeholder={value == null ? '— Desativado (sem notificações) —' : ''}
        onFocus={() => { setOpen(true); setQuery('') }}
        onChange={e => setQuery(e.target.value)}
        className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent pr-8"
      />
      {/* Clear button */}
      {value != null && !open && (
        <button
          tabIndex={-1}
          onClick={() => handleSelect(null)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-3 hover:text-fg text-xs px-1"
          title="Desativar notificações"
        >
          ✕
        </button>
      )}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-surface shadow-lg max-h-72 overflow-y-auto">
          {/* Opção "Desativado" */}
          <button
            tabIndex={0}
            onMouseDown={() => handleSelect(null)}
            className={`w-full text-left px-3 py-2 text-sm hover:bg-surface-2 text-fg-3 italic ${value == null ? 'bg-accent/10 text-accent not-italic font-medium' : ''}`}
          >
            — Desativado —
          </button>
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-fg-3">Nenhum grupo encontrado</p>
          ) : (
            filtered.map(g => (
              <button
                key={g.id}
                tabIndex={0}
                onMouseDown={() => handleSelect(g)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-surface-2 transition-colors ${g.id === value ? 'bg-accent/10 text-accent font-medium' : 'text-fg'}`}
              >
                <span className="font-medium">{g.name}</span>
                {g.channel_name && (
                  <span className="ml-1.5 text-xs text-fg-3">{g.channel_name}</span>
                )}
                {g.member_count != null && g.member_count > 0 && (
                  <span className="ml-1.5 text-xs text-fg-3">· {g.member_count} membros</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export function SystemTab() {
  const qc = useQueryClient()
  const [local, setLocal] = useState<Partial<AppConfig>>({})

  const { data: config, isLoading } = useQuery<AppConfig>({
    queryKey: ['config'],
    queryFn: () => apiClient.get('/api/config').then(r => r.data).catch(() => ({})),
  })

  // Lista enriquecida de grupos (mesma origem da página /groups e do seletor de canais).
  // Sem filtro server-side: filtramos client-side pra mostrar só WA ativos com JID.
  const { data: allGroups = [] } = useQuery<GroupOption[]>({
    queryKey: ['groups', 'for-notifications'],
    queryFn: () => apiClient.get('/api/groups').then(r => r.data ?? []),
    staleTime: 60_000,
  })

  const notificationGroupOptions = useMemo<GroupOption[]>(
    () => allGroups
      .filter(g => g.platform === 'whatsapp' && !g.archived && (g.status ?? 'active') !== 'banned')
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [allGroups],
  )

  const saveMut = useMutation({
    mutationFn: (data: Partial<AppConfig>) => apiClient.put('/api/config', data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['config'] }); setLocal({}) },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar'),
  })

  const upd = (key: keyof AppConfig, value: unknown) => setLocal(p => ({ ...p, [key]: value }))
  const merged: AppConfig = { ...config, ...local }

  if (isLoading && !config) return <div className="text-sm text-fg-3">Carregando...</div>

  return (
    <div className="space-y-5 max-w-2xl">

      {/* Scan & envio */}
      <div className={sectionCard}>
        <p className={`${sectionTitle} mb-4`}>Scan e janela de envio</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className={formGroup}>
            <label className={formLabel}>Intervalo de scan (min)</label>
            <input
              type="number" min={5} max={1440}
              value={merged.global_interval ?? 30}
              onChange={e => upd('global_interval', Number(e.target.value))}
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
            />
          </div>
          <div className={formGroup}>
            <label className={formLabel}>Início do envio (hora)</label>
            <input
              type="number" min={0} max={23}
              value={merged.send_start_hour ?? 8}
              onChange={e => upd('send_start_hour', Number(e.target.value))}
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
            />
          </div>
          <div className={formGroup}>
            <label className={formLabel}>Fim do envio (hora)</label>
            <input
              type="number" min={0} max={23}
              value={merged.send_end_hour ?? 22}
              onChange={e => upd('send_end_hour', Number(e.target.value))}
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
            />
          </div>
        </div>

        <div className="border-t border-border pt-4 space-y-3">
          <div className={switchRow}>
            <div>
              <p className={formLabel}>Janela de envio (WA)</p>
              <p className={formHint}>
                Fora do horário acima: auto-match e ads NÃO enfileiram, e pending_approval não vira queued. Disparos manuais continuam funcionando.
              </p>
            </div>
            <Switch
              checked={(merged.dispatch_send_window_enabled ?? false) as boolean}
              onChange={v => upd('dispatch_send_window_enabled', v)}
            />
          </div>
          <div className={formGroup}>
            <label className={formLabel}>Fuso horário (IANA)</label>
            <input
              type="text"
              value={(merged.dispatch_send_timezone as string) ?? 'America/Sao_Paulo'}
              onChange={e => upd('dispatch_send_timezone', e.target.value)}
              className="w-full max-w-md text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg font-mono"
              placeholder="America/Sao_Paulo"
            />
          </div>
        </div>
      </div>

      {/* Notificações operacionais */}
      <div className={sectionCard}>
        <p className={`${sectionTitle} mb-1`}>Notificações</p>
        <p className={`${formHint} mb-3`}>
          Grupo WhatsApp que recebe os resumos automáticos do sistema: relatórios do
          Jonfrey (revisão e recomendação), entregas de dispatch (com lista de grupos
          e produto), resumos do auto-match e falhas relevantes.
        </p>
        <div className={formGroup}>
          <label className={formLabel}>Grupo de destino</label>
          <NotifGroupCombobox
            groups={notificationGroupOptions}
            value={merged.notifications_group_id ?? null}
            onChange={id => upd('notifications_group_id', id)}
          />
          <p className={formHint}>
            Apenas grupos WhatsApp já cadastrados na página <strong>Grupos</strong> aparecem aqui.
            Se a lista estiver vazia, importe um grupo lá primeiro.
          </p>
        </div>
      </div>

      {/* Rate limits */}
      <div className={sectionCard}>
        <p className={`${sectionTitle} mb-4`}>Rate limits de disparo</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className={formGroup}>
            <label className={formLabel}>Intervalo mínimo entre grupos (ms)</label>
            <input
              type="number" min={0}
              value={(merged.dispatch_min_interval_ms as number) ?? ''}
              onChange={e => upd('dispatch_min_interval_ms', Number(e.target.value))}
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
              placeholder="0"
            />
          </div>
          <div className={formGroup}>
            <label className={formLabel}>Máx. disparos por grupo/hora</label>
            <input
              type="number" min={0}
              value={(merged.dispatch_max_per_group_per_hour as number) ?? ''}
              onChange={e => upd('dispatch_max_per_group_per_hour', Number(e.target.value))}
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
              placeholder="ilimitado"
            />
          </div>
        </div>
      </div>

      {/* Google Tag Manager */}
      <div className={sectionCard}>
        <p className={`${sectionTitle} mb-3`}>Google Tag Manager</p>
        <div className={formGroup}>
          <label className={formLabel}>Container ID</label>
          <input
            type="text"
            value={(merged.gtm_container_id as string) ?? ''}
            onChange={e => upd('gtm_container_id', e.target.value.trim() || null)}
            className="w-full max-w-md text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg font-mono"
            placeholder="GTM-XXXXXXX"
            spellCheck={false}
            autoCapitalize="characters"
          />
          <p className={formHint}>Carrega em todas as rotas via <code>/api/brand</code></p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="primary" size="sm" loading={saveMut.isPending}
          onClick={() => saveMut.mutate({ ...config, ...local })}>
          Salvar
        </Button>
        {saveMut.isSuccess && <p className="text-xs text-success">Salvo.</p>}
        {saveMut.isError && <p className="text-xs text-danger">Erro ao salvar.</p>}
      </div>
    </div>
  )
}
