import React from 'react'
import { TabChannels, Drawer, type ChannelRow } from './Automations'

export default function AutomationsByChannel() {
  const [drawerRow, setDrawerRow] = React.useState<ChannelRow | null>(null)

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 border-b border-border">
        <p className="text-sm text-fg-3">Configuração e monitor por canal</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        <TabChannels onOpenDrawer={setDrawerRow} />
      </div>
      {drawerRow && (
        <Drawer row={drawerRow} onClose={() => setDrawerRow(null)} />
      )}
    </div>
  )
}
