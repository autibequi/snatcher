---
id: s1-05-app-routes-redirects
sprint: 1
title: App.tsx — rotas novas + redirects das antigas
status: todo
owner: ""
model: sonnet
type: refactor
created: 2026-05-11
blocked_by: s1-03-sidebar-6hubs
---

# Subtask: App.tsx com rotas alvo + Navigate redirects

## Contexto
Estrutura de rotas atual em `frontend/src/App.tsx` (linhas 122-161) tem 29 rotas com naming inconsistente (`/automations/channels`, `/automations/pending` → redirect, `/auto-match` → redirect). Redesign reorganiza em 6 hubs.

## Estrutura alvo

```
/                           → Dashboard
/match                      → Match (já existe)
/compose                    → Composer
/activity                   → Activity (NOVA — substitui /logs e agregadores)

/crawlers                   → Crawlers (hub com tabs)
/crawlers/:id               → CrawlerDetail (mantém por agora; sprint 4 vira modal)
/catalog                    → Catalog
/curation                   → Curation

/channels                   → Channels (rename de AutomationsByChannel)
/channels/:id               → ChannelDetail
/links                      → PublicLinks

/groups                     → Groups
/groups/:id                 → GroupDetail
/accounts                   → Accounts
/affiliates                 → Affiliates

/analytics                  → Analytics
/clusters                   → Clusters

/settings/*                 → Settings
/taxonomy                   → Taxonomy
/manual                     → Manual
/manual/:slug               → ManualTutorialPage

/login                      → Login (público)
/setup                      → Setup
/_dev/atoms                 → DevAtoms (gate em import.meta.env.DEV)
```

## Redirects das URLs antigas

```tsx
<Route path="logs" element={<Navigate to="/activity" replace />} />
<Route path="auto-match" element={<Navigate to="/automations" replace />} />  // já existia, mantém apontando para /channels agora
<Route path="automations" element={<Navigate to="/channels" replace />} />
<Route path="automations/channels" element={<Navigate to="/channels" replace />} />
<Route path="automations/jonfrey" element={<Navigate to="/activity?tab=jonfrey" replace />} />
<Route path="automations/pending" element={<Navigate to="/activity?tab=pending" replace />} />
```

## O que fazer

1. Editar `frontend/src/App.tsx`:
   - Substituir bloco `<Routes>` por rotas-alvo acima
   - Importar as pages que ainda existem; NÃO importar pages novas que ainda não foram criadas (deixar TODO comentado quando aplicável)
   - Para `/activity` rota nova, criar página STUB temporária `src/pages/Activity.tsx` simples (apenas `<div>Activity (TBD)</div>`) — Sprint 2 implementa de verdade
   - Manter `<RequireAuth>` / `<Outlet>` / wrappers atuais
   - Para `/channels` rota raiz: pode apontar pra `AutomationsByChannel` por enquanto (rename é separado em Sprint 3)

2. Verificar imports:
   - Remover imports não usados (`Pending`, `Automations`, etc se forem apenas redirect-stubs)
   - Importar `Navigate` se ainda não importado

3. Stub Activity (criar arquivo novo):
```tsx
// src/pages/Activity.tsx
import PageHeader from '../components/ui/PageHeader'

export default function Activity() {
  return (
    <div className="p-4">
      <PageHeader title="Activity" subtitle="Logs unificados (em construção)" />
      <p className="text-sm text-fg-3 mt-4">
        Hub unificado de crawl logs, dispatches, jonfrey e LLM. Em implementação no Sprint 2.
      </p>
    </div>
  )
}
```

## Validação
```bash
cd /workspace/.cache/snatcher/frontend
npx tsc --noEmit 2>&1 | head -20
npm run build 2>&1 | tail -10

# Manual via npm run dev:
# - /logs → redireciona pra /activity ✓
# - /automations → redireciona pra /channels ✓
# - /activity carrega o stub ✓
```

## DoD
- App.tsx rotas-alvo aplicadas
- Redirects das URLs antigas funcionam
- Stub Activity.tsx criado
- Build passa
- `tsc --noEmit` sem erros novos
