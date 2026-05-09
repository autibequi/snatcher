import { Link, Navigate, useParams } from 'react-router-dom'
import { OperationalManualContent } from '../content/operationalManual'
import { MANUAL_TUTORIALS } from '../content/tutorials'

export default function ManualTutorialPage() {
  const { slug } = useParams<{ slug: string }>()
  const def = slug ? MANUAL_TUTORIALS.find(t => t.slug === slug) : undefined
  if (!slug || !def) return <Navigate to="/manual" replace />

  let body: React.ReactNode = null
  if (slug === 'operacional') {
    body = <OperationalManualContent />
  }

  if (!body) return <Navigate to="/manual" replace />

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link to="/manual" className="text-sm text-accent hover:underline mb-6 inline-block">
        ← Tutoriais
      </Link>
      <header className="mb-8">
        <h1 className="text-xl font-semibold text-fg">{def.title}</h1>
        <p className="text-sm text-fg-3 mt-1">{def.description}</p>
      </header>
      {body}
    </div>
  )
}
