---
sprint: 1
title: Sprint 1 — Foundation (shell + nav + tokens + tutorial cleanup) — FECHADO
status: done
completed: 2026-05-11
duration_wall_clock: ~6 min (com paralelismo)
---

# Sprint 1 — Foundation ✅

## Subtasks executadas

| Card | Modelo | Wall-clock | Resultado |
|------|--------|-----------|-----------|
| s1-01 — Delete tutorial scaffolding | haiku | 99s | 3 arquivos deletados, 5 refs limpas |
| s1-02 — uiTokens.ts canonical | haiku | 41s | `src/lib/uiTokens.ts` (36 LOC) |
| s1-06 — Tokens gap analysis | haiku | 58s | Relatório no card (80+ classes utility no v3) |
| s1-07 — Codemod rounded-xl | haiku | 101s | 1 troca em Login.tsx (ui/ já estava OK) |
| s1-03 — Sidebar 6 hubs | sonnet | 99s | Sidebar reescrita (142 LOC), 6 grupos 16 itens |
| s1-04 — Topbar StatusPill | sonnet | 261s | Topbar consolidado, 1 chip status, panel preservado |
| s1-05 — App.tsx routes + redirects | sonnet (main) | inline | 24 rotas organizadas em 6 hubs + 7 redirects |

## Paralelização

- **Wave 1** (4 haikus em paralelo): s1-01, s1-02, s1-06, s1-07 — ~100s
- **Wave 2** (2 sonnets em paralelo): s1-03, s1-04 — ~260s
- **Wave 3** (main): s1-05 — inline
- **Total**: ~6 min vs ~25 min sequencial

## Validação

```bash
cd /workspace/.cache/snatcher/frontend
npx tsc --noEmit  # exit 0 ✅
npm run build     # ✓ built in 3.24s ✅
```

## Arquivos novos
- `frontend/src/lib/uiTokens.ts`
- `frontend/src/pages/Activity.tsx` (stub p/ Sprint 2)

## Arquivos modificados
- `frontend/src/App.tsx` — 24 rotas em 6 hubs + 7 redirects de URLs antigas
- `frontend/src/shell/Sidebar.tsx` — reescrito (142 LOC)
- `frontend/src/shell/Topbar.tsx` — StatusPill único
- `frontend/src/shell/AppShell.tsx` — limpo (TutorialModalProvider out)
- `frontend/src/components/ui/index.ts` — TutorialHelpButton out
- `frontend/src/pages/Manual.tsx` — TutorialHelpButton ref out
- `frontend/src/pages/ManualTutorialPage.tsx` — TutorialHelpButton ref out
- `frontend/src/pages/Login.tsx` — rounded-xl → rounded-md (button)

## Arquivos deletados
- `frontend/src/shell/HelpManualButton.tsx`
- `frontend/src/components/TutorialHelpButton.tsx`
- `frontend/src/contexts/TutorialModalContext.tsx`

## Aprendizados (vão pra retro/memória)

1. **Paralelização cross-engine funciona muito bem** quando subtasks são bem isoladas. 4 haikus + 2 sonnets em waves = 6× speedup.
2. **Cards detalhados pagam o investimento**. Os haikus executaram em 1-shot sem retry, sem ambiguidade.
3. **Atenção a conflitos cross-card**: s1-01 mexeu em Topbar antes de s1-04 tocar Topbar. O card de s1-04 foi explícito sobre o estado pós-s1-01. Sem isso, conflito de Edit.
4. **Activity.tsx import default vs named**: pequeno gotcha pegou no build — `PageHeader` é named export, não default. Resolvido rápido.

## Próximo

Sprint 2 — OPERAÇÃO: Dashboard, Match, Composer, Activity hub (split de Logs.tsx 1520 LOC).
