---
id: s1-01-delete-tutorial-scaffolding
sprint: 1
title: Remover tutorial scaffolding (HelpManualButton, TutorialHelpButton, TutorialModalContext)
status: todo
owner: ""
model: haiku
type: cleanup
created: 2026-05-11
---

# Subtask: deletar tutorial scaffolding flutuante

## Contexto
Pedro decidiu remover floating buttons de tutorial e contextos correspondentes. Manter apenas `Manual.tsx` e `ManualTutorialPage.tsx` como rotas consultáveis (`/manual`, `/manual/:slug`).

## O que fazer

1. **Deletar arquivos**:
   - `frontend/src/shell/HelpManualButton.tsx`
   - `frontend/src/components/TutorialHelpButton.tsx`
   - `frontend/src/contexts/TutorialModalContext.tsx` (verificar se há outros providers nesse arquivo antes de apagar — se tiver, só remover o TutorialModalContext específico)

2. **Caçar e remover referências**:
   ```bash
   cd /workspace/.cache/snatcher/frontend
   rg -l 'HelpManualButton|TutorialHelpButton|TutorialModalContext' src/
   ```
   Em cada arquivo encontrado:
   - Remover import
   - Remover JSX que usa o componente
   - Se for provider em `App.tsx`, remover wrapper e import

3. **Manter intactos**:
   - `frontend/src/pages/Manual.tsx`
   - `frontend/src/pages/ManualTutorialPage.tsx`
   - Rotas `/manual` e `/manual/:slug` em App.tsx

## Validação
```bash
cd /workspace/.cache/snatcher/frontend
rg 'HelpManualButton|TutorialHelpButton|TutorialModalContext' src/ ; echo "exit=$?"  # esperado exit=1 (nada)
npx tsc --noEmit 2>&1 | head -30   # zero erro novo
```

## DoD
- 3 arquivos deletados
- Zero references remanescentes
- `npx tsc --noEmit` passa (ou erros pré-existentes mantidos, sem novos)
- `Manual.tsx` e rotas preservadas
