import React from 'react'
import { TutorialHelpButton } from '../components/ui'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../lib/apiClient'
import { TabChannels, Drawer, type ChannelRow } from './Automations'
import { SuggestChannelModal } from './Channels'

export default function AutomationsByChannel() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [drawerRow, setDrawerRow] = React.useState<ChannelRow | null>(null)
  const [showCreate, setShowCreate] = React.useState(false)
  const [showSuggest, setShowSuggest] = React.useState(false)
  const [name, setName] = React.useState('')

  const createMut = useMutation({
    mutationFn: () =>
      apiClient.post('/api/channels', {
        name: name.trim(),
        active: true,
        send_start_hour: 8,
        send_end_hour: 22,
        digest_max_items: 5,
      }).then(r => r.data as { id: number }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['automations'] })
      qc.invalidateQueries({ queryKey: ['channels'] })
      setShowCreate(false)
      setName('')
      navigate(`/channels/${data.id}`)
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao criar canal'),
  })

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg font-semibold text-fg">Canais</span>
          <TutorialHelpButton />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSuggest(true)}
            className="text-sm border border-border text-accent px-3 py-1.5 rounded-md hover:bg-accent/5"
          >
            ✨ Sugerir canal
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="text-sm bg-accent text-white px-3 py-1.5 rounded-md hover:opacity-90"
          >
            + Novo canal
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <TabChannels onOpenDrawer={setDrawerRow} />
      </div>
      {drawerRow && (
        <Drawer row={drawerRow} onClose={() => setDrawerRow(null)} />
      )}
      {showSuggest && (
        <SuggestChannelModal
          onClose={() => setShowSuggest(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['automations'] })
            qc.invalidateQueries({ queryKey: ['channels'] })
            setShowSuggest(false)
          }}
        />
      )}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreate(false)}>
          <div className="bg-surface border border-border rounded-md p-5 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-fg mb-3">Novo canal</h2>
            <label className="text-xs text-fg-2 block mb-1">Nome</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && name.trim()) createMut.mutate() }}
              placeholder="Ex: Promos eletrônicos"
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
            />
            <p className="text-xs text-fg-3 mt-2">Após criar, você será levado para configurar audiência, grupos e automação.</p>
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={() => setShowCreate(false)} className="text-sm text-fg-2 hover:text-fg px-3 py-1.5">Cancelar</button>
              <button
                type="button"
                disabled={!name.trim() || createMut.isPending}
                onClick={() => createMut.mutate()}
                className="text-sm bg-accent text-white px-3 py-1.5 rounded-md hover:opacity-90 disabled:opacity-50"
              >
                {createMut.isPending ? 'Criando...' : 'Criar e configurar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
