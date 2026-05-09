import { Link, Navigate, useParams } from 'react-router-dom'
import { TutorialHelpButton } from '../components/TutorialHelpButton'
import { renderTutorialBody } from '../content/tutorialBodies'
import { MANUAL_TUTORIALS } from '../content/tutorials'

export default function ManualTutorialPage() {
  const { slug } = useParams<{ slug: string }>()
  const def = slug ? MANUAL_TUTORIALS.find(t => t.slug === slug) : undefined
  const body = slug ? renderTutorialBody(slug) : null

  if (!slug || !def || !body) return <Navigate to="/manual" replace />

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link to="/manual" className="text-sm text-accent hover:underline mb-6 inline-block">
        ← Tutoriais
      </Link>
      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-2 justify-between gap-y-2">
          <h1 className="text-xl font-semibold text-fg">{def.title}</h1>
          <TutorialHelpButton />
        </div>
        <p className="text-sm text-fg-3 mt-1">{def.description}</p>
      </header>
      {body}
      {def.path ? (
        <p className="mt-10 pt-6 border-t border-border">
          <Link to={def.path} className="text-sm font-medium text-accent hover:underline">
            Ir para esta página no app →
          </Link>
        </p>
      ) : null}
    </div>
  )
}
