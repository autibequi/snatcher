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
          <li>Este guia assume que você já fez login no painel. Se não tem usuário, peça a um admin.</li>
          <li>Caminho mais curto: <b>Modem → Conta WA → Canal com sliders → Grupos vinculados → Templates → Score Engine ligado</b>.</li>
          <li>Sem produtos no Catálogo nada acontece — eles vêm dos <b>Crawlers</b> automaticamente.</li>
          <li>Se algo travar, abra <strong className="text-fg">/activity</strong>; problemas profundos em <strong className="text-fg">/admin/audit</strong>.</li>
        </Ul>
      </Sec>

      <Sec title="1 · Modems & Senders">
        <Ul>
          <li>Em <strong className="text-fg">Modems</strong> (sidebar Distribuição), confirme que existe ao menos 1 modem ativo. Em deploys cloud, o <b>HOST modem</b> é o servidor local (sem hardware 4G).</li>
          <li>Clique <b>Conectar conta WA</b> em um modem. Aparece QR code da Evolution API — escaneie do celular operacional.</li>
          <li>Após conectar, defina <b>telefone</b>, <b>nickname</b> e <b>cota diária</b> (default 50 msgs/dia). Status fica <code>primary</code>.</li>
        </Ul>
      </Sec>

      <Sec title="2 · Canal lógico + sliders de categoria">
        <Ul>
          <li>Em <strong className="text-fg">Canais</strong>, crie um canal (ex.: "Promo Geral"). Quality threshold (default 0.40) e daily cap (default 30 msgs).</li>
          <li>Configure os <b>sliders de categoria</b> (0–100%): "este canal é 60% eletrônicos, 30% gaming, 10% casa". Total não precisa somar 100% — são pesos relativos.</li>
        </Ul>
      </Sec>

      <Sec title="3 · Grupos">
        <Ul>
          <li>Em <strong className="text-fg">Grupos</strong>, importe os grupos WhatsApp da conta primary recém-conectada.</li>
          <li>Vincule cada grupo ao canal certo. Sem grupo no canal, o motor não tem onde mandar.</li>
        </Ul>
      </Sec>

      <Sec title="4 · Templates (mensagem)">
        <Ul>
          <li>Em <strong className="text-fg">Templates</strong>, valide se existe pelo menos 1 template por categoria. Use variáveis: <code>{'{titulo}'}</code>, <code>{'{preco_de}'}</code>, <code>{'{preco_por}'}</code>, <code>{'{desconto}'}</code>, <code>{'{link}'}</code>.</li>
          <li>Templates ficam ativos por padrão. Toggle de <code>enabled</code> permite pausar sem deletar.</li>
        </Ul>
      </Sec>

      <Sec title="5 · Liga o motor (ou compõe manual)">
        <p className="text-fg-2">Você tem dois caminhos a partir daqui:</p>
        <Ul>
          <li><b>Manual</b>: vá em <strong className="text-fg">Compor disparo</strong>, busque produtos, escolha canais/grupos, envie. Bom para testar.</li>
          <li><b>Automático</b>: em <strong className="text-fg">/admin/params</strong>, ative <code>use_algo_tick</code>. A cada 5min o Score Engine escolhe e envia. Veja o tutorial <strong className="text-fg">Algoritmo de Scoring</strong> antes.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  operacional: () => <OperationalManualContent />,

  dashboard: () => (
    <Shell>
      <Sec title="Visão geral">
        <Ul>
          <li>Ponto de entrada operacional — fila de envio, conta WA ativa, últimos disparos, alertas.</li>
          <li>Use ao começar o dia para confirmar que tudo está saudável antes de mexer em scoring ou compor.</li>
        </Ul>
      </Sec>
      <Sec title="Checks rápidos">
        <Ul>
          <li><b>Topbar</b>: indicador de contas — verde = pelo menos 1 primary online; vermelho = nenhuma. Resolva em <strong className="text-fg">/admin/senders</strong>.</li>
          <li><b>Card "fila"</b>: quantas mensagens pending em <code>send_queue</code>. Crescimento sustentado indica modem travado.</li>
          <li><b>Card "tick"</b>: se Score Engine está ON, último horário de run e quantos envios na hora.</li>
          <li><b>Alertas</b>: regras de <code>alert_rules</code> disparadas (cota próxima, conta caída). Detalhe em <strong className="text-fg">/admin/alerts</strong>.</li>
        </Ul>
      </Sec>
      <Sec title="Quando algo está estranho">
        <p className="text-fg-2">Roteiro padrão:</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li><strong className="text-fg">/activity</strong> — vê se houve disparo recente, status, erros.</li>
          <li><strong className="text-fg">/admin/senders</strong> — confirma sessão WA viva (api_online + wa_status).</li>
          <li><strong className="text-fg">/admin/audit</strong> — logs do backend, exceptions, jobs falhando.</li>
          <li><strong className="text-fg">/admin/params</strong> — alguém pode ter desligado <code>use_algo_tick</code>.</li>
        </ol>
      </Sec>
    </Shell>
  ),

  compose: () => (
    <Shell>
      <Sec title="O que é">
        <Ul>
          <li>Disparo manual para 1+ grupos. Use para teste, blast pontual ou conteúdo não-coberto pelo Score Engine.</li>
          <li>Endpoint: <code>POST /api/dispatch/manual</code>. Expande canais → grupos automaticamente.</li>
        </Ul>
      </Sec>
      <Sec title="Fluxo">
        <ol className="list-decimal pl-5 space-y-1">
          <li><b>Buscar produto</b> no catálogo (filtros por categoria, source, qualidade).</li>
          <li><b>Escolher template</b> ou escrever mensagem livre. Variáveis aceitas: <code>{'{produto}'}</code>, <code>{'{de}'}</code>, <code>{'{por}'}</code>, <code>{'{desconto}'}</code>, <code>{'{link}'}</code>.</li>
          <li><b>Selecionar canais e/ou grupos</b>. Canais expandem para todos os grupos vinculados.</li>
          <li><b>Preview</b> do lado direito mostra como vai aparecer no WhatsApp.</li>
          <li><b>Disparar</b>. Resultado vai pra <strong className="text-fg">/activity</strong>.</li>
        </ol>
      </Sec>
      <Sec title="Gotchas">
        <Ul>
          <li>Manual <b>não</b> respeita anti-repeat 7d — você é responsável por não saturar.</li>
          <li>Cada grupo recebe um shortlink único para atribuição correta de clicks (vai pra <code>group_shortlinks</code>).</li>
          <li>Sem afiliado configurado, o link sai "seco" (canonical). Configure em <strong className="text-fg">/affiliates</strong>.</li>
          <li>Imagem do produto vem do cache local quando disponível — sem isso, baixa da URL no momento do envio.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  ads: () => (
    <Shell>
      <Sec title="Página deprecada">
        <p className="text-fg-2">
          A página <code>/ads</code> foi removida e redireciona para <strong className="text-fg">/activity</strong>.
          O conceito de "anúncios pagos com cron" foi absorvido pelo <b>Score Engine</b> + <b>Templates</b>.
        </p>
        <p className="text-fg-2 mt-3">Para o caso de uso equivalente hoje:</p>
        <Ul>
          <li><b>Disparos recorrentes automáticos</b> → ligue o Score Engine (<code>use_algo_tick</code>) e configure os pesos no canal. Veja <strong className="text-fg">Algoritmo de Scoring</strong>.</li>
          <li><b>Conteúdo de terceiros pago</b> → use <strong className="text-fg">Compor disparo</strong> manual com a frequência desejada.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  automations: () => (
    <Shell>
      <Sec title="Conceito antigo">
        <p className="text-fg-2">
          "Auto-match" / "auto disparos" eram um sistema heurístico que cruzava produtos com canais e pedia aprovação.
          Foi <b>substituído pelo Score Engine</b> — fórmula composta de 7 sinais + MMR + opcionalmente ε-greedy e Thompson Sampling.
        </p>
      </Sec>
      <Sec title="Onde tudo isso virou">
        <Ul>
          <li><b>Auto-match</b> → <strong className="text-fg">Score Engine</strong> em /admin/params (flag <code>use_algo_tick</code>). Tutorial: <strong className="text-fg">Algoritmo de Scoring</strong>.</li>
          <li><b>Threshold global</b> → <code>quality_threshold</code> (default 0.40) em /admin/params.</li>
          <li><b>Threshold por canal</b> → <code>quality_threshold</code> próprio em <strong className="text-fg">/channels</strong> (cada canal pode sobrescrever).</li>
          <li><b>Rate limit</b> → <code>cap_max</code> (msgs/dia/grupo) + <code>cooldown_seconds</code> entre envios do mesmo modem.</li>
          <li><b>Pendente de aprovação</b> → não existe mais; o motor só envia o que passa pelos filtros.</li>
          <li><b>Jonfrey</b> → os 9 loops LLM, gerenciáveis em <strong className="text-fg">/settings/loops</strong>.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  canais: () => (
    <Shell>
      <Sec title="Canal lógico = grupo de grupos">
        <Ul>
          <li>Um <b>canal</b> agrupa N <b>grupos WA/TG</b> com configuração compartilhada: threshold de qualidade, daily cap e <b>sliders de categoria</b>.</li>
          <li>Tabela <code>channels_v2</code>. Migrou do "canal v1" antigo que tinha audiência fixa por categoria única.</li>
        </Ul>
      </Sec>
      <Sec title="Sliders de categoria (0–100%)">
        <Ul>
          <li>Cada canal declara, por categoria, um <b>peso 0–100</b>. Tabela <code>channel_category_weights</code>.</li>
          <li>Esse peso entra na fórmula composta como termo <code>w_w · channel_weight</code>. Sliders altos puxam mais produtos daquela categoria.</li>
          <li>Categoria sem slider = peso 0 = não aparece no canal. Use para excluir explicitamente.</li>
          <li>Os pesos NÃO precisam somar 100% — são relativos. Ex: gaming=80, casa=20 dá o mesmo ranking que gaming=4, casa=1.</li>
        </Ul>
      </Sec>
      <Sec title="Parâmetros por canal">
        <Ul>
          <li><code>quality_threshold</code> — produto precisa ter score &ge; esse valor para entrar no funil deste canal.</li>
          <li><code>daily_cap</code> — máximo de mensagens por dia somando todos os grupos do canal.</li>
          <li><code>active</code> — toggle on/off do canal sem precisar deletar.</li>
        </Ul>
      </Sec>
      <Sec title="Boas práticas">
        <Ul>
          <li>Canal sem grupos = canal sem destino = nada acontece. Sempre vincule pelo menos 1 grupo em <strong className="text-fg">/groups</strong>.</li>
          <li>Comece com 2–3 categorias com pesos parecidos; ajuste depois de 7d com base em <strong className="text-fg">/admin/metrics → Learned Weights</strong>.</li>
          <li>Threshold alto (0.6+) = só "ofertão"; baixo (0.3) = volume e ruído.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  jonfrey: () => (
    <Shell>
      <Sec title="Conceito antigo — virou Loops LLM">
        <p className="text-fg-2">
          "Jonfrey" era um assistente LLM monolítico que orquestrava sugestões. Foi <b>quebrado em 9 loops especializados</b>,
          cada um com escopo, frequência e gate próprios. Ver <strong className="text-fg">/settings/loops</strong> e o tutorial{' '}
          <strong className="text-fg">Loops LLM</strong>.
        </p>
      </Sec>
      <Sec title="Equivalências">
        <Ul>
          <li>"Jonfrey configurando crawlers" → loop <code>scraper_fix</code></li>
          <li>"Jonfrey ajustando threshold" → loop <code>auto_tuning</code></li>
          <li>"Jonfrey sugerindo categorias" → loop <code>taxonomy_grow</code></li>
          <li>"Jonfrey pausando grupos saturados" → loop <code>anomaly_pause</code></li>
          <li>"Histórico do Jonfrey" → <strong className="text-fg">/admin/audit</strong> filtrado por loop</li>
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
