import { Link } from 'react-router-dom'
import { Modal } from './ui'
import { OperationalManualContent, OPERATIONAL_MANUAL_META } from '../content/operationalManual'

export function ManualModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={OPERATIONAL_MANUAL_META.title} panelClassName="max-w-3xl">
      <p className="text-sm text-fg-3 -mt-1 mb-6">{OPERATIONAL_MANUAL_META.description}</p>
      <OperationalManualContent />
      <p className="text-xs text-fg-3 mt-8 pt-4 border-t border-border">
        <Link to="/manual" onClick={onClose} className="text-accent hover:underline">
          Ver índice de tutoriais
        </Link>
      </p>
    </Modal>
  )
}
