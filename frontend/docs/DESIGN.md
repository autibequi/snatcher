# Snatcher Frontend — Design System

## Visão geral

O design system usa **OKLCH** para todos os tokens de cor, com dois temas: `light` (neutro frio) e `dark` (inspirado Dracula/Tokyo Night). Troca via atributo `data-theme` na raiz do documento. O controle de tema está em `src/lib/theme.ts` e o botão em `src/components/ui/ThemeToggle.tsx`.

Accent color (purple por padrão) também é trocável via `data-accent` (`green` / `orange` / `pink`).

---

## Tokens de cor (OKLCH)

Todos os tokens são custom properties CSS no formato `oklch(L C H)`.

### Superfícies

| Token CSS | Uso |
|---|---|
| `--bg` | Background raiz da página |
| `--surface` | Cards, painéis de primeiro nível |
| `--surface-2` | Sidebar, topbar, hover states, cards aninhados |
| `--surface-3` | Hover profundo, seleção ativa em menus |

### Bordas

| Token CSS | Uso |
|---|---|
| `--border` | Bordas padrão, separadores |
| `--border-strong` | Bordas com mais contraste (inputs disabled, outline buttons) |

### Texto

| Token CSS | Uso |
|---|---|
| `--fg` | Texto principal |
| `--fg-2` | Texto secundário, ícones ativos |
| `--fg-3` | Placeholder, texto desabilitado, labels de grupo |
| `--fg-4` | Texto muito suave (timestamps, metadados) |

### Semânticos

| Token CSS | Variante soft | Uso |
|---|---|---|
| `--accent` | `--accent-soft` | Cor primária (purple default) — botões, links, foco |
| `--success` | `--success-soft` | Verde — status OK, badge sucesso |
| `--warning` | `--warning-soft` | Âmbar — alertas, badges warn |
| `--danger` | `--danger-soft` | Vermelho — erros, badges danger, botão danger |

### Tailwind aliases

Os tokens são mapeados para classes Tailwind via `tailwind.config.js`. Exemplo:
- `bg-surface` → `background-color: oklch(var(--surface))`
- `text-fg-2` → `color: oklch(var(--fg-2))`
- `border-border` → `border-color: oklch(var(--border))`
- `text-accent` → `color: oklch(var(--accent))`

---

## Radius e espaçamento

| Token | Valor | Uso |
|---|---|---|
| `--r-xs` | 4px | Badges, chips pequenos |
| `--r-sm` | 6px | Inputs, selects |
| `--r` | 8px | Botões, cards internos |
| `--r-md` | 10px | Cards de destaque |
| `--r-lg` | 14px | Modais, panels flutuantes |
| `--r-xl` | 20px | Componentes pill |

Gaps e padding padronizados: `--gap-1` (4px) a `--gap-8` (32px). Densidade reduzida com `data-density="compact"`.

---

## Componentes Base

Localizados em `src/components/ui/`. Exportados via `src/components/ui/index.ts`.

### Button

```tsx
<Button
  variant="primary | secondary | ghost | danger"
  size="sm | md | lg"
  loading={bool}
  leftIcon={<Icon />}
  rightIcon={<Icon />}
  disabled={bool}
>
  Texto
</Button>
```

- `focus-visible:ring-2 focus-visible:ring-accent` aplicado em todos os variants
- Loading substitui `leftIcon` por Spinner interno e bloqueia cliques
- `forwardRef` para integração com libs como Radix

### Input

```tsx
<Input
  label="Label visível"
  error="Mensagem de erro" // ou error={true} apenas para estilo
  hint="Texto auxiliar neutro"
  leftAddon={<Icon />}
  // ...demais props nativas de <input>
/>
```

- `label` associado ao input via layout flex (sem `htmlFor` — o `<label>` envolve o input implicitamente via estrutura DOM)
- `error` como string mostra mensagem; como `boolean` aplica só estilo vermelho
- `hint` só aparece quando não há erro

### Badge

```tsx
<Badge variant="success | warning | danger | accent | default | outline | ok | warn | error | info" size="sm | md">
  Conteúdo
</Badge>
```

Variants `ok/warn/error/info` são aliases dos semânticos para retrocompatibilidade.

### Skeleton

```tsx
<Skeleton variant="text | line | card | circle | table" rows={3} className="..." />
<SkeletonTable rows={5} />
```

- `variant="table"` renderiza N linhas de loading (4 colunas por linha)
- `rows` controla quantidade de linhas no variant `table`

### EmptyState

```tsx
<EmptyState
  title="Titulo obrigatório"
  description={mythosEmpty.catalog}  // opcional — voz mythos permitida aqui
  icon={<Package size={32} />}
  action={<Button variant="ghost" size="sm">Criar</Button>}
  // cta={{ label: 'Criar', onClick: fn }}  // retrocompatibilidade legado
/>
```

### Modal

```tsx
<Modal
  open={bool}
  onClose={fn}
  title="Título"
  footer={<Button onClick={onClose}>Fechar</Button>}
  panelClassName="max-w-2xl"
>
  {conteúdo}
</Modal>
```

Usa Radix UI Dialog internamente — role="dialog", aria-modal, focus trap e Esc para fechar gerenciados pelo Radix.

### Switch

```tsx
<Switch checked={bool} onChange={fn} label="Label opcional" disabled={bool} />
```

Usa Radix Switch — teclado e aria já incluídos.

### Tabs

```tsx
// Radix-based, ver src/components/ui/Tabs.tsx
```

### Toast

```tsx
// ver src/components/ui/Toast.tsx e src/contexts/ToastContext.tsx
```

---

## Shell

### Sidebar (`src/shell/Sidebar.tsx`)

Grupos de navegação colapsáveis (persistidos em `localStorage`). Itens definidos no array `NAV` com `{ id, label, items[] }`.

Para adicionar um grupo novo: inserir entrada no array `NAV` com `id` único e items com `{ to, label, Icon }`.

A11y: `aria-expanded` nos headers de grupo, `aria-current="page"` nos links ativos, `aria-label="Fechar menu"` no botão mobile, `aria-hidden` nos ícones decorativos.

### Topbar (`src/shell/Topbar.tsx`)

Componentes internos principais:
- `TopbarBreadcrumb` — label derivado de `pageTitleFromPath()`
- `StatusZone` — pills de estado da fila universal (failed / running / pending / ok)
- `NotificationsButton` — placeholder, zero backend
- `UserMenuButton` — exibe email do usuário autenticado
- `HelpManualButton` — abre `/manual/<slug>` baseado na rota atual
- `ThemeToggle` — cicla entre `system → light → dark`
- `SearchBar` — busca no catálogo com dropdown de resultados (⌘K)

---

## Política Mythos

Persona "mythos" tem **voz restrita** para criar coesão narrativa sem vazar para contextos de dados.

### Contextos PERMITIDOS

- `description` prop do componente `EmptyState`
- Toasts de erro (via `mythosError.*`)
- `title` attr de elementos (tooltips nativos)
- Componente `Tooltip` (via `mythosTooltip.*`)

### Contextos PROIBIDOS

- Títulos de página (`<h1>`, `<h2>`, `<h3>` e derivados)
- Labels de formulário (`label=` / `aria-label` em inputs)
- Placeholder de inputs (`placeholder=`)
- Headers de coluna em tabelas
- Breadcrumbs
- Métricas numéricas e KPIs
- Log structured / spans OTel / labels Prometheus

### Fonte canônica

`src/lib/copy/mythos.ts` — três objetos:
- `mythosEmpty` — empty states por recurso
- `mythosError` — erros por tipo
- `mythosTooltip` — tooltips explicativos

### Lint guard

```bash
npm run lint:mythos
```

Script em `scripts/lint-mythos.mjs`. Detecta via grep regexp qualquer dos 10 termos canônicos em contextos `<h1-h6>`, `label=` e `placeholder=`, excluindo o arquivo fonte e arquivos de teste.

---

## Como adicionar uma tela nova

1. Criar `src/pages/admin/MinhaTela.tsx`
2. Importar `Button`, `Skeleton`, `EmptyState` de `src/components/ui/`
3. Consumir API via `src/lib/api/<recurso>.ts` (criar se não houver) — wrapper sobre `apiClient`
4. Usar `useQuery` com chave consistente: `['recurso', filtros]`
5. Loading state: `<Skeleton variant="table" rows={8} />`
6. Empty state: `<EmptyState title="Sem dados" description={mythosEmpty.recurso} />`
7. Adicionar rota em `src/App.tsx` dentro do bloco de rotas protegidas
8. Adicionar entry em `src/shell/Sidebar.tsx` no grupo correto
9. Adicionar tradução em `src/shell/pageTitleFromPath.ts` para o breadcrumb
10. `npm run build && npm run lint && npm run lint:mythos` antes de PR

---

## Testes

Vitest **não está configurado** nesta versão. Testes unitários de componentes foram diferidos — instalar Vitest requer ajuste no `vite.config.ts` e setup de ambiente DOM (jsdom).

Para adicionar quando necessário:
```bash
npm install -D vitest @testing-library/react @testing-library/user-event jsdom
```
E criar `vitest.config.ts` com `environment: 'jsdom'`.

---

## Acessibilidade (a11y)

Padrões aplicados nos componentes base:

- Todos os botões interativos têm `focus-visible:ring-2 focus-visible:ring-accent` ou usam `uiFocusRing` de `tokens.ts`
- Ícones decorativos têm `aria-hidden`
- Botões com só ícone têm `aria-label` descritivo
- Inputs com `label` prop têm associação por DOM adjacência (label envolve o container)
- Inputs sem `label` visível devem receber `aria-label` via prop spread (`...props`)
- Modais usam Radix Dialog (role="dialog", aria-modal, focus trap, Esc)
- Sidebar: `aria-expanded`, `aria-current="page"`, `aria-label="Navegação principal"`
- Topbar: todos os botões de ação têm `aria-label`

---

## Variáveis de ambiente

| Variável | Uso |
|---|---|
| `VITE_API_BASE_URL` | URL base da API (padrão: vazio, usa proxy Vite em dev) |

Configurar em `.env.local` para desenvolvimento local.
