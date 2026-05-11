---
id: s1-02-uitokens-canonical
sprint: 1
title: Criar src/lib/uiTokens.ts com class strings canônicas
status: todo
owner: ""
model: haiku
type: new-file
created: 2026-05-11
---

# Subtask: uiTokens.ts (class strings reutilizáveis)

## Contexto
Sistema atual tem inconsistências: padding tabelas varia (px-4 py-2 vs py-2.5 vs py-3), border-radius mistura md/lg/xl, etc. Solução: centralizar em `src/lib/uiTokens.ts` que exporta strings de className canônicas pra reutilizar.

## O que fazer

Criar arquivo novo `frontend/src/lib/uiTokens.ts` com:

```ts
// Tabelas
export const tableContainer = 'overflow-x-auto rounded-lg border border-border bg-surface'
export const tableHeader = 'px-4 py-2 text-xs font-medium uppercase tracking-wide text-fg-3 bg-surface-2'
export const tableHeaderCell = 'px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-fg-3'
export const tableRow = 'border-b border-border last:border-0 hover:bg-surface-2 transition-colors'
export const tableCell = 'px-4 py-2.5 text-sm text-fg align-middle'
export const tableCellMuted = 'px-4 py-2.5 text-sm text-fg-3 align-middle'

// Forms
export const formGroup = 'space-y-1.5'
export const formLabel = 'text-sm font-medium text-fg'
export const formHint = 'text-xs text-fg-3'
export const formError = 'text-xs text-danger'
export const switchRow = 'flex items-center justify-between gap-3 py-2'

// Cards / sections
export const sectionCard = 'rounded-lg border border-border bg-surface p-4'
export const sectionCardMuted = 'rounded-lg border border-border bg-surface-2 p-4'
export const sectionHeader = 'flex items-center justify-between mb-3'
export const sectionTitle = 'text-sm font-semibold text-fg'
export const sectionSubtitle = 'text-xs text-fg-3'

// Filtros sticky (Activity hub, listings)
export const filterBar = 'sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-bg/95 backdrop-blur border-b border-border px-4 py-2.5'

// Status zone (chips)
export const statusChip = 'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium'
export const statusChipSuccess = `${statusChip} bg-success-soft text-success`
export const statusChipWarning = `${statusChip} bg-warning-soft text-warning`
export const statusChipDanger = `${statusChip} bg-danger-soft text-danger`
export const statusChipMuted = `${statusChip} bg-surface-2 text-fg-3`

// Layout helpers
export const pageContainer = 'mx-auto w-full max-w-7xl px-3 py-4 sm:px-4 sm:py-6'
export const responsiveGrid = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3'
export const responsiveKpiGrid = 'grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3'
```

Justifique cada token brevemente em comentário quando o nome não for óbvio.

## Validação
```bash
cd /workspace/.cache/snatcher/frontend
cat src/lib/uiTokens.ts | head -5  # confirma criação
npx tsc --noEmit 2>&1 | grep uiTokens ; echo "exit=$?"  # esperado: nada / exit=1
```

## DoD
- Arquivo `src/lib/uiTokens.ts` criado
- `tsc --noEmit` não acusa erro em uiTokens
- Tokens cobrem: tabela, form, card, filter bar, status, layout
- Convenção: nomes camelCase, organizar por categoria com comentário
