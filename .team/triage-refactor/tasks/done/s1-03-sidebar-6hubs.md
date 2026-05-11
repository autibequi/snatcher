---
id: s1-03-sidebar-6hubs
sprint: 1
title: Sidebar redesign — 6 hubs
status: todo
owner: ""
model: sonnet
type: rewrite
created: 2026-05-11
---

# Subtask: Sidebar.tsx com 6 hubs

## Contexto
Sidebar atual em `frontend/src/shell/Sidebar.tsx` (155 LOC) tem 6 grupos + 19 itens nav — confuso. Redesign: 6 hubs claros do redesign v3.

## Estrutura alvo

```
OPERAÇÃO
├─ Dashboard          /
├─ Match              /match
├─ Compor disparo     /compose
└─ Activity           /activity

FONTES & PRODUTOS
├─ Crawlers           /crawlers
└─ Catálogo           /catalog

DESTINOS
├─ Canais             /channels
└─ Links públicos     /links

PROVEDORES
├─ Grupos             /groups
├─ Contas             /accounts
└─ Afiliados          /affiliates

ANÁLISE
├─ Analytics          /analytics
└─ Clusters           /clusters

SISTEMA
├─ Configurações      /settings
├─ Taxonomia          /taxonomy
└─ Manual             /manual
```

## O que fazer

Reescrever `frontend/src/shell/Sidebar.tsx`:

1. **Estrutura de dados** — array tipado:
```ts
type NavItem = { label: string; to: string; icon?: ReactNode }
type NavGroup = { label: string; items: NavItem[] }
const NAV: NavGroup[] = [
  { label: 'Operação', items: [...] },
  ...
]
```

2. **Render**:
   - `<aside>` com flex column
   - Cada grupo: header `text-[10px] uppercase tracking-wider text-fg-4 mt-4 mb-1.5 px-3`
   - Cada item: `<NavLink>` do react-router-dom com `className` que ativa `bg-surface-2 text-accent` quando ativo
   - Item: `flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-fg-2 hover:text-fg hover:bg-surface-2 transition-colors`

3. **Mobile**:
   - Aceitar prop `open: boolean` + `onClose: () => void`
   - Em `lg:` (>=1024px) fica sempre visível (translate-x-0)
   - Abaixo de lg: drawer com `translate-x-0` / `-translate-x-full` controlado pelo `open`
   - Backdrop clicável fecha drawer
   - Auto-fechar drawer ao clicar em NavLink (useLocation effect)

4. **Ícones**: usar emoji ou Heroicons se já houver no projeto. Se não, deixar text-only sem ícone (visual mínimo OK).

5. **Manter**:
   - Footer com versão/build se já tinha
   - Theme-aware (cores via tokens)

## Validação
```bash
cd /workspace/.cache/snatcher/frontend
npx tsc --noEmit 2>&1 | grep -i sidebar ; echo "exit=$?"   # esperado exit=1 / sem erros novos
npm run build 2>&1 | tail -10  # build deve passar
```

## DoD
- Sidebar com 6 grupos, 16 items navegáveis (lista acima)
- NavLink ativo realça com cor accent
- Mobile drawer com backdrop + auto-close ao navegar
- `lg:` sempre visível, mobile fecha
- `tsc --noEmit` passa
- Build passa
- Comentários mínimos (código fala sozinho)
