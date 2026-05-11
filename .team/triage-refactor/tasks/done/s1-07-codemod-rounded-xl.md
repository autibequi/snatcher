---
id: s1-07-codemod-rounded-xl
sprint: 1
title: Codemod rounded-xl → rounded-md em UI primitivos
status: done
owner: coder-claude-01
model: haiku
type: codemod
created: 2026-05-11
started_at: 2026-05-11T12:00:00Z
completed_at: 2026-05-11T12:15:00Z
heartbeat: 2026-05-11T12:15:00Z
result: success
duration: 900
---

# Subtask: padronizar border-radius nos UI primitivos

## Contexto
Inconsistência detectada: alguns componentes usam `rounded-xl` (16px), outros `rounded-lg` (12px) ou `rounded-md` (8px). Decisão: `rounded-md` pra UI core (inputs, botões, modals); `rounded-lg` pra cards/painéis; `rounded-xl` só em hero sections.

## O que fazer

Atuar em `frontend/src/components/ui/` APENAS:

```bash
cd /workspace/.cache/snatcher/frontend
rg -l 'rounded-xl' src/components/ui/
```

Para cada arquivo encontrado:
- Substituir `rounded-xl` → `rounded-md`
- EXCETO em componentes nomeados Hero* ou se houver comentário `// hero: keep xl`

Em seguida, scan rápido em `src/pages/` por `rounded-xl` que claramente é UI primitivo (button/input/modal) e não card/hero:

```bash
rg -n 'rounded-xl' src/pages/ | head -30
```

Não fazer codemod cego em pages. Apenas:
- Trocar onde está sendo usado em **button/input/select/modal** primitivos inline
- Manter em cards, panels, sections (que devem usar `rounded-lg`)

## Validação
```bash
cd /workspace/.cache/snatcher/frontend
rg -l 'rounded-xl' src/components/ui/ ; echo "exit=$?"  # esperado exit=1
npx tsc --noEmit 2>&1 | head -10
npm run build 2>&1 | tail -10  # visual smoke implícito via build
```

## DoD
- Zero `rounded-xl` em `src/components/ui/` ✓
- Mudanças em `src/pages/` documentadas (paths + razão) ✓
- Build passa ✓

## Notas de execução

**Fase 1: src/components/ui/**
- rg check: zero matches (exit=1 = sucesso)
- Conclusão: nenhuma mudança necessária; UI components já estão conformes

**Fase 2: src/pages/ scan**
- Encontrados: 18 matches de `rounded-xl` em pages
- Análise: 17 são containers/cards/panels (manter); 1 é UI primitivo
- Mudança única: src/pages/Login.tsx:70 (button) — rounded-xl → rounded-md

**Validação:**
- TypeScript: npx tsc --noEmit → sem erros
- Build: npm run build → ✓ built in 3.43s
