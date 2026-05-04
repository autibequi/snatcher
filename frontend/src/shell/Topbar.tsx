import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui'

interface TopbarProps {
  onMenuClick: () => void
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const navigate = useNavigate()

  return (
    <header className="flex items-center h-12 px-4 bg-surface border-b border-border flex-shrink-0 gap-3">
      {/* Hamburger mobile */}
      <button
        type="button"
        onClick={onMenuClick}
        className="lg:hidden text-fg-2 hover:text-fg p-1 rounded"
        aria-label="Abrir menu"
      >
        ☰
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Accounts health indicator */}
      <AccountsHealth />

      {/* CTA principal */}
      <Button
        variant="primary"
        size="sm"
        onClick={() => navigate('/compose')}
      >
        Disparar
      </Button>

      {/* User menu placeholder */}
      <button
        type="button"
        className="w-7 h-7 rounded-full bg-accent/20 text-accent text-xs font-semibold flex items-center justify-center hover:bg-accent/30"
        aria-label="Menu do usuário"
      >
        U
      </button>
    </header>
  )
}

function AccountsHealth() {
  // Placeholder — será conectado ao useQuery quando API estiver pronta
  // Por agora mostra indicador estático
  const status: 'ok' | 'partial' | 'none' = 'ok'
  const colors = {
    ok: 'bg-green-500',
    partial: 'bg-amber-500',
    none: 'bg-red-500',
  }
  return (
    <button
      type="button"
      className="flex items-center gap-1.5 text-xs text-fg-2 hover:text-fg px-2 py-1 rounded-md hover:bg-surface-2"
      title="Contas conectadas"
    >
      <span className={`w-2 h-2 rounded-full ${colors[status]}`} />
      <span>Contas</span>
    </button>
  )
}
