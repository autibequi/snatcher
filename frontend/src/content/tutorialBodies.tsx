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
      <Sec title="O que é o Catálogo canônico">
        <Ul>
          <li>Fonte única de produtos para o Score Engine, Composer e métricas. Rota: <code>/admin/catalog-canonical</code>.</li>
          <li>Cada produto tem <code>dedup_key</code> único (source:id) — upsert idempotente: mesmo produto scrapado N vezes = 1 linha.</li>
          <li>Campos críticos pro scoring: <code>quality_score</code>, <code>send_ready</code>, <code>canonical_url_alive</code>, <code>last_price_drop_at</code>.</li>
        </Ul>
      </Sec>
      <Sec title="send_ready e quality_score">
        <Ul>
          <li><code>send_ready = true</code> + <code>canonical_url_alive = true</code> + <code>quality_score &ge; threshold</code> = produto elegível para envio.</li>
          <li>Quality score calculado automaticamente: imagem (+0.30), preço (+0.20), título (+0.10), desconto (até +0.40), boost 1.5× nas 24h pós queda de preço.</li>
          <li>Job <code>recompute_quality_scores</code> roda a cada hora cobrindo produtos atualizados recentemente.</li>
        </Ul>
      </Sec>
      <Sec title="Dicas">
        <Ul>
          <li>Produto sem imagem perde 0.30 de score — crawlers ruins que não capturam imagem reduzem volumetria de envio.</li>
          <li>URL morta (<code>canonical_url_alive = false</code>) bloqueia o produto mesmo com score alto — job de ping testa periodicamente.</li>
          <li>Forçar <code>send_ready</code> manualmente só em debug; crawl normal seta automaticamente.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  groups: () => (
    <Shell>
      <Sec title="Grupos WhatsApp / Telegram">
        <Ul>
          <li>Tabela <code>groups</code> — cada linha é um grupo físico WA/TG vinculado a um <b>canal lógico</b> em <code>channel_id</code>.</li>
          <li>Cada grupo tem seu próprio <code>daily_msg_cap</code>, <code>timezone</code>, <code>whatsapp_jid</code>.</li>
          <li>Importe da conta primary em <strong className="text-fg">/admin/senders</strong> após conectar WA.</li>
        </Ul>
      </Sec>
      <Sec title="Shortlinks por grupo">
        <Ul>
          <li>Desde a migração <code>group_shortlinks</code>, cada envio gera um <code>short_id</code> único por <code>(grupo, produto)</code>. Cliques são atribuídos deterministicamente ao grupo original — não ao "último que mandou".</li>
          <li>Isso torna CTR e virality ratio confiáveis em <strong className="text-fg">/admin/metrics</strong>.</li>
        </Ul>
      </Sec>
      <Sec title="Organização">
        <Ul>
          <li>Grupos sem <code>whatsapp_jid</code> não recebem disparos — importe via /admin/senders.</li>
          <li>Grupos banidos ou com status <code>banned</code> ficam fora do tick automaticamente.</li>
          <li>Virality ratio alto em <strong className="text-fg">Métricas → Virality</strong> = grupo cujo link viraliza fora; boa métrica de alcance, não de qualidade do grupo.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  accounts: () => (
    <Shell>
      <Sec title="Tutorial movido">
        <p className="text-fg-2">
          "Contas conectadas" é agora <strong className="text-fg">Modems &amp; Senders</strong> em <code>/admin/senders</code>.
          Veja o tutorial <strong className="text-fg">Modems &amp; Senders</strong> para o conteúdo atualizado.
        </p>
      </Sec>
    </Shell>
  ),

  analytics: () => (
    <Shell>
      <Sec title="Métricas & Insights — 4 abas">
        <p className="text-fg-2">Rota: <code>/admin/metrics</code>. Cada aba cobre uma dimensão diferente do sistema:</p>
        <Ul>
          <li><b>Learned Weights</b> — CTR 30d e EPC por (grupo, categoria, source). Filtro por <code>min_samples</code>. Use para entender o que o sistema aprendeu e por que escolhe certos produtos.</li>
          <li><b>Daily Metrics</b> — enviados, cliques e conversões por dia, com filtro de métrica e janela de tempo. Bom para tendências e sazonalidade.</li>
          <li><b>A/B Tests</b> — experimentos ativos em tunables: proposta vs atual, métrica objetivo, peso % de exposição e status (running / promoted / rolled_back).</li>
          <li><b>Virality</b> — por grupo: clicks totais, esperado por membros, excedente viral e ratio. <b>Observacional apenas</b> — cliques excedentes já são descartados do learning pelo cap <code>click_cap_per_member</code>.</li>
        </Ul>
      </Sec>
      <Sec title="Como usar">
        <Ul>
          <li><b>Confidence baixa</b> (&lt;0.25) em Learned Weights = grupo com poucos dados; o sistema usa o canal-mãe como fallback.</li>
          <li><b>EPC alto + samples baixo</b> = outlier — pode ser produto de nicho caro ou ruído.</li>
          <li><b>Virality ratio &gt; 50%</b> = mais da metade dos cliques vêm de fora. Positivo para awareness; neutro para o scoring.</li>
          <li>A/B Tests promovidos atualizam automaticamente o tunable em <code>tunable_parameters</code>.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  links: () => (
    <Shell>
      <Sec title="Links públicos">
        <Ul>
          <li>Páginas estáticas para divulgar entrada em grupos — URL fixa, independente do estado dos grupos.</li>
          <li>Cadeias de fallback: se o grupo alvo está cheio ou banido, redireciona para o próximo disponível.</li>
          <li>Útil para bio de Instagram, stories e campanhas externas que precisam de URL estável.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  clusters: () => (
    <Shell>
      <Sec title="Clusters de canais">
        <Ul>
          <li>Agrupa canais com comportamento de audiência similar — útil para comparar performance A/B entre segmentos.</li>
          <li>Algoritmo de clustering roda sobre métricas de CTR, EPC e categoria dos últimos 30d.</li>
          <li>Recompute após mudanças grandes de público (novos grupos, troca de categoria) para clusters não ficarem stale.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  logs: () => (
    <Shell>
      <Sec title="Página renomeada para Atividade">
        <p className="text-fg-2">
          <code>/logs</code> redireciona para <strong className="text-fg">/activity</strong>. Veja o tutorial <strong className="text-fg">Atividade</strong>.
        </p>
      </Sec>
    </Shell>
  ),

  affiliates: () => (
    <Shell>
      <Sec title="Programas de afiliados">
        <Ul>
          <li>Credenciais e IDs por marketplace (Amazon, Magalu, Shopee, etc). Sem configurar, o link sai "seco" — sem comissionamento.</li>
          <li>Cada programa tem <code>marketplace</code>, <code>credentials</code> (JSONB) e flag <code>active</code>.</li>
          <li>Sender resolve o link afiliado antes de montar a mensagem — usa domínio de redirect + shortlink por grupo.</li>
        </Ul>
      </Sec>
      <Sec title="Verificação">
        <Ul>
          <li>Clique no shortlink gerado manualmente e confira se a URL final contém seu tag afiliado.</li>
          <li>Conversões rastreadas aparecem em <strong className="text-fg">/admin/conversions</strong> após postback do marketplace.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  taxonomy: () => (
    <Shell>
      <Sec title="Taxonomia de categorias">
        <Ul>
          <li>Categorias (<code>categories</code>) alimentam: sliders do canal, affinity por grupo, A/B de template, CTR/EPC por categoria e Thompson Sampling.</li>
          <li>Seeds padrão: <code>eletronico</code>, <code>gaming</code>, <code>casa</code>, <code>moda</code>, <code>geral</code>. Adicione via interface.</li>
          <li>Marcas e padrões (keywords) usados pelos crawlers para detectar categoria do produto automaticamente.</li>
        </Ul>
      </Sec>
      <Sec title="Cuidados">
        <Ul>
          <li>Renomear categoria não migra <code>learned_weights</code> / <code>bandit_arms</code> — dados históricos ficam orphans. Prefira criar nova categoria e migrar gradualmente.</li>
          <li>Categoria com poucos produtos tende a ter bandit arm com baixa confidence — agrupa com categoria próxima ou usa <code>geral</code> como fallback.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  settings: () => (
    <Shell>
      <Sec title="Configurações — sub-rotas">
        <p className="text-fg-2">Cada aba de <code>/settings</code> tem escopo diferente:</p>
        <Ul>
          <li><b>/settings</b> (raiz) — configuração geral da conta, LLM e identidade de links públicos.</li>
          <li><b>/settings/loops</b> — os 9 loops LLM: toggle on/off, modo (suggesting/active), frequência. Ver tutorial <strong className="text-fg">Loops LLM</strong>.</li>
          <li><b>/settings/params</b> — alias de <code>/admin/params</code> — os ~25 tunables do sistema. Ver tutorial <strong className="text-fg">Parâmetros tunáveis</strong>.</li>
          <li><b>/admin/senders</b> — Modems &amp; contas WA. Ver tutorial <strong className="text-fg">Modems &amp; Senders</strong>.</li>
          <li><b>/admin/alerts</b> — regras de alerta (cota, ban, falha). Dispara notificação no dashboard.</li>
          <li><b>/admin/audit</b> — log de ações do sistema, chamadas LLM, erros de jobs.</li>
        </Ul>
      </Sec>
      <Sec title="Atenção">
        <Ul>
          <li>Alterações em LLM key afetam todos os 9 loops imediatamente.</li>
          <li>Desativar <code>use_algo_tick</code> em /settings/params para o Score Engine — use com cuidado em produção.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  match: () => (
    <Shell>
      <Sec title="Conceito incorporado ao Score Engine">
        <p className="text-fg-2">
          A página <code>/match</code> redireciona para <strong className="text-fg">/settings/params</strong>.
          O conceito de "match produto↔canal" foi incorporado à fórmula composta do Score Engine — não existe mais como tela separada.
        </p>
        <p className="text-fg-2 mt-3">Para entender por que um produto foi escolhido para um grupo:</p>
        <Ul>
          <li><strong className="text-fg">/manual/scoring</strong> — explicação completa da fórmula e dos 7 sinais.</li>
          <li><strong className="text-fg">/admin/metrics → Learned Weights</strong> — CTR/EPC reais por (grupo, categoria).</li>
          <li><strong className="text-fg">/channels</strong> — sliders de categoria do canal.</li>
          <li><strong className="text-fg">/admin/params</strong> — pesos dos 7 termos (<code>score_weight_*</code>).</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  // ── Tutoriais novos ────────────────────────────────────────────────────────

  activity: () => (
    <Shell>
      <Sec title="Atividade — histórico de disparos">
        <Ul>
          <li>Substituiu a página <code>/logs</code>. Mostra todos os envios: status, grupo, produto, modem, horário.</li>
          <li>Filtre por <b>status</b> (sent, failed, pending), <b>grupo</b>, <b>conta WA</b> ou <b>intervalo de datas</b>.</li>
          <li>Clique em uma linha para ver detalhe: template usado, shortlink, imagem, erro se houver.</li>
        </Ul>
      </Sec>
      <Sec title="Status mais comuns">
        <Ul>
          <li><code>sent</code> — Evolution API confirmou envio com sucesso.</li>
          <li><code>failed</code> — erro ao enviar (conta desconectada, grupo banido, timeout Evolution).</li>
          <li><code>pending</code> — na <code>send_queue</code>, aguardando worker.</li>
          <li><code>sending</code> — worker pegou, enviando agora.</li>
        </Ul>
      </Sec>
      <Sec title="Diagnóstico de falhas">
        <Ul>
          <li>Muitos <code>failed</code> da mesma conta → sessão WA caiu; reconecte em <strong className="text-fg">/admin/senders</strong>.</li>
          <li>Muitos <code>pending</code> acumulando → worker não está rodando ou modem travado.</li>
          <li>Falhas intermitentes → olhe o error_code na linha; <code>ECONNREFUSED</code> = Evolution API offline.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  insights: () => (
    <Shell>
      <Sec title="Insights L4 — sugestões dos loops LLM">
        <Ul>
          <li>Fila de sugestões geradas pelos loops LLM (principalmente <code>affinity_adjust</code>, <code>cooldown_suggest</code>, <code>cap_suggest</code>).</li>
          <li>Cada sugestão tem: tipo, argumento, raciocínio do modelo, status (<code>pending / accepted / rejected</code>).</li>
          <li>Em modo <b>suggesting</b> (default), loops produzem sugestões aqui mas não agem. Em modo <b>active</b>, agem automaticamente.</li>
        </Ul>
      </Sec>
      <Sec title="Uso">
        <Ul>
          <li>Revise semanalmente; sugestões antigas rejeitadas se tornam stale (sistema pode parar de gerar se a fila encher).</li>
          <li>Aceitar uma sugestão de tunable a aplica diretamente em <code>tunable_parameters</code>.</li>
          <li>Logs de raciocínio ficam em <strong className="text-fg">/admin/audit</strong> — útil para entender por que o loop sugeriu algo.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  scrapers: () => (
    <Shell>
      <Sec title="Extratores por marketplace">
        <Ul>
          <li>Configuração de como cada marketplace é raspado: seletores CSS, headers, rate limit, modo (shadow / produção).</li>
          <li><b>Shadow mode</b>: extrator roda mas produtos vão para fila de revisão, não direto ao catálogo. Bom pra validar extrator novo sem poluir produção.</li>
          <li><b>Promote</b>: converte shadow → produção quando validado.</li>
        </Ul>
      </Sec>
      <Sec title="Diferença de Crawlers">
        <Ul>
          <li><strong className="text-fg">Crawlers</strong> (<code>/crawlers</code>) = workers agendados que <em>disparam</em> o scrape (quando, de onde, com qual conta).</li>
          <li><strong className="text-fg">Scrapers</strong> (<code>/admin/scrapers</code>) = <em>como</em> extrair de cada source — seletores e lógica de parsing.</li>
        </Ul>
      </Sec>
      <Sec title="Health">
        <Ul>
          <li>Coluna "Health" mostra % de produtos com imagem e categoria nas últimas 24h. Abaixo de 70% = scraper com problema.</li>
          <li>Logs de extração em <strong className="text-fg">/activity</strong> filtrado por tipo <code>scraper</code>.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  templates: () => (
    <Shell>
      <Sec title="Templates de mensagem">
        <Ul>
          <li>Cada template tem: <b>categoria</b>, <b>corpo</b> com variáveis, <b>peso</b> (chance de ser escolhido em A/B) e flag <code>enabled</code>.</li>
          <li>O dispatcher escolhe o template por categoria do produto — ou o mais genérico se não houver específico.</li>
        </Ul>
      </Sec>
      <Sec title="Variáveis disponíveis">
        <pre className="bg-surface-2 p-3 rounded text-xs leading-snug overflow-x-auto">
{`{titulo}    — título do produto (catalog.title)
{preco_de}  — preço original formatado (R$ 99,90)
{preco_por} — preço atual formatado
{desconto}  — % de desconto inteiro (ex: 30)
{link}      — shortlink afiliado por grupo
{emoji}     — emoji temático (resolvido pelo sistema)
`}
        </pre>
      </Sec>
      <Sec title="Boas práticas">
        <Ul>
          <li>Tenha pelo menos 1 template por categoria principal. Sem template da categoria = usa template de <code>geral</code> como fallback.</li>
          <li>Peso maior = aparece mais nas mensagens auto-geradas. Use pra A/B de copy sem mexer em código.</li>
          <li><code>optimal_hours</code> (array JSON) — horários em que esse template performou melhor. Alimentado pelo loop <code>template_ab</code>.</li>
          <li>Desativar (<code>enabled = false</code>) pausa sem deletar — mantém histórico de performance.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  modems: () => (
    <Shell>
      <Sec title="Modems & Senders">
        <Ul>
          <li><b>Modem</b> = slot de hardware (4G USB) ou <b>HOST modem</b> (o próprio servidor — sem hardware, usa Evolution API local).</li>
          <li>Cada modem pode ter N <b>contas WA</b> vinculadas, cada uma com status: <code>primary</code>, <code>backup</code>, <code>warming</code>, <code>banned</code>.</li>
          <li>O dispatcher usa contas <code>primary</code> primeiro; <code>backup</code> como fallback por <code>ga.priority</code>.</li>
        </Ul>
      </Sec>
      <Sec title="Conectar conta WhatsApp">
        <ol className="list-decimal pl-5 space-y-1">
          <li>Clique <b>Conectar conta WA</b> no card do modem.</li>
          <li>Evolution API cria instância e exibe QR code (retry automático em até 5 tentativas se QR demorar).</li>
          <li>Escaneie com o celular operacional.</li>
          <li>Modal pede: <b>telefone</b>, <b>nickname</b> e <b>cota diária</b>. Preencha e confirme.</li>
          <li>Conta aparece com status <code>primary</code> e pill verde <code>api_online</code> + <code>wa_status</code>.</li>
        </ol>
      </Sec>
      <Sec title="Status da conta">
        <Ul>
          <li><code>api_online</code> — Evolution API responde (processo rodando).</li>
          <li><code>wa_status</code> — sessão WA ativa (logado no WhatsApp).</li>
          <li>Ambos verdes = operacional. <code>api_online</code> vermelho = Evolution caiu; <code>wa_status</code> vermelho = sessão expirou, reconecte.</li>
          <li><code>consecutive_failures</code> — contador de falhas seguidas; alto = conta em risco de ban.</li>
          <li><code>sent_today</code> — envios do dia. Ao atingir <code>daily_send_quota</code>, conta é pulada até meia-noite.</li>
        </Ul>
      </Sec>
      <Sec title="HOST modem">
        <Ul>
          <li>Criado automaticamente na migration. Não precisa hardware — a Evolution API roda no mesmo servidor.</li>
          <li>Ideal para SaaS / cloud sem hardware físico 4G.</li>
          <li>Funciona igual a modem 4G para o dispatcher — mesma lógica de prioridade e cota.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  domains: () => (
    <Shell>
      <Sec title="Rotação de domínios de redirect">
        <Ul>
          <li>Lista de domínios usados nos shortlinks. Cada envio usa o domínio ativo com menor taxa de ban.</li>
          <li>Por quê? WhatsApp bloqueia domínios que enviam links suspeitos em volume. Rotação distribui o risco.</li>
        </Ul>
      </Sec>
      <Sec title="Configuração">
        <Ul>
          <li>Adicione o domínio (ex: <code>go.promo.com.br</code>) — deve apontar DNS para o servidor de redirect.</li>
          <li>Marque como <code>active</code>. O sender escolhe automaticamente o domínio ativo ao gerar shortlink.</li>
          <li>Se um domínio começa a ter muitos clicks com <code>domain_host</code> correspondendo a redirects bloqueados, desative-o.</li>
        </Ul>
      </Sec>
      <Sec title="Como auditar">
        <Ul>
          <li>Tabela <code>clicks</code> tem <code>domain_host</code> — verifique em <strong className="text-fg">/admin/metrics → Daily</strong> se um domínio tem CTR muito menor que outros (pode estar bloqueado).</li>
          <li>Send log tem <code>domain_id</code> — permite rastrear qual domínio foi usado em cada envio.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  conversoes: () => (
    <Shell>
      <Sec title="Conversões rastreadas">
        <Ul>
          <li>Vendas atribuídas ao sistema via <b>postback de afiliado</b> (Amazon, Magalu, etc) ou importação manual.</li>
          <li>Cada conversão tem: <code>catalog_id</code>, <code>group_id</code>, <code>order_value</code>, <code>commission</code>, <code>status</code>, <code>occurred_at</code>.</li>
          <li>Atribuição: via <code>short_id</code> do shortlink — liga clique ao produto E ao grupo que enviou (determinístico desde <code>group_shortlinks</code>).</li>
        </Ul>
      </Sec>
      <Sec title="Impacto no scoring">
        <Ul>
          <li><code>epc_30d</code> em <code>learned_weights</code> = <code>SUM(commission) / COUNT(clicks)</code> por (grupo, categoria, source) — calculado horariamente.</li>
          <li>Thompson Sampling: cada conversão incrementa <code>alpha</code> do arm (grupo, categoria) — aprendizado direto de receita.</li>
          <li>Alta <code>commission</code> → EPC alto → produto ganha <code>w_e · epc_blended</code> extra na fórmula.</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  loops: () => (
    <Shell>
      <Sec title="Os 9 Loops LLM">
        <p className="text-fg-2">
          Cada loop é um agente especializado com LLM rodando em cron. Gerenciados em <code>/settings/loops</code>.
          Dois modos: <b>suggesting</b> (gera sugestões em /suggestions-l4) e <b>active</b> (age diretamente).
        </p>
      </Sec>
      <Sec title="Loops de scoring e distribuição">
        <Ul>
          <li><b>affinity_adjust</b> — analisa CTR/EPC por (grupo, categoria), ajusta <code>group_category_affinity</code> em ±0.10/ciclo.</li>
          <li><b>cooldown_suggest</b> — detecta grupos saturados e sugere aumentar cooldown ou reduzir cap.</li>
          <li><b>cap_suggest</b> — analisa grupos com fila acumulada vs cap e sugere ajustes.</li>
          <li><b>anomaly_pause</b> — identifica grupos com padrão anômalo (queda brusca de CTR) e sugere pausa.</li>
          <li><b>auto_tuning</b> — ajusta tunables globais (quality_threshold, pesos) baseado em A/B tests em andamento.</li>
        </Ul>
      </Sec>
      <Sec title="Loops de catálogo e conteúdo">
        <Ul>
          <li><b>scraper_fix</b> — detecta scrapers com health baixo e sugere ajuste de seletores.</li>
          <li><b>taxonomy_grow</b> — sugere novas categorias baseado em produtos não-classificados.</li>
          <li><b>template_ab</b> — analisa CTR por template/hora e ajusta <code>optimal_hours</code> e pesos.</li>
          <li><b>content_optimize</b> — sugere variações de copy de templates com baixo CTR.</li>
        </Ul>
      </Sec>
      <Sec title="Configuração e segurança">
        <Ul>
          <li>Todos começam em modo <b>suggesting</b> — nada muda sem aprovação.</li>
          <li>Ativar modo <b>active</b> em produção só após validar as sugestões por pelo menos 2 semanas.</li>
          <li>Logs detalhados de cada execução em <strong className="text-fg">/admin/audit</strong>.</li>
          <li>Custo de tokens LLM: loops mais caros são <code>content_optimize</code> e <code>template_ab</code> (analisam corpus maior).</li>
        </Ul>
      </Sec>
    </Shell>
  ),

  params: () => (
    <Shell>
      <Sec title="Parâmetros tunáveis">
        <p className="text-fg-2">
          <code>/admin/params</code> (alias: <code>/settings/params</code>) — painel central de ~25 tunables do sistema.
          Alterações têm efeito imediato no próximo tick (5min).
        </p>
      </Sec>
      <Sec title="Estrutura">
        <Ul>
          <li><b>Flags strangler</b> (topo em destaque) — on/off com toggle: <code>use_algo_tick</code>, <code>use_epsilon_explore</code>, <code>use_thompson_sampling</code>.</li>
          <li><b>Parâmetros globais</b> — sliders e inputs numéricos com min/max. Cada um tem default + possibilidade de reset.</li>
          <li>Valor fora do range é rejeitado antes de salvar — não precisa validar manualmente.</li>
        </Ul>
      </Sec>
      <Sec title="Grupos de parâmetros">
        <Ul>
          <li><b>Qualidade e seleção</b>: <code>quality_threshold</code>, <code>cap_max</code>, <code>baseline_min</code>.</li>
          <li><b>Scoring v2</b>: os 7 <code>score_weight_*</code> da fórmula composta.</li>
          <li><b>Anti-repeat e bypass</b>: <code>antirepeat_window_days</code>, <code>repromo_drop_threshold</code>, <code>repromo_cooldown_hours</code>.</li>
          <li><b>Diversidade</b>: <code>diversity_bonus_weight</code>, <code>anti_saturation_decay</code>.</li>
          <li><b>Exploração</b>: <code>epsilon_base</code>, <code>epsilon_decay_rate</code>.</li>
          <li><b>Aprendizado</b>: <code>learned_half_life_days</code>, <code>click_reward_weight</code>, <code>click_cap_per_member</code>.</li>
        </Ul>
      </Sec>
      <Sec title="Dica">
        <p className="text-fg-2">
          Para entender o que cada param faz em profundidade, abra o tutorial{' '}
          <strong className="text-fg">Algoritmo de Scoring</strong> — tem a tabela completa com defaults e efeito.
        </p>
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
