/**
 * Logs.tsx — deprecated.
 * Rota /logs redireciona para /activity via App.tsx.
 * Toda a lógica foi migrada para Activity.tsx + src/pages/activity/*.
 */
import { Navigate } from 'react-router-dom'

export const DISPATCH_STATUS_TOOLTIP: Record<string, string> = {}

export default function Logs() {
  return <Navigate to="/activity" replace />
}
