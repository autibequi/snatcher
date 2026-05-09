import { OPERATIONAL_MANUAL_META } from './operationalManual'

export interface ManualTutorialDef {
  slug: string
  title: string
  description: string
  icon: string
}

/** Lista única — índice em /manual e rotas /manual/:slug */
export const MANUAL_TUTORIALS: ManualTutorialDef[] = [
  {
    slug: 'operacional',
    title: OPERATIONAL_MANUAL_META.title,
    description: OPERATIONAL_MANUAL_META.description,
    icon: '📖',
  },
]

export function manualTutorialTitle(slug: string): string | undefined {
  return MANUAL_TUTORIALS.find(t => t.slug === slug)?.title
}
