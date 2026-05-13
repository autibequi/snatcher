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
          <li>
            Este guia assume que já abriste o painel no navegador (URL que te deram) e fizeste <strong className="text-fg">login</strong>. Se ainda não tens utilizador,
            pede a um <strong className="text-fg">admin</strong> para te criar na área de equipa.
          </li>
          <li>Este guia é o caminho mais curto até ter uma conta de envio ligada e um canal com destinos.</li>
          <li>
            Para compor com produtos reais, o <strong className="text-fg">Catálogo</strong> precisa ter ofertas — em geral vindas de{' '}
            <strong className="text-fg">Crawlers</strong> ou importação; sem itens, a busca global não mostra nada útil.
          </li>
          <li>Se algo falhar, o primeiro sítio a olhar é <strong className="text-fg">Logs</strong>; o manual completo está em <strong className="text-fg">Manual operacional</strong> no menu.</li>
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
            Em <strong className="text-fg">Canais</strong> (Auto disparos → Canais), crie ou escolha um canal e defina audiência/limites quando fizer sentido.
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
      <Sec title="4 · Auto disparos (opcional)">
        <Ul>
          <li>
            Em <strong className="text-fg">Auto disparos</strong> e <strong className="text-fg">Jonfrey</strong> ative fluxos quando já dominares o envio manual.
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
          <li>Use como ponto de entrada: identifique pendências antes de ir a Auto disparos ou Composer.</li>
        </Ul>
      </Sec>
      <Sec title="Boas práticas">
        <Ul>
          <li>Se o badge de contas estiver vermelho, resolva em <strong className="text-fg">Contas conectadas</strong> primeiro.</li>
          <li>Combine com <strong className="text-fg">Logs</strong> quando algo parecer "travado" sem erro óbvio.</li>
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
          <code className="text-xs bg-surface-2 px-1 rounded">composed_by=auto-match</code>. Com <strong className="text-fg">full-auto</strong> desligado no Jonfrey,
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
            Na tab <strong className="text-fg">Jonfrey</strong>, a auditoria do assistente é a mesma que em <strong className="text-fg">Auto disparos → Jonfrey</strong>.
          </li>
          <li>
            Atalhos <code className="text-xs bg-surface-2 px-1 rounded">/logs?dispatchId=…</code> (ex.: a partir de Auto disparos ou após compor) abrem o detalhe desse disparo.
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
          <li>Composer e automações dependem disso para não mandar link "seco".</li>
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

  scoring: () => (
    <Shell>
      <Sec title="O que é o Score Engine">
        <p>
          O <strong className="text-fg">Score Engine</strong> é o ciclo que decide,
          a cada 5 minutos, qual produto do catálogo vai para cada grupo ativo. Ele
          pondera 7 sinais por produto e por grupo, aplica diversidade, exploração
          e defesas contra spam — e devolve uma escolha por grupo.
        </p>
        <p>
          Ele é controlado pelo toggle <strong className="text-fg">Score Engine</strong> em{' '}
          <strong className="text-fg">/admin/params</strong> (flag <code>use_algo_tick</code>).
          Desligado: nada é enviado pelo motor automático — só envios manuais. Ligado:
          tick a cada 5min dentro da janela de envio.
        </p>
      </Sec>

      <Sec title="Pipeline em 1 minuto">
        <p>Para cada grupo ativo, em cada tick:</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li><b>(Opcional) Thompson Sampling</b> — amostra Beta(α, β) por categoria do canal e escolhe uma categoria pra explorar/explorar-melhor neste tick.</li>
          <li><b>Top-K via SQL</b> — calcula score composto (7 termos) para todos os produtos elegíveis, ordena, pega os 10 melhores.</li>
          <li><b>MMR re-rank</b> — penaliza candidatos cuja categoria já saiu hoje no grupo; reordena o top-K.</li>
          <li><b>(Opcional) ε-greedy</b> — com probabilidade ε, escolhe um candidato aleatório do top-K em vez do nº 1.</li>
          <li><b>Enqueue</b> — manda pra fila de envio do modem responsável.</li>
        </ol>
      </Sec>

      <Sec title="A fórmula composta — 7 sinais">
        <p>
          O score final de um produto <b>p</b> num grupo <b>g</b> é a soma ponderada:
        </p>
        <pre className="bg-surface-2 p-3 rounded text-xs leading-snug overflow-x-auto">
{`final_score(p, g) =
    w_q · quality_score(p)              # 1. intrínseco
  + w_a · affinity(g, cat)              # 2. histórico do grupo
  + w_w · channel_weight(canal, cat)    # 3. sliders do operador
  + w_c · ctr_blended(g, cat, src)      # 4. cliques (hierárquico)
  + w_e · epc_blended(g, cat, src)      # 5. receita (hierárquico)
  + w_f · freshness(p)                  # 6. recência
  - w_s · saturation(g, cat)            # 7. anti-fadiga`}
        </pre>
        <p>
          Cada <b>w_*</b> é um tunable em /admin/params (defaults razoáveis abaixo).
          Os termos 4 e 5 usam <b>shrinkage hierárquico</b> entre grupo e canal —
          explicado mais à frente.
        </p>
      </Sec>

      <Sec title="Termo 1 · quality_score (w_q = 0.30)">
        <p>
          Score intrínseco do produto, calculado quando ele entra/atualiza no catálogo.
          Combina:
        </p>
        <Ul>
          <li><b>Imagem</b> presente e válida (+0.30)</li>
          <li><b>Preço atual</b> presente (+0.20)</li>
          <li><b>Título</b> presente (+0.10)</li>
          <li><b>Desconto</b> proporcional ao % (até +0.40)</li>
          <li><b>Boost 1.5×</b> nas 24h após uma queda detectada (<code>last_price_drop_at</code>)</li>
          <li><b>Trust do source</b> multiplica tudo (Amazon 0.9, marketplace pequeno 0.5)</li>
          <li><b>Decay temporal</b>: produto perde score com o tempo (half-life 7 dias)</li>
        </Ul>
        <p>
          Produtos com score abaixo de <code>quality_threshold</code> (default 0.40)
          ficam de fora — não entram no funil.
        </p>
      </Sec>

      <Sec title="Termo 2 · affinity (w_a = 0.20)">
        <p>
          Quão bem o grupo <b>g</b> historicamente responde a produtos da <b>categoria</b> de <b>p</b>.
          Tabela <code>group_category_affinity</code>, valor entre 0.05 e 1.0.
        </p>
        <p>
          Atualizada periodicamente pelo loop LLM <b>affinity_adjust</b> que olha:
        </p>
        <Ul>
          <li>CTR 30d daquela categoria nesse grupo</li>
          <li>EPC 30d</li>
          <li>Quantos samples houve (confidence)</li>
        </Ul>
        <p>
          Default neutro <code>0.50</code> para combinações ainda não medidas.
        </p>
      </Sec>

      <Sec title="Termo 3 · channel_weight (w_w = 0.15)">
        <p>
          O prior do operador — você define em <strong className="text-fg">/channels</strong> qual
          a importância de cada categoria por canal, via sliders 0–100%. Esse é o sinal humano
          que diz "este canal é principalmente de eletrônicos, mas aceita gaming".
        </p>
        <p>
          Tabela <code>channel_category_weights</code>. Categorias fora dos sliders contam como 0,
          o que efetivamente as exclui — comportamento desejado.
        </p>
      </Sec>

      <Sec title="Termos 4 e 5 · CTR e EPC (w_c = 0.15, w_e = 0.10)">
        <p>
          Performance histórica real — clicks e earnings-per-click dos últimos 30 dias,
          decompostos por <code>(grupo, categoria, source)</code>. O job{' '}
          <code>refresh_learned_weights</code> roda <b>a cada hora</b> e calcula tudo
          com <b>decay exponencial</b> (cliques recentes valem mais; half-life 7d).
        </p>
        <p>
          O grande pulo do gato aqui é o <b>shrinkage hierárquico</b> (estilo
          James–Stein):
        </p>
        <pre className="bg-surface-2 p-3 rounded text-xs leading-snug overflow-x-auto">
{`c = confidence(grupo)   # 0..1, sobe com samples_30d
ctr_blended = c · ctr_grupo + (1 - c) · ctr_canal`}
        </pre>
        <p>
          Tradução: <b>grupo novo</b> (poucos dados → confidence baixa) usa o sinal do
          canal-mãe, herdando aprendizado dos irmãos. <b>Grupo maduro</b> usa o próprio
          sinal. Transição é suave, sem cutoff arbitrário. O mesmo blend vale para EPC.
        </p>
      </Sec>

      <Sec title="Termo 6 · freshness (w_f = 0.05)">
        <p>
          Bônus por produto "fresco" — recém-virou <code>send_ready</code>. Decai
          exponencialmente:
        </p>
        <pre className="bg-surface-2 p-3 rounded text-xs leading-snug overflow-x-auto">
{`freshness(p) = exp(-ln(2) · hours / (half_life_freshness · 24))`}
        </pre>
        <p>
          Com half-life=7d: produto de 24h vale ~0.91, de 7d vale 0.5, de 14d vale 0.25.
          Peso pequeno (0.05) — é desempate, não fator dominante.
        </p>
      </Sec>

      <Sec title="Termo 7 · saturation (w_s = 0.30, subtraído)">
        <p>
          Penalidade <b>crescente</b> se a categoria já saiu hoje no grupo. Evita
          "spam de eletrônicos" num grupo onde acabou de sair um. Fórmula:
        </p>
        <pre className="bg-surface-2 p-3 rounded text-xs leading-snug overflow-x-auto">
{`penalty(g, cat) = 1 - anti_saturation_decay ^ n_sent_24h
# anti_saturation_decay = 0.60
#   n=0: 0     (produto novo não é penalizado)
#   n=1: 0.40  (já saiu 1× hoje)
#   n=2: 0.64
#   n=3: 0.78`}
        </pre>
        <p>
          Acoplado ao MMR (próxima seção), evita repetição dura mesmo sem janela
          mínima entre envios.
        </p>
      </Sec>

      <Sec title="MMR — diversidade no re-rank">
        <p>
          Após ordenar pelo score composto, aplicamos{' '}
          <b>Maximal Marginal Relevance</b> nos top-10:
        </p>
        <pre className="bg-surface-2 p-3 rounded text-xs leading-snug overflow-x-auto">
{`mmr(p) = λ · final_score(p)
       - (1-λ) · same_category_as_today(p, g)

λ = 1 - diversity_bonus_weight   # default λ = 0.70`}
        </pre>
        <p>
          Se uma categoria já saiu hoje no grupo, todos os produtos dessa categoria
          tomam −(1−λ) extra. Quem ganha o tick costuma ser uma categoria diferente,
          mantendo o feed variado. <code>diversity_bonus_weight</code> entre 0 e 0.80
          ajusta a força do efeito.
        </p>
      </Sec>

      <Sec title="Anti-repeat de produto — bypass de re-promoção">
        <p>
          Sem isso, um produto bom poderia ir 10× para o mesmo grupo numa semana.
          Janela padrão: <b>7 dias</b> entre dois envios do mesmo produto no mesmo grupo.
          Janela estendida para <b>14d</b> se o preço subiu desde o último envio
          (produto piorou).
        </p>
        <p>
          <b>Bypass excepcional</b> — quando uma queda nova justifica re-enviar
          antes da janela:
        </p>
        <pre className="bg-surface-2 p-3 rounded text-xs leading-snug overflow-x-auto">
{`bypass se TODOS verdadeiros:
  c.last_price_drop_at > last_sent_at
  last_sent_at < now() - repromo_cooldown_hours (default 24h)
  (price_at_send - price_atual) / price_at_send >= repromo_drop_threshold (default 10%)`}
        </pre>
        <p>
          Ou seja: caiu de novo, já passou 24h, e está pelo menos 10% mais barato
          que da última vez → reposta. Tunables expostos em /admin/params.
        </p>
      </Sec>

      <Sec title="Exploração ε-greedy (Fase 2, opt-in)">
        <p>
          Sistema 100% greedy ignora produtos novos que nunca tiveram chance.
          Solução: com probabilidade <b>ε</b>, escolhe um produto aleatório do
          top-K (não o nº 1).
        </p>
        <pre className="bg-surface-2 p-3 rounded text-xs leading-snug overflow-x-auto">
{`ε = epsilon_base · exp(-epsilon_decay_rate · dias_desde_lançamento)
# defaults: epsilon_base=0.40, decay_rate=0.00035/dia
# tempo zero: 40% exploração; 1 ano depois: ~34%`}
        </pre>
        <p>
          Gate: flag <code>use_epsilon_explore</code>. Ligue depois de validar a
          Fase 1 — sistema bem calibrado precisa de menos exploração.
        </p>
      </Sec>

      <Sec title="Thompson Sampling (Fase 3, opt-in)">
        <p>
          Bandit Bernoulli por <code>(grupo, categoria)</code>. Cada arm tem α e β
          (Beta posterior). A cada tick:
        </p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Para cada categoria do canal, amostra <code>Beta(α, β)</code></li>
          <li>Escolhe a categoria com maior sample → vira filtro para o top-K SQL</li>
        </ol>
        <p>
          <b>Atualização (cada tick, gated por flag):</b>
        </p>
        <Ul>
          <li>Conversão → <code>α += 1</code></li>
          <li>Click → <code>α += click_reward_weight</code> (default 0.10 = 10 clicks ≈ 1 conversão)</li>
          <li>Envio &gt;24h sem conversão → <code>β += 1</code></li>
        </Ul>
        <p>
          <b>Warm-start hierárquico:</b> grupo novo nasce com α/β = 25% do canal-mãe.
          Converge rápido sem perder especialização ao coletar dados próprios.
        </p>
        <p>
          <b>Três cursores</b> (<code>cursor_conversions</code>, <code>cursor_clicks</code>,
          <code>cursor_losses</code>) garantem que cada evento é processado{' '}
          <b>exatamente uma vez</b> — sem double-count.
        </p>
        <p>
          Gate: <code>use_thompson_sampling</code>. Recomendado ligar só após ~30
          dias de dados.
        </p>
      </Sec>

      <Sec title="Shortlinks por grupo — atribuição honesta">
        <p>
          Cada envio gera um <code>short_id</code> em <code>group_shortlinks</code>{' '}
          ligado a <code>(catalog_id, group_id)</code>. Quando alguém clica:
        </p>
        <pre className="bg-surface-2 p-3 rounded text-xs leading-snug overflow-x-auto">
{`SELECT catalog_id, group_id FROM group_shortlinks WHERE short_id = $1
# DETERMINÍSTICO — clique sempre conta pro grupo original,
# não importa onde a pessoa viu`}
        </pre>
        <p>
          Antes era inferido pelo "último grupo que mandou esse produto" — atribuição
          podia ir pro grupo errado se o mesmo produto fosse enviado a vários grupos.
          Agora é determinístico.
        </p>
      </Sec>

      <Sec title="Cap anti-viralização">
        <p>
          E se o link de um grupo viralizar fora dele? Antes, todos os cliques
          externos contavam pro CTR do grupo original — envenenando o bandit:
          "grupo X ama eletrônicos!" quando na verdade era a galera do WhatsApp
          do tio.
        </p>
        <pre className="bg-surface-2 p-3 rounded text-xs leading-snug overflow-x-auto">
{`clicks_efetivos = LEAST(clicks_reais, k · member_count)
# k = click_cap_per_member (default 3.0)
# grupo de 100 membros: até 300 clicks contam pro learning
# acima disso é viralização — entra em métricas, não no scoring`}
        </pre>
        <p>
          Aplicado tanto no <code>refresh_learned_weights</code> (CTR/EPC) quanto
          no Thompson (recompensa por click). Excedente fica disponível em{' '}
          <strong className="text-fg">/analytics → tab Virality</strong>.
        </p>
      </Sec>

      <Sec title="Como debugar uma escolha">
        <p>
          "Por que o sistema mandou este produto pra este grupo agora?"
        </p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            Abra <strong className="text-fg">/analytics → Learned Weights</strong> — confira CTR/EPC do
            grupo×categoria; valores muito altos podem dominar a fórmula.
          </li>
          <li>
            Em <strong className="text-fg">/channels</strong>, veja os sliders do canal — categoria
            com 80% pesa muito mais que uma com 20%.
          </li>
          <li>
            Confira em <strong className="text-fg">/analytics → Virality</strong> se aquele grupo
            tem ratio alto — se sim, o sinal CTR pode estar mascarado por viralização
            (mesmo com o cap).
          </li>
          <li>
            Em <strong className="text-fg">/admin/params</strong>, valide se os
            <code>score_weight_*</code> estão balanceados (soma ~1.0 sem o w_s).
            Se w_c=0.9, CTR domina tudo.
          </li>
          <li>
            <strong className="text-fg">/logs</strong> mostra cada tick com
            "<code>enqueued=N groups=M lambda=0.7</code>" — útil pra ver volume.
          </li>
        </ol>
      </Sec>

      <Sec title="Como tunar (ordem recomendada)">
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            <b>Comece em padrões.</b> Defaults são razoáveis: w_q=0.30, w_a=0.20,
            w_w=0.15, w_c=0.15, w_e=0.10, w_f=0.05, w_s=0.30.
          </li>
          <li>
            <b>Configure os sliders dos canais</b> em <strong className="text-fg">/channels</strong>{' '}
            primeiro — é o sinal humano mais direto.
          </li>
          <li>
            Deixe rodar <b>7 dias</b>. Confira <strong className="text-fg">/analytics → Learned Weights</strong>:
            categorias com EPC alto e samples ≥ 50 são sinais de verdade.
          </li>
          <li>
            Se sentir "mesmice", aumente <code>diversity_bonus_weight</code> ou
            ligue <code>use_epsilon_explore</code>.
          </li>
          <li>
            Se quiser "mais agressivo no que funciona", aumente <code>w_c</code> e <code>w_e</code>;
            diminua <code>w_q</code> (qualidade pura).
          </li>
          <li>
            Após 30d, ligue <code>use_thompson_sampling</code> para auto-otimização
            por categoria.
          </li>
          <li>
            Monitore <strong className="text-fg">/analytics → Virality</strong>: ratio alto num
            grupo é informação valiosa pra escalar canal/expandir audiência.
          </li>
        </ol>
      </Sec>

      <Sec title="Glossário dos tunables">
        <p className="text-fg-3">Todos em <strong className="text-fg">/admin/params</strong>.</p>
        <table className="w-full text-xs border border-border rounded overflow-hidden">
          <thead className="bg-surface-2">
            <tr>
              <th className="text-left px-2 py-1.5 border-b border-border">Param</th>
              <th className="text-left px-2 py-1.5 border-b border-border">Default</th>
              <th className="text-left px-2 py-1.5 border-b border-border">O que faz</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <tr><td className="px-2 py-1.5 font-mono">use_algo_tick</td><td className="px-2 py-1.5">0</td><td className="px-2 py-1.5">Liga/desliga o Score Engine</td></tr>
            <tr><td className="px-2 py-1.5 font-mono">use_epsilon_explore</td><td className="px-2 py-1.5">0</td><td className="px-2 py-1.5">Liga exploração ε-greedy (Fase 2)</td></tr>
            <tr><td className="px-2 py-1.5 font-mono">use_thompson_sampling</td><td className="px-2 py-1.5">0</td><td className="px-2 py-1.5">Liga bandit por categoria (Fase 3)</td></tr>
            <tr><td className="px-2 py-1.5 font-mono">quality_threshold</td><td className="px-2 py-1.5">0.40</td><td className="px-2 py-1.5">Score mínimo pra entrar no funil</td></tr>
            <tr><td className="px-2 py-1.5 font-mono">score_weight_quality</td><td className="px-2 py-1.5">0.30</td><td className="px-2 py-1.5">w_q · quality intrínseco</td></tr>
            <tr><td className="px-2 py-1.5 font-mono">score_weight_affinity</td><td className="px-2 py-1.5">0.20</td><td className="px-2 py-1.5">w_a · afinidade grupo×categoria</td></tr>
            <tr><td className="px-2 py-1.5 font-mono">score_weight_channel</td><td className="px-2 py-1.5">0.15</td><td className="px-2 py-1.5">w_w · sliders do canal</td></tr>
            <tr><td className="px-2 py-1.5 font-mono">score_weight_ctr</td><td className="px-2 py-1.5">0.15</td><td className="px-2 py-1.5">w_c · CTR blended (com canal)</td></tr>
            <tr><td className="px-2 py-1.5 font-mono">score_weight_epc</td><td className="px-2 py-1.5">0.10</td><td className="px-2 py-1.5">w_e · EPC blended</td></tr>
            <tr><td className="px-2 py-1.5 font-mono">score_weight_freshness</td><td className="px-2 py-1.5">0.05</td><td className="px-2 py-1.5">w_f · frescor temporal</td></tr>
            <tr><td className="px-2 py-1.5 font-mono">score_weight_saturation</td><td className="px-2 py-1.5">0.30</td><td className="px-2 py-1.5">w_s · penalidade subtraída</td></tr>
            <tr><td className="px-2 py-1.5 font-mono">anti_saturation_decay</td><td className="px-2 py-1.5">0.60</td><td className="px-2 py-1.5">Base do decay de saturação</td></tr>
            <tr><td className="px-2 py-1.5 font-mono">diversity_bonus_weight</td><td className="px-2 py-1.5">0.30</td><td className="px-2 py-1.5">Força do MMR (λ = 1 − este)</td></tr>
            <tr><td className="px-2 py-1.5 font-mono">half_life_freshness</td><td className="px-2 py-1.5">7</td><td className="px-2 py-1.5">Dias do half-life de frescor</td></tr>
            <tr><td className="px-2 py-1.5 font-mono">learned_half_life_days</td><td className="px-2 py-1.5">7</td><td className="px-2 py-1.5">Dias do half-life do CTR/EPC</td></tr>
            <tr><td className="px-2 py-1.5 font-mono">epsilon_base</td><td className="px-2 py-1.5">0.40</td><td className="px-2 py-1.5">ε inicial (Fase 2)</td></tr>
            <tr><td className="px-2 py-1.5 font-mono">epsilon_decay_rate</td><td className="px-2 py-1.5">0.00035</td><td className="px-2 py-1.5">Decay diário do ε</td></tr>
            <tr><td className="px-2 py-1.5 font-mono">click_reward_weight</td><td className="px-2 py-1.5">0.10</td><td className="px-2 py-1.5">α += este · clicks (Thompson)</td></tr>
            <tr><td className="px-2 py-1.5 font-mono">click_cap_per_member</td><td className="px-2 py-1.5">3.0</td><td className="px-2 py-1.5">Cap anti-viralização (k)</td></tr>
            <tr><td className="px-2 py-1.5 font-mono">antirepeat_window_days</td><td className="px-2 py-1.5">7</td><td className="px-2 py-1.5">Janela padrão entre re-envios</td></tr>
            <tr><td className="px-2 py-1.5 font-mono">antirepeat_window_days_price_up</td><td className="px-2 py-1.5">14</td><td className="px-2 py-1.5">Janela estendida se preço subiu</td></tr>
            <tr><td className="px-2 py-1.5 font-mono">repromo_drop_threshold</td><td className="px-2 py-1.5">0.10</td><td className="px-2 py-1.5">Queda mínima pra bypass (10%)</td></tr>
            <tr><td className="px-2 py-1.5 font-mono">repromo_cooldown_hours</td><td className="px-2 py-1.5">24</td><td className="px-2 py-1.5">Min entre 2 envios mesmo c/ bypass</td></tr>
          </tbody>
        </table>
      </Sec>

      <Sec title="Garantias do sistema">
        <Ul>
          <li><b>Idempotência:</b> três cursores no Thompson garantem que cada evento conta uma vez.</li>
          <li><b>Atribuição honesta:</b> shortlinks por grupo eliminam ambiguidade de clique.</li>
          <li><b>Anti-envenenamento:</b> cap k×members protege contra viralização externa.</li>
          <li><b>Anti-spam:</b> 7d hard-window + saturation + MMR cobrem 3 camadas.</li>
          <li><b>Marketplace-correto:</b> CTR/EPC casados por <code>source_id</code> (não mistura Amazon e Magalu).</li>
          <li><b>Fallback gracioso:</b> grupo sem dados usa canal; canal sem dados usa neutro.</li>
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
