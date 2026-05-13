import { OPERATIONAL_MANUAL_META } from './operationalManual'

export interface ManualTutorialDef {
  slug: string
  title: string
  description: string
  icon: string
  /** Rota da app para o link "Ir para…" (omitido no manual operacional). */
  path?: string
}

/**
 * Lista única — índice em /manual e rotas /manual/:slug.
 * Ordem: quickstarter → operacional → operação → catálogo → scraping → distribuição → análise → sistema.
 */
export const MANUAL_TUTORIALS: ManualTutorialDef[] = [
  // ── Onboarding ──
  {
    slug: 'quickstarter',
    title: 'Quickstarter',
    description:
      'Começa aqui se nunca abriste o painel: login, modem, conta WA, canal, grupos, primeiro disparo.',
    icon: '🚀',
    path: '/',
  },
  {
    slug: 'operacional',
    title: OPERATIONAL_MANUAL_META.title,
    description: OPERATIONAL_MANUAL_META.description,
    icon: '📖',
  },

  // ── Operação ──
  {
    slug: 'dashboard',
    title: 'Dashboard',
    description: 'Resumo operacional, fila e sinais rápidos ao abrir o sistema.',
    icon: '🏠',
    path: '/',
  },
  {
    slug: 'compose',
    title: 'Compor disparo',
    description: 'Montar mensagem, escolher produtos e canais/grupos, enviar manualmente.',
    icon: '✍️',
    path: '/compose',
  },
  {
    slug: 'activity',
    title: 'Atividade',
    description: 'Histórico de disparos, status, erros e diagnóstico operacional.',
    icon: '📋',
    path: '/activity',
  },
  {
    slug: 'insights',
    title: 'Insights L4',
    description: 'Sugestões automáticas geradas pelos loops LLM — fila pra revisão.',
    icon: '💡',
    path: '/suggestions-l4',
  },

  // ── Catálogo ──
  {
    slug: 'catalog',
    title: 'Catálogo',
    description: 'Produtos canonicalizados, qualidade, send_ready, busca e auditoria.',
    icon: '📦',
    path: '/admin/catalog-canonical',
  },
  {
    slug: 'taxonomy',
    title: 'Taxonomia',
    description: 'Categorias e padrões que alimentam scoring, match e relatórios.',
    icon: '🏷️',
    path: '/taxonomy',
  },

  // ── Scraping ──
  {
    slug: 'crawlers',
    title: 'Crawlers',
    description: 'Workers que puxam ofertas dos marketplaces e espionam grupos.',
    icon: '🕷️',
    path: '/crawlers',
  },
  {
    slug: 'scrapers',
    title: 'Scrapers (extratores)',
    description: 'Configurações de extração por marketplace — seletores, shadow, promote.',
    icon: '🕸️',
    path: '/admin/scrapers',
  },

  // ── Distribuição ──
  {
    slug: 'canais',
    title: 'Canais',
    description: 'Canal lógico (grupo de grupos), sliders de categoria, threshold de qualidade.',
    icon: '📺',
    path: '/channels',
  },
  {
    slug: 'groups',
    title: 'Grupos',
    description: 'Grupos WA/TG físicos vinculados aos canais. Importar e organizar.',
    icon: '👥',
    path: '/groups',
  },
  {
    slug: 'templates',
    title: 'Templates',
    description: 'Mensagens parametrizadas com {variáveis} por categoria — usadas pelo dispatcher.',
    icon: '💬',
    path: '/admin/templates',
  },
  {
    slug: 'modems',
    title: 'Modems & Senders',
    description: 'Modems 4G, HOST modem, contas WA conectadas, QR e cotas de envio.',
    icon: '📡',
    path: '/admin/senders',
  },
  {
    slug: 'accounts',
    title: 'Contas conectadas (legado)',
    description: 'Convertido em "Modems & Senders" — vá direto pra esse tutorial.',
    icon: '📱',
    path: '/admin/senders',
  },
  {
    slug: 'domains',
    title: 'Domínios de redirect',
    description: 'Rotação de domínios afiliados — anti-ban e tracking de cliques.',
    icon: '🌐',
    path: '/admin/domains',
  },
  {
    slug: 'affiliates',
    title: 'Afiliados',
    description: 'Programas e IDs por marketplace para links comissionados.',
    icon: '💰',
    path: '/affiliates',
  },
  {
    slug: 'links',
    title: 'Links públicos',
    description: 'Páginas e redirecionamentos para divulgar entrada em grupos.',
    icon: '🔗',
    path: '/links',
  },

  // ── Análise ──
  {
    slug: 'conversoes',
    title: 'Conversões',
    description: 'Vendas atribuídas, postbacks de afiliados, receita por grupo/produto.',
    icon: '💵',
    path: '/admin/conversions',
  },
  {
    slug: 'analytics',
    title: 'Métricas & Insights',
    description: 'Learned weights, daily metrics, A/B tests e ratio de viralização por grupo.',
    icon: '📈',
    path: '/admin/metrics',
  },
  {
    slug: 'clusters',
    title: 'Clusters',
    description: 'Agrupar canais por comportamento de audiência.',
    icon: '🧩',
    path: '/clusters',
  },

  // ── Algoritmo ──
  {
    slug: 'scoring',
    title: 'Algoritmo de Scoring',
    description:
      'Como o Score Engine decide qual produto vai para qual grupo — fórmula, exploração, defesas, tunables.',
    icon: '🧮',
  },
  {
    slug: 'loops',
    title: 'Loops LLM',
    description: 'Os 9 loops que tunam o sistema com IA — affinity, cooldown, A/B, anti-saturação, etc.',
    icon: '🔁',
    path: '/settings/loops',
  },
  {
    slug: 'params',
    title: 'Parâmetros tunáveis',
    description: 'Todos os ~25 tunables do scoring + flags strangler em um só lugar.',
    icon: '🎛️',
    path: '/admin/params',
  },

  // ── Sistema ──
  {
    slug: 'settings',
    title: 'Configurações',
    description: 'Senders, Loops, Alertas, Parâmetros, Audit — tabs do menu Sistema.',
    icon: '⚙️',
    path: '/settings',
  },

  // ── Legados (redirecionam ou apontam para conteúdo atual) ──
  {
    slug: 'automations',
    title: 'Auto-disparos (legado)',
    description: 'Conceito antigo — hoje virou Score Engine + Loops LLM. Veja Scoring e Loops.',
    icon: '⚡',
    path: '/settings/loops',
  },
  {
    slug: 'jonfrey',
    title: 'Jonfrey (legado)',
    description: 'Assistente LLM antigo — substituído pelos 9 loops em Loops LLM.',
    icon: '🤵',
    path: '/settings/loops',
  },
  {
    slug: 'match',
    title: 'Match (legado)',
    description: 'Conceito antigo de scoring produto↔canal — hoje em Algoritmo de Scoring.',
    icon: '🎯',
  },
  {
    slug: 'logs',
    title: 'Logs (legado)',
    description: 'Renomeado para Atividade — vá direto para esse tutorial.',
    icon: '📋',
    path: '/activity',
  },
]

export function manualTutorialTitle(slug: string): string | undefined {
  return MANUAL_TUTORIALS.find(t => t.slug === slug)?.title
}

/**
 * Tutorial mais específico para a rota atual — usado pelo ❓ na top bar e pelo ManualModal.
 * Prefixos mais longos primeiro (ex.: /admin/catalog-canonical antes de /admin).
 */
export function resolveTutorialSlugFromPath(pathname: string): string {
  const p = pathname.replace(/\/+$/, '') || '/'

  if (p === '/manual') return 'quickstarter'

  const manualMatch = /^\/manual\/([^/]+)/.exec(p)
  if (manualMatch?.[1] && MANUAL_TUTORIALS.some(t => t.slug === manualMatch[1])) {
    return manualMatch[1]
  }

  const prefixes: [string, string][] = [
    ['/admin/catalog-canonical', 'catalog'],
    ['/admin/conversions',       'conversoes'],
    ['/admin/metrics',           'analytics'],
    ['/admin/scrapers',          'scrapers'],
    ['/admin/templates',         'templates'],
    ['/admin/senders',           'modems'],
    ['/admin/domains',           'domains'],
    ['/admin/params',            'params'],
    ['/admin/loops',             'loops'],
    ['/admin/audit',             'settings'],
    ['/admin/alerts',            'settings'],
    ['/settings/loops',          'loops'],
    ['/settings/params',         'params'],
    ['/settings',                'settings'],
    ['/crawlers',                'crawlers'],
    ['/channels',                'canais'],
    ['/groups',                  'groups'],
    ['/affiliates',              'affiliates'],
    ['/links',                   'links'],
    ['/clusters',                'clusters'],
    ['/taxonomy',                'taxonomy'],
    ['/compose',                 'compose'],
    ['/activity',                'activity'],
    ['/suggestions-l4',          'insights'],
    ['/scoring',                 'scoring'],
    // Legados redirecionados
    ['/ads',                     'activity'],
    ['/logs',                    'activity'],
    ['/automations',             'loops'],
    ['/match',                   'scoring'],
  ]

  for (const [prefix, slug] of prefixes) {
    if (p === prefix || p.startsWith(`${prefix}/`)) return slug
  }

  if (p === '/') return 'dashboard'

  return 'operacional'
}
