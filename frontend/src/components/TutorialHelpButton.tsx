import { useLocation, useNavigate } from 'react-router-dom'
import { useContext } from 'react'
import { TutorialModalContext } from '../contexts/TutorialModalContext'
import { resolveTutorialSlugFromPath } from '../content/tutorials'

type Props = {
  className?: string
}

/**
 * Abre o mesmo painel do ícone ❓ da barra — tutorial da rota atual (ManualModal).
 * Fora do provider (ex.: rotas sem shell), navega para `/manual/:slug`.
 */
export function TutorialHelpButton({ className = '' }: Props) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const slug = resolveTutorialSlugFromPath(pathname)
  const api = useContext(TutorialModalContext)

  const handleClick = () => {
    if (api?.openTutorial) {
      api.openTutorial()
      return
    }
    navigate(`/manual/${slug}`)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-fg-2 hover:text-accent hover:border-accent/40 transition-colors shrink-0 ${className}`.trim()}
      aria-label="Abrir tutorial desta página"
      title="Ajuda — tutorial desta página"
    >
      <span aria-hidden>📖</span>
      Ajuda
    </button>
  )
}
