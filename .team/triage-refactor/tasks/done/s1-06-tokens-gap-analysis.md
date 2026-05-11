---
id: s1-06-tokens-gap-analysis
sprint: 1
title: Comparar styles.css redesign vs src/index.css — relatório de gap
status: todo
owner: ""
model: haiku
type: analysis
created: 2026-05-11
---

# Subtask: gap analysis tokens

## Contexto
Existe um `styles.css` (336 LOC) no handoff redesign em `/workspace/obsidian/projects/snatcher/redesign-handoff/design_handoff_snatcher/prototypes/design/styles.css`. O front atual tem tokens OKLCH em `src/index.css`. Queremos saber se falta algo no atual.

## O que fazer

1. Ler ambos:
   - `/workspace/obsidian/projects/snatcher/redesign-handoff/design_handoff_snatcher/prototypes/design/styles.css`
   - `/workspace/.cache/snatcher/frontend/src/index.css`

2. Comparar:
   - Variáveis CSS (`--foo`)
   - Classes utility customizadas (.foo)
   - Animations (@keyframes)

3. Produzir relatório em `/workspace/.cache/snatcher/.team/triage-refactor/tasks/doing/s1-06-tokens-gap-analysis.md` (vai mover este card pra doing):
```markdown
## Tokens presentes APENAS no redesign (candidatos a adicionar)
- `--foo` em redesign → valor: X | uso: Y telas
- ...

## Tokens presentes APENAS no atual
- `--bar`

## Animações/utilities únicos no redesign
- @keyframes bounce-in
- .skeleton-shimmer

## Recomendação
- ADICIONAR ao src/index.css: [lista curta]
- IGNORAR (não-vale): [lista curta com razão]
```

4. **NÃO modificar** src/index.css. Só análise.

## Validação
Relatório no card. Read-only — sem build.

## DoD
- Card preenchido com 3 seções: presentes só no v3, só no atual, recomendação
- Lista executável (não vaga) — token por token
- Citar exemplo de uso quando possível (linha do styles.css)

---

## ANÁLISE TOKENS GAP

### Resumo executivo
- **Redesign (styles.css)**: 336 LOC com tokens OKLCH + 80+ classes utilidade (layout, componentes, animações)
- **Atual (index.css)**: 148 LOC com tokens OKLCH básicos + Tailwind + temas light/dark/accents
- **Gaps críticos**: Faltam classes utilidade (shell, sidebar, cards, stats, buttons, tables) que o redesign usa extensivamente
- **Tokens CSS**: Praticamente alinhados — atual tem mais densidade/tema, redesign é minimalista

---

## Tokens presentes APENAS no redesign (candidatos a adicionar)

### Animações
- `@keyframes spin` (linha 332) — rotação contínua 360° em 0.8s | uso: spinners de loading
  - **Recomendação**: ADICIONAR — utilitário comum, não depende de Tailwind

### Classes utilidade NÃO presentes no atual (80+ gaps)

#### Layout Shell (linhas 61-108)
- `.shell` (flex 100vh) — container principal da UI
- `.sidebar` (width 240px, flex-direction column) — barra lateral
- `.sidebar-overlay` — overlay em mobile
- `.sidebar-brand`, `.sidebar-brand-mark`, `.sidebar-brand-name` — identidade visual
- `.sidebar-section`, `.sidebar-nav`, `.sidebar-link` (com :hover, .active, .sidebar-link-count)
- `.sidebar-footer` — rodapé da sidebar
- **Uso**: Layout principal de administração/dashboard
- **Status**: Crítico — estrutura base do protótipo

#### Topbar (linhas 110-148)
- `.content`, `.topbar` (height 56px, flex, padding 0 24px)
- `.topbar-menu`, `.topbar-title`, `.topbar-crumbs`, `.topbar-spacer`, `.topbar-search`
- `.content-body` (flex 1, overflow auto, padding específico)
- `.scrollarea` com scrollbar webkit customizado (linhas 146-148)
- **Uso**: Barra de topo, busca, navegação breadcrumb
- **Status**: Crítico — presente em toda tela

#### Page Layout (linhas 156-164)
- `.page-header` (flex, space-between, margin-bottom 22px)
- `.page-title` (font-size 22px, font-weight 700)
- `.page-subtitle` (13.5px, color fg-3)
- Responsivos para 640px
- **Uso**: Cabeçalho de páginas, títulos
- **Status**: Moderado — facilita tipografia consistent

#### Cards (linhas 167-175)
- `.card` (background surface, border, border-radius md)
- `.card-header` (padding gap-4/gap-5, flex space-between)
- `.card-title` (13px, 600, fg)
- `.card-body` (padding gap-4/gap-5, `.card-body.tight` sem padding)
- **Uso**: Container base para conteúdo
- **Status**: Crítico — elemento mais reutilizado

#### Stats Grid (linhas 178-195)
- `.stat-grid` (grid auto-fit minmax 190px, gap 12px)
- `.stat` (16px 18px padding, border, background surface)
- `.stat-label` (11.5px, 600, fg-3, uppercase)
- `.stat-value` (26px, 700, tabular-nums)
- `.stat-delta` (com .up cor success, .down cor danger)
- `.kpi-grid`, `.kpi-card`, `.kpi-label`, `.kpi-value` (alias equivalentes)
- **Uso**: Dashboard de KPIs, métricas
- **Status**: Crítico — designs de analytics

#### Buttons (linhas 198-206)
- `.btn` (inline-flex, 8px 14px padding, transition)
- `.btn.primary` (background accent, color white)
- `.btn.ghost` (transparent, hover surface-2)
- `.btn.sm` (5px 10px, 12.5px font)
- `.btn.danger` (color danger, hover danger-soft)
- **Uso**: Ações, formulários
- **Status**: Crítico — padrão de interação primário

#### Badges (linhas 209-214)
- `.badge` (inline-flex, 2px 8px padding, border-radius 999px)
- `.badge.success`, `.badge.warning`, `.badge.danger`, `.badge.accent`, `.badge.outline`
- **Uso**: Status, tags, labels
- **Status**: Moderado — complemento visual

#### Forms (linhas 217-223)
- `.input`, `.select`, `.textarea` (8px 12px padding, border focus com accent)
- `.label` (12px, 500, fg-2, margin-bottom 6px)
- **Uso**: Formulários
- **Status**: Moderado — Tailwind pode cobrir, mas sem padding customizado

#### Tables (linhas 226-238)
- `.tbl-wrap` (overflow-x auto)
- `.tbl` (border-collapse)
- `.tbl th` (10px 14px padding, uppercase, fg-3, surface-2 bg)
- `.tbl td` (pad-y 14px, vertical-align middle)
- `.tbl tr:hover td` (background surface-2)
- `.tbl tr.selected td` (background accent-soft)
- `.tbl .row-img` (36x36, contain, surface-3)
- Responsivo 700px (min-width 640px)
- **Uso**: Dados tabulares
- **Status**: Crítico — muito uso em admin

#### Layout Helpers (linhas 241-254)
- `.row` (flex, align-center, gap 8px)
- `.row-end` (flex, justify-end)
- `.col` (flex column, gap 8px)
- `.grid-2` (grid 1fr 1fr, gap 16px)
- `.grid-3` (grid repeat(3, 1fr), gap 16px)
- `.muted` (color fg-3)
- `.tabular` (font-variant-numeric: tabular-nums)
- `.truncate` (ellipsis)
- Responsivo 1100px (grid → 1fr)
- **Uso**: Composição, alinhamento
- **Status**: Moderado — layout utilitário

#### Tabs (linhas 252-254)
- `.tabs` (flex, gap 2px, border-bottom)
- `.tab` (padding 10px 14px, border-bottom 2px transparent, .active com accent)
- **Uso**: Abas de navegação
- **Status**: Moderado — complemento

#### Composer Specific (linhas 257-266)
- `.composer-grid` (grid 1fr 360px, gap 20px)
- `.composer-side` (position sticky top 0)
- `.wa-preview` (oklch 0.92 light, radial-gradient grid, min-height 500px)
- `.wa-bubble` (max-width 280px, white bg, shadow)
- `.wa-bubble img`, `.wa-bubble .text`, `.wa-bubble .meta`
- **Uso**: Editor de mensagens WhatsApp
- **Status**: Baixo → Específico do composer, pode ficar isolado

#### WhatsApp Status Pill (linhas 151-153)
- `.wa-status` (inline-flex, 5px 10px padding, border-radius 999px, surface-2, border)
- `.wa-status .dot` (8x8, rounded, whatsapp color + shadow)
- `.wa-status.offline .dot`
- **Uso**: Status de conexão
- **Status**: Moderado — UI de status

#### QR (linhas 269-270)
- `.qr-card` (surface bg, padding 24px, text-center)
- `.qr-img` (200x200, white bg, grid place-items center)
- **Uso**: QR code rendering
- **Status**: Baixo → Específico

#### Empty State (linhas 273-274)
- `.empty` (text-center, 56px padding, fg-3 color)
- `.empty-icon` (48x48, circular, surface-2 bg, grid center)
- **Uso**: Estados vazios
- **Status**: Moderado — UX padrão

#### Selection Bar (linhas 277-285)
- `.sel-bar` (position sticky bottom 0, fg bg, white color, radius md, shadow lg)
- `.sel-bar .btn` — override de botão
- `.sel-bar .btn.ghost:hover` (oklch 0.4)
- Responsivo 640px (padding, gap reduzido)
- **Uso**: Ações em batch/seleção
- **Status**: Moderado — admin common

#### Misc (linhas 288-336)
- `.ph-btn` — sparkline button
- `.channel-row`, `.channel-icon` — lista de canais
- `.spark` — sparkline inline (inline-flex, gap 2px, height 24px)
- `.switch` (36x20, border-radius 999px, transition, .switch.on states)
- `.chip-tag` (inline-flex, 4px 10px, rounded 999px, transitions)
- `.dual-thumb` — slider thumbs webkit/moz
- **Uso**: Componentes específicos
- **Status**: Moderado/Baixo — feature-specific

---

## Tokens presentes APENAS no atual (não no redesign)

### Tema/Variação
- `[data-theme="light"]` — explícito (redesign usa :root direto)
- `[data-accent="green"]`, `[data-accent="orange"]`, `[data-accent="pink"]` (linhas 77-93) — tema accent intercambiável
  - **Uso**: Múltiplos branding colors
  - **Recomendação**: Redesign não menciona; provavelmente escopo futuro

### Classes Tailwind
- Todas as diretivas Tailwind (base, components, utilities) — atual integrado com Tailwind, redesign não
- **Implicação**: Atual conta com Tailwind para grid, flexbox, margin, padding, etc.

### Body CSS melhorado
- `-moz-osx-font-smoothing: grayscale` (linha 121) — refinamento Firefox
- `color-scheme: light/dark` — hint ao navegador (linhas 8, 50)
- Atual é mais explícito em declarações

---

## Animações/utilities únicos no redesign

1. **@keyframes spin** (linha 332)
   - `to { transform: rotate(360deg); }`
   - Classe `.spinner` (animation spin 0.8s linear infinite)
   - **Uso**: Loading spinners
   - **Não presente em atual** — Tailwind tem animate-spin, mas CSS puro aqui seria útil

---

## Recomendação final

### ADICIONAR ao src/index.css (Prioridade ALTA)

**Layout/Estrutura (essencial para admin UI):**
```
1. .shell, .sidebar, .sidebar-* (nav, link, section)       [Crítico]
2. .content, .topbar, .topbar-*                              [Crítico]
3. .page-header, .page-title, .page-subtitle                [Crítico]
4. .card, .card-header, .card-body, .card-title             [Crítico]
5. .stat-grid, .stat, .stat-label, .stat-value, .stat-delta [Crítico]
6. .btn.*, .badge.* (sem os utilitários genéricos)          [Crítico]
7. .tbl-wrap, .tbl, .tbl th, .tbl td (+ responsivo)        [Crítico]
8. .row, .col, .grid-2, .grid-3 (+ responsivo)             [Crítico]
```

**UI Componentes (moderado):**
```
9. .tabs, .tab, .tab.active                                 [Moderado]
10. .wa-status, .wa-status .dot                             [Moderado]
11. .empty, .empty-icon                                     [Moderado]
12. .sel-bar e states (.sel-bar .btn)                       [Moderado]
13. .switch, .chip-tag, .channel-row                        [Baixo]
```

**Animações:**
```
14. @keyframes spin + .spinner                              [Moderado]
```

**Specifics (low priority / feature-bound):**
```
15. .composer-grid, .wa-preview, .wa-bubble (composer)    [Isolado]
16. .qr-card, .qr-img (QR module)                          [Isolado]
17. .ph-btn, .spark (charts)                               [Isolado]
18. .dual-thumb (range inputs)                             [Isolado]
```

### IGNORAR (razão)

- **Tailwind**: Atual já integrado; redesign duplicaria com classes hand-written
  - Solução: Usar Tailwind pra grid/flex/margin/padding, CSS puro só pra componentes sem equivalente
- **[data-accent=*]**: Nice-to-have no design, não roadmap imediato
- **Dark theme aprofundado**: Atual já tem; redesign não menciona
- **Scrollbar webkit**: Atual já cobre (linhas 125-142)

### Tokens CSS (--foo variables)

**Status**: Praticamente alinhados
- Redesign e atual usam OKLCH
- Atual tem separação light/dark mais explícita
- Atual tem accent palettes intercambiáveis (verde/laranja/rosa)
- **Action**: Nenhuma — tokens OK, problema é falta de classes

---

## Próximos passos

1. **Prioridade 1**: Copiar shell/sidebar/topbar/card/table classes (estrutura base)
2. **Prioridade 2**: Copiar buttons/badges/forms (componentes comuns)
3. **Prioridade 3**: Copiar layout helpers (grid-2, row, col)
4. **Prioridade 4**: Adicionar @keyframes spin
5. Revisar cada classe pra compatibilidade com Tailwind (evitar conflitos)
