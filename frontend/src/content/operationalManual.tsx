import React from 'react'

/** Texto único do manual — importado pela página /manual e pode ser reutilizado em outros pontos. */
export const OPERATIONAL_MANUAL_META = {
  title: 'Manual operacional',
  description:
    'Do zero ao dia a dia: o que é o sistema, conceitos, primeiro envio, auto disparos e resolução de problemas.',
} as const

/**
 * Corpo do manual (mesma fonte em todo o app).
 * Mantenha atualizado aqui — a página /manual e o fluxo de ajuda só referenciam este componente.
 */
export function OperationalManualContent() {
  return (
    <div className="space-y-10 text-sm text-fg-2 leading-relaxed">
      <p className="text-fg border border-border rounded-md p-3 bg-surface-2/40 text-xs">
        <strong className="text-fg">Primeira vez?</strong> Leia na ordem — cada secção assume que já percebeste a anterior. O ícone{' '}
        <span className="text-fg">❓</span> na barra abre o mesmo manual contextual da rota onde estás.
      </p>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-fg border-b border-border pb-2">0. O que é isto (em uma frase)</h2>
        <p>
          O <strong className="text-fg">Snatcher</strong> descobre ofertas em marketplaces e lojas (via{' '}
          <strong className="text-fg">crawlers</strong>), guarda tudo num <strong className="text-fg">catálogo</strong>, e permite enviar
          ou automatizar mensagens para <strong className="text-fg">WhatsApp</strong> e <strong className="text-fg">Telegram</strong>{' '}
          através de <strong className="text-fg">canais</strong> (audiência/tópicos) e <strong className="text-fg">grupos</strong> de destino.
        </p>
        <p>
          Não precisas de perceber o código: trabalhas no painel web. Se <strong className="text-fg">alguém instalou o servidor por ti</strong>, só
          precisas do endereço (URL), credenciais e deste manual.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-fg border-b border-border pb-2">1. Dois caminhos até ao login</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong className="text-fg">Só vou usar o painel:</strong> pede ao administrador o URL (ex.{' '}
            <code className="text-xs bg-surface-2 px-1 rounded">https://teu-dominio...</code>), email e senha. Abre no navegador moderno
            (Chrome, Firefox, Edge).
          </li>
          <li>
            <strong className="text-fg">Eu instalo/atualizo o servidor:</strong> no repositório do projeto segue o README: Docker, ficheiro{' '}
            <code className="text-xs bg-surface-2 px-1 rounded">.env</code>, comando <code className="text-xs bg-surface-2 px-1 rounded">make dev</code>{' '}
            ou <code className="text-xs bg-surface-2 px-1 rounded">make start</code>, migrações de base de dados e criação do primeiro utilizador admin
            (script ou convite). Isso fica fora deste manual — aqui assumimos que o painel já abre.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-fg border-b border-border pb-2">2. Contas, papéis e primeira vista</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            Faz <strong className="text-fg">login</strong> com o email e password que te deram. A sessão usa JWT — se expirar, volta a autenticar.
          </li>
          <li>
            <strong className="text-fg">Operator</strong> gere operações do dia a dia. <strong className="text-fg">Admin</strong> pode, entre outras
            coisas, convidar equipa, mexer em integrações sensíveis e na <strong className="text-fg">Danger zone</strong> (limpeza de dados).
          </li>
          <li>
            O <strong className="text-fg">Dashboard</strong> resume o estado geral — começa por lá para ver se contas, filas ou alertas precisam de
            atenção antes de afunilar em Crawlers ou Auto disparos.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-fg border-b border-border pb-2">3. Conceitos que aparecem em todo o lado</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong className="text-fg">Crawler / termo de busca:</strong> uma ou mais palavras-chave e lojas de origem (ex. Mercado Livre, Amazon).
            O sistema visita periodicamente e traz resultados brutos.
          </li>
          <li>
            <strong className="text-fg">Catálogo:</strong> produtos normalizados (nome, preço, histórico). É a “prateleira” onde escolhes o que enviar.
            Sem itens no catálogo, não há o que promover — primeiro alimenta crawlers ou importações.
          </li>
          <li>
            <strong className="text-fg">Canal:</strong> perfil de audiência (categorias, marcas, faixa de preço, pesos). Ajuda a filtrar o que faz sentido
            para cada público.
          </li>
          <li>
            <strong className="text-fg">Grupo:</strong> destino real no WhatsApp/Telegram. Um canal pode estar ligado a vários grupos.
          </li>
          <li>
            <strong className="text-fg">Disparo:</strong> mensagem (manual ou automática) que parte do sistema para esses grupos. Pode exigir aprovação
            consoante as regras.
          </li>
        </ul>
        <p className="text-xs text-fg-3 pl-1">
          Fluxo mental: Crawler → resultados entram no Catálogo → regras/automações escolhem ofertas → Canal/Grupos definem para onde vai o aviso.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-fg border-b border-border pb-2">4. Caminho sugerido (primeira vez operacional)</h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            <strong className="text-fg">Contas conectadas</strong> — liga WhatsApp (QR) e/ou Telegram até o estado mostrar sessão ativa. Sem isto não há
            grupos nem envio.
          </li>
          <li>
            <strong className="text-fg">Crawlers</strong> — cria pelo menos um termo de busca ativo e espera um ciclo de varredura (ou verifica{' '}
            <strong className="text-fg">Logs</strong> se está a correr).
          </li>
          <li>
            <strong className="text-fg">Catálogo</strong> — confirma que apareceram produtos. Se estiver vazio, volta ao passo anterior.
          </li>
          <li>
            <strong className="text-fg">Auto disparos → Canais</strong> — cria/edita um canal e associa audiência. Em <strong className="text-fg">Grupos</strong>, importa
            grupos da conta e vincula ao canal.
          </li>
          <li>
            <strong className="text-fg">Compor disparo</strong> — envia um teste manual a um grupo pequeno antes de ligar automações em escala.
          </li>
          <li>
            Só depois: <strong className="text-fg">Auto disparos</strong>, <strong className="text-fg">Jonfrey</strong> (IA) ou campanhas pagas — começa com limites
            conservadores (threshold, cooldown).
          </li>
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-fg border-b border-border pb-2">5. Conectar e preparar (detalhe)</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            Em <strong className="text-fg">Contas conectadas</strong>, adicione WhatsApp ou Telegram. Para WA, escaneie o QR quando o sistema pedir; o estado
            “pronto” pode aparecer como <code className="text-xs bg-surface-2 px-1 rounded">connected</code> ou{' '}
            <code className="text-xs bg-surface-2 px-1 rounded">WORKING</code> consoante o provedor — o importante é a sessão ativa para envio.
          </li>
          <li>
            Em <strong className="text-fg">Auto disparos → Canais</strong>, configure cada canal (grupos de destino, limites e, se usar, auto-match).
          </li>
          <li>
            Em <strong className="text-fg">Grupos</strong>, importe grupos da conta WA e associe-os aos canais quando necessário.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-fg border-b border-border pb-2">6. Disparos manuais</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            Use <strong className="text-fg">Compor disparo</strong> para montar mensagem, escolher canais/grupos e enviar na hora ou agendar.
          </li>
          <li>
            Se o produto vier de marketplace, configure <strong className="text-fg">Afiliados</strong> (tags/IDs) para o link curto comissionar corretamente.
          </li>
          <li>
            A busca no topo (<kbd className="text-xs bg-surface-2 px-1 rounded">⌘K</kbd> / Ctrl+K) acha produtos no catálogo e leva rápido ao composer.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-fg border-b border-border pb-2">7. Auto disparos</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong className="text-fg">Auto disparos</strong>: visão geral do auto-match, filas e histórico recente.
          </li>
          <li>
            <strong className="text-fg">Por canal</strong>: threshold, máximo de disparos por ciclo e cooldown por canal.
          </li>
          <li>
            <strong className="text-fg">Jonfrey</strong>: fluxos assistidos pela IA quando estiverem ativos para o teu workspace.
          </li>
          <li>
            Disparos que exigem aprovação aparecem no indicador de pendentes na barra superior e na área de Auto disparos.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-fg border-b border-border pb-2">8. Anúncios pagos e links</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong className="text-fg">Anúncios pagos</strong>: campanhas recorrentes com cron, URL rastreada e canais alvo.
          </li>
          <li>
            <strong className="text-fg">Links públicos</strong> e <strong className="text-fg">Insights</strong> ajudam a acompanhar cliques e performance.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-fg border-b border-border pb-2">9. Taxonomia, match e curadoria (resumo)</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong className="text-fg">Taxonomia</strong> organiza categorias e padrões para classificar produtos de forma consistente.
          </li>
          <li>
            <strong className="text-fg">Match</strong> avalia se um produto do catálogo “parece” outro — útil antes de disparar em massa.
          </li>
          <li>
            <strong className="text-fg">Curadoria</strong> permite rever ou ajustar itens antes de saírem para grupos, quando o teu fluxo exige controlo humano.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-fg border-b border-border pb-2">10. Monitorar, configurar e zona de perigo</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong className="text-fg">Logs</strong>: filas, disparos, erros e jobs — <strong className="text-fg">primeiro sítio</strong> a abrir quando algo falha ou parece
            atrasado.
          </li>
          <li>
            <strong className="text-fg">Configurações</strong>: preferências da conta, LLM, integrações e separadores conforme o teu papel.
          </li>
          <li>
            <strong className="text-fg">Danger zone</strong> (só admin): operação destrutiva em dados operacionais (soft wipe). É obrigatório digitar{' '}
            <strong className="text-fg">exactamente</strong> a frase mostrada no ecrã — o servidor valida letra a letra (espaços a mais ou a menos falham). Opcionalmente
            podes pedir para reaplicar seeds de taxonomia ou de crawlers/canais de exemplo após a limpeza.
          </li>
          <li>
            O índice de tutoriais curtos está em <strong className="text-fg">Manual</strong> no menu (Sistema); o mesmo conteúdo abre pelo ícone de ajuda na barra — uma
            única fonte.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-fg border-b border-border pb-2">11. API e documentação técnica</h2>
        <p>
          Quem integra ferramentas externas pode usar a documentação interativa do backend em{' '}
          <strong className="text-fg">/api/swagger</strong> no host da API (URL interna depende do deploy). O painel que estás a ler não exige isso para uso normal.
        </p>
      </section>
    </div>
  )
}
