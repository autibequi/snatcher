import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PublicApp } from './PublicApp'
import './index.css'

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <PublicApp />
    </StrictMode>,
  )
}
