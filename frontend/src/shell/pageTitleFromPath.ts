import { manualTutorialTitle } from '../content/tutorials'

/**
 * Título curto para a Topbar a partir só da URL (antes do override da página).
 */
export function pageTitleFromPath(pathname: string): string {
  const p = pathname.replace(/\/+$/, '') || '/'

  if (p === '/manual') return 'Manual'

  const manualSub = /^\/manual\/([^/]+)$/.exec(p)
  if (manualSub?.[1]) {
    const t = manualTutorialTitle(manualSub[1])
    if (t) return t
  }

  const rules: [RegExp, string][] = [
    [/^\/automations$/, 'Auto disparos'],
    [/^\/automations\/channels(?:\/|$)/, 'Canais'],
    [/^\/automations\/jonfrey(?:\/|$)/, 'Jonfrey'],
    [/^\/automations\/pending(?:\/|$)/, 'Pendências'],
    [/^\/channels\/[^/]+/, 'Canal'],
    [/^\/crawlers\/[^/]+/, 'Crawler'],
    [/^\/groups\/[^/]+/, 'Grupo'],
    [/^\/settings(?:\/|$)/, 'Configurações'],
    [/^\/crawlers$/, 'Crawlers'],
    [/^\/channels$/, 'Canais'],
    [/^\/compose$/, 'Composer'],
    [/^\/match$/, 'Match'],
    [/^\/logs$/, 'Logs'],
    [/^\/catalog$/, 'Catálogo'],
    [/^\/links$/, 'Links públicos'],
    [/^\/ads$/, 'Anúncios pagos'],
    [/^\/groups$/, 'Grupos'],
    [/^\/accounts$/, 'Contas'],
    [/^\/affiliates$/, 'Afiliados'],
    [/^\/admin\/metrics$/, 'Métricas'],
    [/^\/clusters$/, 'Métricas'],
    [/^\/analytics$/, 'Analytics'],
    [/^\/intelligence$/, 'Motor de Seleção'],
    [/^\/taxonomy$/, 'Taxonomia'],
    [/^\/curation$/, 'Triagem'],
    [/^\/_dev\/atoms$/, 'Dev atoms'],
    [/^\/$/, 'Dashboard'],
  ]

  for (const [re, title] of rules) {
    if (re.test(p)) return title
  }

  return ''
}
