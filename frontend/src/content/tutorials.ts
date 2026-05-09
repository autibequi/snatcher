import { OPERATIONAL_MANUAL_META } from './operationalManual'

export interface ManualTutorialDef {
  slug: string
  title: string
  description: string
  icon: string
  /** Rota da app para o link “Ir para…” (omitido no manual operacional). */
  path?: string
}

/**
 * Lista única — índice em /manual e rotas /manual/:slug.
 * Ordem: visão geral → fluxo do menu lateral (+ Match).
 */
export const MANUAL_TUTORIALS: ManualTutorialDef[] = [
  {
    slug: 'operacional',
    title: OPERATIONAL_MANUAL_META.title,
    description: OPERATIONAL_MANUAL_META.description,
    icon: '📖',
  },
  {
    slug: 'dashboard',
    title: 'Dashboard',
    description: 'Resumo operacional, filas e sinais rápidos ao abrir o sistema.',
    icon: '🏠',
    path: '/',
  },
  {
    slug: 'compose',
    title: 'Compor disparo',
    description: 'Montar mensagem, escolher produtos e canais, enviar ou agendar.',
    icon: '📤',
    path: '/compose',
  },
  {
    slug: 'ads',
    title: 'Anúncios pagos',
    description: 'Campanhas recorrentes com cron, URL rastreada e canais alvo.',
    icon: '💸',
    path: '/ads',
  },
  {
    slug: 'automations',
    title: 'Automações',
    description: 'Piloto, prévia do match, aprovações e linha do tempo de disparos.',
    icon: '⚡',
    path: '/automations',
  },
  {
    slug: 'canais',
    title: 'Canais',
    description: 'Por canal: audiência, grupos, threshold, cooldown e limites do auto-match.',
    icon: '📢',
    path: '/automations/channels',
  },
  {
    slug: 'jonfrey',
    title: 'Jonfrey',
    description: 'Fluxos assistidos por IA e políticas do assistente no workspace.',
    icon: '🤵',
    path: '/automations/jonfrey',
  },
  {
    slug: 'crawlers',
    title: 'Crawlers',
    description: 'Fontes de produto: marketplaces e grupos para espionagem de ofertas.',
    icon: '🔄',
    path: '/crawlers',
  },
  {
    slug: 'curation',
    title: 'Triagem',
    description: 'Aprovar ou corrigir itens antes de irem ao match e aos disparos.',
    icon: '✋',
    path: '/curation',
  },
  {
    slug: 'catalog',
    title: 'Catálogo',
    description: 'Produtos, busca e estado para composer e automações.',
    icon: '📦',
    path: '/catalog',
  },
  {
    slug: 'groups',
    title: 'Grupos',
    description: 'Importar e vincular grupos WA/TG às contas e aos canais.',
    icon: '👥',
    path: '/groups',
  },
  {
    slug: 'accounts',
    title: 'Contas conectadas',
    description: 'WhatsApp, Telegram e estado de sessão para envio.',
    icon: '📱',
    path: '/accounts',
  },
  {
    slug: 'analytics',
    title: 'Insights de cliques',
    description: 'Performance de links e comparativo entre canais/ofertas.',
    icon: '📊',
    path: '/analytics',
  },
  {
    slug: 'links',
    title: 'Links públicos',
    description: 'Páginas e redirecionamentos para divulgar entrada em grupos.',
    icon: '🔗',
    path: '/links',
  },
  {
    slug: 'clusters',
    title: 'Clusters',
    description: 'Agrupar canais por comportamento de audiência.',
    icon: '🧩',
    path: '/clusters',
  },
  {
    slug: 'logs',
    title: 'Logs',
    description: 'Filas, disparos, erros e jobs — diagnóstico operacional.',
    icon: '📋',
    path: '/logs',
  },
  {
    slug: 'affiliates',
    title: 'Afiliados',
    description: 'Programas e IDs por marketplace para links comissionados.',
    icon: '💰',
    path: '/affiliates',
  },
  {
    slug: 'taxonomy',
    title: 'Taxonomia',
    description: 'Categorias e padrões que alimentam match e relatórios.',
    icon: '🏷️',
    path: '/taxonomy',
  },
  {
    slug: 'settings',
    title: 'Configurações',
    description: 'Conta, LLM, limites e identidade — efeito global no app.',
    icon: '⚙️',
    path: '/settings',
  },
  {
    slug: 'match',
    title: 'Match',
    description: 'Entender scores produto↔canal e por que algo não disparou.',
    icon: '🎯',
    path: '/match',
  },
]

export function manualTutorialTitle(slug: string): string | undefined {
  return MANUAL_TUTORIALS.find(t => t.slug === slug)?.title
}
