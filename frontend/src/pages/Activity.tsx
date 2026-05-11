import { PageHeader } from '../components/ui/PageHeader'

export default function Activity() {
  return (
    <div className="p-3 sm:p-4">
      <PageHeader title="Activity" subtitle="Hub unificado de logs, dispatches e ações automatizadas" />
      <p className="text-sm text-fg-3 mt-6">
        Em construção no Sprint 2. Reunirá crawl logs, dispatches, ações Jonfrey, LLM logs e filtros globais (período, status, source, busca).
      </p>
    </div>
  )
}
