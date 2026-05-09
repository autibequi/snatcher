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
    [/^\/automations\/channels(?:\/|$)/, 'Canais'],
    [/^\/automations\/jonfrey(?:\/|$)/, 'Jonfrey'],
    [/^\/automations\/pending(?:\/|$)/, 'Pendências'],
    [/^\/automations$/, 'Automações'],
    [/^\/channels\/[^/]+/, 'Canal'],
    [/^\/crawlers\/[^/]+/, 'Crawler'],
    [/^\/groups\/[^/]+/, 'Grupo'],
    [/^\/settings(?:\/|$)/, 'Configurações'],
    [/^\/crawlers$/, 'Crawlers'],
    [/^\/channels$/, 'Canais'],
    [/^\/compose$/, 'Compor'],
    [/^\/match$/, 'Match'],
    [/^\/logs$/, 'Logs'],
    [/^\/catalog$/, 'Catálogo'],
    [/^\/links$/, 'Links públicos'],
    [/^\/ads$/, 'Anúncios pagos'],
    [/^\/groups$/, 'Grupos'],
    [/^\/accounts$/, 'Contas'],
    [/^\/affiliates$/, 'Afiliados'],
    [/^\/clusters$/, 'Clusters'],
    [/^\/analytics$/, 'Insights'],
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
