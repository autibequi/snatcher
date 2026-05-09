import { Link } from 'react-router-dom'
import { TutorialHelpButton } from '../components/TutorialHelpButton'
import { MANUAL_TUTORIALS } from '../content/tutorials'

export default function Manual() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-2 justify-between gap-y-2">
          <h1 className="text-xl font-semibold text-fg">Manual</h1>
          <TutorialHelpButton />
        </div>
        <p className="text-sm text-fg-3 mt-1">Tutoriais e guias disponíveis.</p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2">
        {MANUAL_TUTORIALS.map(t => (
          <li key={t.slug}>
            <Link
              to={`/manual/${t.slug}`}
              className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 p-4 hover:border-accent/40 transition-colors h-full"
            >
              <span className="text-2xl leading-none flex-shrink-0">{t.icon}</span>
              <div className="min-w-0">
                <p className="font-medium text-fg">{t.title}</p>
                <p className="text-sm text-fg-3 mt-0.5">{t.description}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
