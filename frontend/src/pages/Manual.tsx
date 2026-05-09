import { OperationalManualContent, OPERATIONAL_MANUAL_META } from '../content/operationalManual'

export default function Manual() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <header className="mb-8">
        <h1 className="text-xl font-semibold text-fg">{OPERATIONAL_MANUAL_META.title}</h1>
        <p className="text-sm text-fg-3 mt-1">{OPERATIONAL_MANUAL_META.description}</p>
        <p className="text-xs text-fg-3 mt-3 border border-border rounded-md px-3 py-2 bg-surface-2">
          O mesmo texto aparece ao clicar no <strong>❓</strong> na barra superior ou em <strong>Manual</strong> no menu — abre num
          painel sem sair da página. Esta URL serve para favoritos ou partilha.
        </p>
      </header>
      <OperationalManualContent />
    </div>
  )
}
