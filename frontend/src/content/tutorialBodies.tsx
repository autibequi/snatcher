import React from 'react'
import { OperationalManualContent } from './operationalManual'

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="space-y-10 text-sm text-fg-2 leading-relaxed">{children}</div>
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-fg border-b border-border pb-2">{title}</h2>
      {children}
    </section>
  )
}

function Ul({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc pl-5 space-y-2">{children}</ul>
}

export const tutorialBodyComponents: Record<string, React.FC> = {
  quickstarter: () => (
    <Shell>
      <Sec title="Antes de tudo">
        <Ul>
          <li>Este guia é o caminho mais curto até ter uma conta pronta a enviar e um canal configurado.</li>
          <li>
            Para compor com produtos reais, o <strong className="text-fg">Catálogo</strong> precisa ter ofertas — em geral vindas de{' '}
            <strong className="text-fg">Crawlers</strong> ou importação; sem itens, use a busca só depois de haver dados.
          </li>
          <li>Se algo falhar, o primeiro sítio a olhar é <strong className="text-fg">Logs</strong>; o manual completo está em <strong className="text-fg">Manual operacional</strong>.</li>
        </Ul>
      </Sec>
      <Sec title="1 · Contas conectadas">
        <Ul>
          <li>
            Em <strong className="text-fg">Contas conectadas</strong>, adicione WhatsApp ou Telegram e conclua o fluxo (ex.: QR no WhatsApp).
          </li>
          <li>Só avance quando o estado indicar sessão ativa — sem conta ligada não há grupos nem envio.</li>
        </Ul>
      </Sec>
      <Sec title="2 · Canais e grupos">
        <Ul>
          <li>
            Em <strong className="text-fg">Canais</strong> (Automações → Canais), crie ou escolha um canal e defina audiência/limites quando fizer sentido.
          </li>
          <li>
            Em <strong className="text-fg">Grupos</strong>, importe grupos da conta e associe-os ao canal — sem destino não há disparo.
          </li>
        </Ul>
      </Sec>
      <Sec title="3 · Primeiro disparo">
        <Ul>
          <li>
            Abra <strong className="text-fg">Compor disparo</strong>, escolha produto(s) no catálogo, canais/grupos e envie um teste ou agende.
          </li>
          <li>Se usar marketplace, confira <strong className="text-fg">Afiliados</strong> para o link curto comissionar certo.</li>
        </Ul>
      </Sec>
      <Sec title="4 · Automações (opcional)">
        <Ul>
          <li>
            Em <strong className="text-fg">Automações</strong> e <strong className="text-fg">Jonfrey</strong> ative fluxos quando já dominares o envio manual.
          </li>
          <li>Threshold, cooldown e aprovações aparecem nestas telas — comece conservador.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  operacional: () => <OperationalManualContent />,

  dashboard: () => (
    <Shell>
      <Sec title="Visão geral">
        <Ul>
          <li>
            O <strong className="text-fg">Dashboard</strong> resume fila de trabalho, contas conectadas e sinais rápidos para o dia.
          </li>
          <li>Use como ponto de entrada: identifique pendências antes de ir a Automações ou Composer.</li>
        </Ul>
      </Sec>
      <Sec title="Boas práticas">
        <Ul>
          <li>Se o badge de contas estiver vermelho, resolva em <strong className="text-fg">Contas conectadas</strong> primeiro.</li>
          <li>Combine com <strong className="text-fg">Logs</strong> quando algo parecer “travado” sem erro óbvio.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  compose: () => (
    <Shell>
      <Sec title="O que é">
        <Ul>
          <li>
            <strong className="text-fg">Compor disparo</strong> monta a mensagem, escolhe produtos e canais/grupos, e envia na hora ou agenda.
          </li>
          <li>
            O preview ao lado (ou no topo em telas estreitas) atualiza em tempo real conforme você edita texto e seleção.
          </li>
        </Ul>
      </Sec>
      <Sec title="Checklist rápido">
        <Ul>
          <li>Produtos com afiliado: confira tags em <strong className="text-fg">Afiliados</strong> para o link curto correto.</li>
          <li>Use a busca (<kbd className="text-xs bg-surface-2 px-1 rounded">⌘K</kbd>) para puxar produtos do catálogo rápido.</li>
          <li>Revise preview WhatsApp antes de confirmar envio em massa.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  ads: () => (
    <Shell>
      <Sec title="Campanhas recorrentes">
        <Ul>
          <li>
            <strong className="text-fg">Anúncios pagos por terceiros</strong> — disparos recorrentes nos grupos com tracking de cliques via short link.
          </li>
          <li>
            <strong className="text-fg">Anúncios pagos</strong> disparam em cron com URL rastreada e canais alvo — útil para ritmo fixo (ex.: manhã/noite).
          </li>
          <li>Cada campanha deve ter janela de envio coerente com o hábito da audiência.</li>
        </Ul>
      </Sec>
      <Sec title="Monitoração">
        <Ul>
          <li>Acompanhe performance em <strong className="text-fg">Insights</strong> e links rastreados onde configurado.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  automations: () => (
    <Shell>
      <Sec title="Esta página">
        <Ul>
          <li>
            <strong className="text-fg">Piloto global</strong>, prévia do match, <strong className="text-fg">pendentes de aprovação</strong> e{' '}
            <strong className="text-fg">linha do tempo</strong> — o mesmo fluxo que você vê na tela; conceitos longos ficam aqui (ou no índice em /manual).
          </li>
          <li>
            Auto-match roda em ciclo: novos produtos entram na prévia; acima do threshold viram candidatos a dispatch.
          </li>
        </Ul>
      </Sec>

      <Sec title="Pipeline agendado vs auto-match">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-3 mb-1.5">Pipeline agendado</p>
        <p className="text-fg-2">
          Fluxo <strong className="text-fg">scan → process → evaluate</strong>: dentro da <strong className="text-fg">janela de envio</strong> e com{' '}
          <code className="text-xs bg-surface-2 px-1 rounded">events_enabled</code> no canal, detecta novidades, quedas de preço e mínimos e dispara por adapters.
          É o caminho de <em>eventos</em> — <strong className="text-fg">não</strong> é a fila contínua do auto-match.
        </p>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-3 mt-5 mb-1.5">Auto-match</p>
        <p className="text-fg-2">
          A cada ~<strong className="text-fg">1 min</strong>, lê produtos recentes do catálogo, pontua contra a audiência dos canais e cria dispatches{' '}
          <code className="text-xs bg-surface-2 px-1 rounded">composed_by=auto-match</code>. Com <strong className="text-fg">full-auto</strong> desligado em Configurações,
          o status fica <code className="text-xs bg-surface-2 px-1 rounded">pending_approval</code> até você aprovar; só{' '}
          <code className="text-xs bg-surface-2 px-1 rounded">queued</code> entra no worker Evolution (WhatsApp).{' '}
          <strong className="text-fg">Rate limit:</strong> 3 mensagens/hora/grupo.
        </p>
      </Sec>

      <Sec title="Atalho mental">
        <Ul>
          <li>
            <strong className="text-fg">Eventos</strong> (por canal + <code className="text-xs bg-surface-2 px-1 rounded">events_enabled</code>): novidades, quedas, mínimos — respeita janela de envio.
          </li>
          <li>
            <strong className="text-fg">Fila / auto-match</strong>: scoring contínuo; threshold e limites por canal em <strong className="text-fg">Canais</strong>.
          </li>
        </Ul>
      </Sec>

      <Sec title="Linha do tempo (bloco na página)">
        <Ul>
          <li>
            De cima para baixo: <strong className="text-fg">próximos</strong> (prévia do auto-match), depois <strong className="text-fg">sua fila</strong> se full-auto estiver
            desligado, por fim <strong className="text-fg">histórico</strong> do que já disparou.
          </li>
        </Ul>
      </Sec>
    </Shell>
  ),

  canais: () => (
    <Shell>
      <Sec title="Por canal">
        <Ul>
          <li>
            Esta tela é <strong className="text-fg">configuração e monitor</strong> dos canais lógicos (lista, criar, sugerir).
          </li>
          <li>
            Cada linha é um <strong className="text-fg">canal lógico</strong>: audiência, grupos de destino, threshold do match, cooldown e limites por ciclo.
          </li>
          <li>Abra o detalhe do canal para audiência, grupos WA/TG e política de disparo.</li>
        </Ul>
      </Sec>
      <Sec title="Boas práticas">
        <Ul>
          <li>Canal pausado ou sem grupos não gera candidatos — verifique antes de reclamar da prévia vazia.</li>
          <li>Cooldown alto reduz spam; threshold alto aumenta qualidade e reduz volume.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  jonfrey: () => (
    <Shell>
      <Sec title="Visão geral">
        <p className="text-fg-2">
          <strong className="text-fg">Jonfrey</strong> é um assistente que orquestra automaticamente outras automações — configura crawlers, audita pendências e ajusta thresholds. O histórico de execuções fica em{' '}
          <strong className="text-fg">Logs → aba Jonfrey</strong> (e na fila ⏱ na barra superior).
        </p>
        <p className="text-fg-2 mt-3">
          Com o <strong className="text-fg">Auto-pilot</strong> ligado, o Jonfrey corre em ciclo e dispara as automações que estão ativas na lista da página.
        </p>
      </Sec>
      <Sec title="Assistente IA">
        <Ul>
          <li>
            <strong className="text-fg">Jonfrey</strong> executa <strong className="text-fg">ações configuráveis</strong> por tipo (incluindo tarefas com LLM quando aplicável).
            O que aparece na lista depende do backend do workspace — cada ação tem auditoria em <strong className="text-fg">Logs → Jonfrey</strong>.
          </li>
          <li>
            Full-auto, filtro só curated/auto e webhooks de aprovação são configurados nesta página (Jonfrey) — não há duplicata em Configurações.
          </li>
        </Ul>
      </Sec>
      <Sec title="Transparência">
        <Ul>
          <li>Revise logs e histórico sugerido antes de escalar automação em produção.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  crawlers: () => (
    <Shell>
      <Sec title="Fontes de produto">
        <Ul>
          <li>
            <strong className="text-fg">Crawlers</strong> puxam ofertas de marketplaces ou espionam grupos concorrentes conforme configurado.
          </li>
          <li>Cada crawler tem agenda e escopo — evite overlap duplicando o mesmo SKU sem necessidade.</li>
        </Ul>
      </Sec>
      <Sec title="Depois do crawl">
        <Ul>
          <li>Produtos entram no <strong className="text-fg">Catálogo</strong>; podem passar por <strong className="text-fg">Triagem</strong> antes do match.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  curation: () => (
    <Shell>
      <Sec title="Triagem">
        <Ul>
          <li>
            Lista produtos sem marca, categoria ou atributos completos — mesmo que já estejam no catálogo.
          </li>
          <li>Use para aprovar, corrigir ou descartar itens antes que entrem forte no match/disparo.</li>
          <li>Reduz ruído de crawl ruim e protege marca.</li>
        </Ul>
      </Sec>
      <Sec title="Fluxo">
        <Ul>
          <li>Combine com taxonomia e catálogo para manter categorias e nomes consistentes.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  catalog: () => (
    <Shell>
      <Sec title="Catálogo">
        <Ul>
          <li>É a fonte única de produtos para busca, composer e auto-match.</li>
          <li>Filtros e estado (ativo, preço, origem) afetam quem entra na prévia do match.</li>
        </Ul>
      </Sec>
      <Sec title="Dicas">
        <Ul>
          <li>Imagens e nome canônico ruins prejudicam preview e conversão — corrija na origem ou manualmente.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  groups: () => (
    <Shell>
      <Sec title="Grupos WhatsApp / Telegram">
        <Ul>
          <li>
            Grupos importados das contas — vincule-os a canais no detalhe de cada canal ou do grupo.
          </li>
          <li>
            Importe grupos a partir das <strong className="text-fg">Contas</strong> conectadas; cada grupo físico pode aparecer em vários canais lógicos.
          </li>
          <li>Vincule grupos aos canais certos — sem destino não há envio.</li>
        </Ul>
      </Sec>
      <Sec title="Organização">
        <Ul>
          <li>Mantenha nomes reconhecíveis e remova grupos mortos para não confundir relatórios.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  accounts: () => (
    <Shell>
      <Sec title="Contas conectadas">
        <Ul>
          <li>WhatsApp via QR; Telegram conforme fluxo do provedor. Sem conta ativa não há envio.</li>
          <li>Status deve chegar a conectado antes de confiar em disparos ou imports de grupo.</li>
        </Ul>
      </Sec>
      <Sec title="Segurança">
        <Ul>
          <li>Limite contas por política interna; troque sessão se suspeitar de ban ou compromise.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  analytics: () => (
    <Shell>
      <Sec title="Insights de cliques">
        <Ul>
          <li>Métricas de engajamento e performance de links.</li>
          <li>Mede interesse em links rastreados e ajuda a comparar canais/ofertas.</li>
          <li>Use para decidir horários e tipos de produto, não como única métrica de receita.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  links: () => (
    <Shell>
      <Sec title="Links públicos">
        <Ul>
          <li>Páginas e redirecionamentos estáveis para divulgar entrada em grupos ou campanhas.</li>
          <li>Cadeias de fallback garantem que o utilizador chegue a um grupo com vaga quando possível.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  clusters: () => (
    <Shell>
      <Sec title="Clusters">
        <Ul>
          <li>Agrupa canais por comportamento de audiência para comparar desempenho e testes.</li>
          <li>Recomputar após mudanças grandes de público ou oferta.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  logs: () => (
    <Shell>
      <Sec title="Logs">
        <Ul>
          <li>Primeiro lugar para filas, disparos, erros de adapter e jobs.</li>
          <li>
            Na tab <strong className="text-fg">Disparos</strong>: filtros por <strong className="text-fg">estado</strong>, datas, conta WA; a coluna mostra canal/grupo em cada linha.
            Abra uma linha para ver detalhe do disparo.
          </li>
          <li>
            Há tabs separadas para <strong className="text-fg">Crawlers</strong>, <strong className="text-fg">Jonfrey</strong>, <strong className="text-fg">Matches</strong>, etc.
          </li>
          <li>
            Na tab <strong className="text-fg">Jonfrey</strong>, a auditoria do assistente é a mesma que em <strong className="text-fg">Automações → Jonfrey</strong>.
          </li>
          <li>
            Atalhos <code className="text-xs bg-surface-2 px-1 rounded">/logs?dispatchId=…</code> (ex.: a partir de Automações ou após compor) abrem o detalhe desse disparo.
          </li>
        </Ul>
      </Sec>
      <Sec title="Suporte">
        <Ul>
          <li>Em falhas intermitentes, cruze horário do log com mudanças recentes em canais ou contas.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  affiliates: () => (
    <Shell>
      <Sec title="Afiliados">
        <Ul>
          <li>Credenciais e tags por programa. Sem isso, o link curto não comissiona.</li>
          <li>Configure programas e IDs por marketplace para links curtos comissionarem certo.</li>
          <li>Composer e automações dependem disso para não mandar link “seco”.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  taxonomy: () => (
    <Shell>
      <Sec title="Taxonomia">
        <Ul>
          <li>Categorias e marcas usadas no Match e detectadas pelo crawler.</li>
          <li>Estrutura de categorias e padrões que alimentam match, filtros e relatórios.</li>
          <li>Mantenha estável: renomeações em massa podem exigir reprocessamento.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  settings: () => (
    <Shell>
      <Sec title="Configurações">
        <Ul>
          <li>Preferências da conta, integrações LLM, limites de envio e identidade de links públicos.</li>
          <li>Alterações aqui podem afetar Jonfrey, composer e automações — teste em janela controlada.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  match: () => (
    <Shell>
      <Sec title="Match">
        <Ul>
          <li>Escolha um produto. O sistema mostra <strong className="text-fg">quais grupos têm fit</strong> — e por quê.</li>
          <li>Visualiza scoring produto↔canal e ajuda a entender por que algo não disparou.</li>
          <li>Ajuste audiência do canal ou dados do produto (categoria, marca, preço) conforme as dicas da própria tela.</li>
        </Ul>
      </Sec>
    </Shell>
  ),
}

export function renderTutorialBody(slug: string): React.ReactNode | null {
  const C = tutorialBodyComponents[slug]
  if (!C) return null
  return <C />
}
