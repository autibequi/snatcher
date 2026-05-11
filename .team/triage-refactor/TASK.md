# Triage Refactor — Snatcher Frontend Redesign v3

## Norte
`/workspace/obsidian/projects/snatcher/redesign-handoff/design_handoff_snatcher/` (README + 23 .jsx + screenshots) — inspiração, não literal.

Plano completo: `/home/bardiel/.claude/plans/pode-ver-o-cache-snatcher-streamed-crane.md`.

## Vocabulário (do handoff)
| Termo | O que é |
|---|---|
| **Canal** | Conceito lógico de público (perfil de audiência). |
| **Grupo** | Destino físico (WhatsApp/Telegram), vinculado a 1 canal. |
| **Conta** | Conta WA/TG conectada que envia mensagens. |
| **Link público** | URL estável com fallback chain de grupos. |
| **Crawler** | Job que descobre produtos (marketplace) ou espiona grupos. |
| **Match** | Roteamento produto → canal/grupo via score. |

## Estrutura alvo (6 hubs sidebar)
```
OPERAÇÃO  : Dashboard, Match, Composer, Activity (ex-Logs)
FONTES    : Crawlers, Catalog
DESTINOS  : Channels (+ detalhe com 4 tabs), Links públicos
PROVEDORES: Groups, Accounts, Afiliados
ANÁLISE   : Analytics, Clusters
SISTEMA   : Settings, Taxonomy, Manual
```

## Constraints
- Stack: React 18 + Vite + TS + Tailwind 3 + React Query + axios + react-router v6
- Design tokens OKLCH em `src/index.css` — preservar
- 20 UI components em `src/components/ui/` — preservar
- Sem libs novas (sem shadcn/Radix/Zustand)
- URLs podem mudar com `<Navigate>` redirects
- `.git` é stub vazio aqui — sem commits dessa árvore
- `-buildvcs=false` obrigatório p/ qualquer go cmd; `npm run typecheck` e `npm run build` em ./frontend

## Sprints
- **Sprint 1** — Foundation (shell + nav + tokens + tutorial cleanup) ← em curso
- **Sprint 2** — OPERAÇÃO (Dashboard, Match, Composer, Activity)
- **Sprint 3** — DESTINOS (Channels, Groups, Links)
- **Sprint 4** — FONTES (Crawlers, Catalog, Curation)
- **Sprint 5** — ANÁLISE/PROVEDORES (Clusters, Affiliates, Accounts, Analytics)
- **Sprint 6** — SISTEMA (Settings) + finalização cross-cutting

## Execução
Manager loop = main session (Pedro). Workers = `team-coder` (haiku). Subtasks atômicas em `tasks/todo/` com formato `sN-NN-slug.md`. Pequenas o suficiente p/ haiku terminar em 1 shot.

Mover cards manualmente: todo → doing → done.
