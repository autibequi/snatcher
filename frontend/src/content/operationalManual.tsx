import React from 'react'

/** Texto único do manual — importado pela página /manual e pode ser reutilizado em outros pontos. */
export const OPERATIONAL_MANUAL_META = {
  title: 'Manual operacional',
  description:
    'Guia focado no dia a dia do operador: contas, disparos, automações e monitoração.',
} as const

/**
 * Corpo do manual (mesma fonte em todo o app).
 * Mantenha atualizado aqui — a página /manual e o fluxo de ajuda só referenciam este componente.
 */
export function OperationalManualContent() {
  return (
    <div className="space-y-10 text-sm text-fg-2 leading-relaxed">
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-fg border-b border-border pb-2">1. Conectar e preparar</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            Em <strong className="text-fg">Contas conectadas</strong>, adicione WhatsApp ou Telegram. Para WA, escaneie o QR
            quando o sistema pedir; o status deve ir para <code className="text-xs bg-surface-2 px-1 rounded">connected</code>.
          </li>
          <li>
            Em <strong className="text-fg">Automações → Canais</strong>, configure cada canal (grupos de destino, limites e,
            se usar, auto-match).
          </li>
          <li>
            Em <strong className="text-fg">Grupos</strong>, importe grupos da conta WA e associe-os aos canais quando necessário.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-fg border-b border-border pb-2">2. Disparos manuais</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            Use <strong className="text-fg">Compor disparo</strong> para montar mensagem, escolher canais/grupos e enviar na hora
            ou agendar.
          </li>
          <li>
            Se o produto vier de marketplace, configure <strong className="text-fg">Afiliados</strong> (tags/IDs) para o link
            curto comissionar corretamente.
          </li>
          <li>
            A busca no topo (<kbd className="text-xs bg-surface-2 px-1 rounded">⌘K</kbd> / Ctrl+K) acha produtos no catálogo e
            leva rápido ao composer.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-fg border-b border-border pb-2">3. Automações</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong className="text-fg">Automações</strong>: visão geral do auto-match, filas e histórico recente.
          </li>
          <li>
            <strong className="text-fg">Por canal</strong>: threshold, máximo de disparos por ciclo e cooldown por canal.
          </li>
          <li>
            <strong className="text-fg">Jonfrey</strong>: fluxos assistidos pela IA quando estiverem ativos para o seu workspace.
          </li>
          <li>
            Disparos que exigem aprovação aparecem no indicador de pendentes na barra superior e na área de automações.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-fg border-b border-border pb-2">4. Anúncios pagos e links</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong className="text-fg">Anúncios pagos</strong>: campanhas recorrentes com cron, URL rastreada e canais alvo.
          </li>
          <li>
            <strong className="text-fg">Links públicos</strong> e <strong className="text-fg">Insights</strong> ajudam a acompanhar
            cliques e performance.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-fg border-b border-border pb-2">5. Monitorar e ajuda</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong className="text-fg">Logs</strong>: filas, disparos, erros e jobs — primeiro lugar para investigar falhas.
          </li>
          <li>
            <strong className="text-fg">Configurações</strong>: preferências da conta, LLM e integrações permitidas ao seu papel.
          </li>
          <li>
            Este texto é o mesmo da entrada <strong className="text-fg">Manual</strong> no menu (Sistema) e do botão de ajuda
            na barra superior — uma única fonte, sempre alinhada.
          </li>
        </ul>
      </section>
    </div>
  )
}
