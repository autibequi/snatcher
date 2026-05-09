import { Navigate } from 'react-router-dom'

/** Unificado em /automations (timeline). Mantém URL antiga como redirect. */
export default function Pending() {
  return <Navigate to="/automations" replace />
}
