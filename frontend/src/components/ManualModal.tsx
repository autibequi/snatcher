import { Modal } from './ui'
import { OperationalManualContent, OPERATIONAL_MANUAL_META } from '../content/operationalManual'

export function ManualModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={OPERATIONAL_MANUAL_META.title} panelClassName="max-w-3xl">
      <p className="text-sm text-fg-3 -mt-1 mb-6">{OPERATIONAL_MANUAL_META.description}</p>
      <OperationalManualContent />
    </Modal>
  )
}
