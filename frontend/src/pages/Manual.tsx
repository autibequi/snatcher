import { OperationalManualContent, OPERATIONAL_MANUAL_META } from '../content/operationalManual'

export default function Manual() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <header className="mb-8">
        <h1 className="text-xl font-semibold text-fg">{OPERATIONAL_MANUAL_META.title}</h1>
        <p className="text-sm text-fg-3 mt-1">{OPERATIONAL_MANUAL_META.description}</p>
      </header>
      <OperationalManualContent />
    </div>
  )
}
