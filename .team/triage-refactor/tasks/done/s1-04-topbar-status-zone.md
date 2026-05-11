---
id: s1-04-topbar-status-zone
sprint: 1
title: Topbar com status zone consolidada
status: doing
owner: coder-s1-04
model: sonnet
type: refactor
created: 2026-05-11
heartbeat: 2026-05-11T00:00:00Z
started_at: 2026-05-11T00:00:00Z
result: success
blocked_by: ""
---

# Subtask: Topbar.tsx limpa

## Contexto
Topbar atual (252 LOC) tem múltiplos elementos persistentes competindo: `WorkQueueBadge`, `FullAutoStatusBanner`, `ApiErrorToast`. Pedro pediu "1 zona de status única" no Topbar.

## O que fazer

Editar `frontend/src/shell/Topbar.tsx`:

1. **Layout alvo**:
```
[☰ hambúrguer (lg:hidden)]  [Logo/título]   ........ [ status pill | account menu | theme toggle ]
```

2. **Status zone**:
   - Crie ou use 1 componente `StatusPill` que renderiza UM chip:
     - Se há erros críticos: ⚠ "N erros" (clica → `/activity?level=error`)
     - Senão se há work queue: ⏳ "N na fila" (clica → `/activity?status=pending`)
     - Senão se FullAutoMode ativo: 🤖 "Auto" (clica → `/automations/jonfrey` ou similar)
     - Senão: ✓ "OK" (estado neutro)
   - Reusar `statusChip*` do `src/lib/uiTokens.ts` (criado em s1-02)
   - Manter `WorkQueueBadge.tsx` se já encapsula query — só envolver em StatusPill

3. **Remover**:
   - Múltiplos badges/banners simultâneos
   - `FullAutoStatusBanner` enquanto banner separado (lógica vira parte do StatusPill)
   - Link `HelpManualButton` se ainda referenciado (foi deletado em s1-01; só garantir que `<HelpManualButton/>` não está mais aqui)

4. **Manter**:
   - Hambúrguer `lg:hidden` que toggles sidebar drawer
   - ThemeToggle (button right)
   - Search global se já existir
   - Account/profile menu se já existir
   - `ApiErrorToast` como toast efêmero (não persistente) — pode ficar fora do Topbar, montado globalmente

5. **Mobile**:
   - Topbar fica `sticky top-0 z-30 bg-bg/95 backdrop-blur border-b border-border`
   - Padding `px-3 sm:px-4`
   - Title truncate em mobile

## Validação
```bash
cd /workspace/.cache/snatcher/frontend
npx tsc --noEmit 2>&1 | grep -iE 'topbar|StatusPill' ; echo "exit=$?"
npm run build 2>&1 | tail -10
```

## DoD
- [x] Topbar tem só 1 chip de status (não múltiplos elementos competindo)
- [x] Hamburger funciona em mobile
- [x] ThemeToggle preservado (à direita)
- [x] Build passa (tsc exit=0, vite build 3.9s)
- [x] StatusPill clicável navega pra contexto certo (/activity com filtros)

## Notas
- StatusPill incorpora a lógica de workqueue, accounts stats e fullAutoMode em 1 chip.
- WorkQueueBadge.tsx mantido intacto (componente standalone preservado, não deletado).
- FullAutoStatusBanner.tsx mantido intacto (usado em páginas de automations - não é do escopo remover).
- AccountsBadge e PendingApprovalsBadge eram funções internas do Topbar - foram removidas e sua lógica absorvida pelo StatusPill.
- PendingApprovalsBadge foi descartada (contagem de dispatches pendentes não figura nos 4 estados pedidos pelo card).
- Topbar header recebeu `sticky top-0 z-30 bg-bg/95 backdrop-blur` conforme spec mobile do card.
- ThemeToggle importado de `components/ui/ThemeToggle` e posicionado à direita.
- useMutation importado erroneamente foi removido antes do commit.
