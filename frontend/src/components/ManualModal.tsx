import { Link, useLocation } from 'react-router-dom'
import { Modal } from './ui'
import { OperationalManualContent, OPERATIONAL_MANUAL_META } from '../content/operationalManual'
import { MANUAL_TUTORIALS, resolveTutorialSlugFromPath } from '../content/tutorials'
import { renderTutorialBody } from '../content/tutorialBodies'

export function ManualModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pathname } = useLocation()
  const slug = resolveTutorialSlugFromPath(pathname)
  const meta = MANUAL_TUTORIALS.find(t => t.slug === slug)
  const title = meta?.title ?? OPERATIONAL_MANUAL_META.title
  const description = meta?.description ?? OPERATIONAL_MANUAL_META.description
  const body = renderTutorialBody(slug) ?? <OperationalManualContent />

  return (
    <Modal open={open} onClose={onClose} title={title} panelClassName="max-w-3xl">
      <p className="text-sm text-fg-3 -mt-1 mb-6">{description}</p>
      {body}
      <p className="text-xs text-fg-3 mt-8 pt-4 border-t border-border flex flex-wrap gap-x-4 gap-y-1">
        <Link to="/manual" onClick={onClose} className="text-accent hover:underline">
          Ver índice de tutoriais
        </Link>
        <Link to={`/manual/${slug}`} onClick={onClose} className="text-accent hover:underline">
          Abrir este tutorial em página cheia →
        </Link>
      </p>
    </Modal>
  )
}
