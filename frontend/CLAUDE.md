# Snatcher Frontend — CLAUDE.md

React + TypeScript + Vite. Tailwind CSS com design system próprio (surface, fg, accent, border).
API: axios via `apiClient` (src/lib/apiClient.ts) — inclui JWT automaticamente via interceptor.

## Estrutura

```
src/
  pages/           — Páginas roteadas (React Router v6)
  pages/activity/  — Sub-abas da página Activity
  pages/settings/  — Sub-abas da página Settings
  pages/crawlers/  — Sub-abas de Crawlers
  pages/public/    — Páginas públicas (sem auth)
  components/      — Componentes reutilizáveis
  components/ui/   — Design system (Button, Input, KpiCard, Switch, Tabs, etc.)
  components/dashboard/ — Cards do dashboard (OperationInbox, RecommendationCard, etc.)
  shell/           — Layout (Sidebar, Topbar, App shell)
  lib/             — Utilitários (apiClient, auth, uiTokens)
  content/         — Conteúdo estático (tutorials, manual)
  hooks/           — Custom hooks
  types/           — TypeScript types
```

## Páginas existentes

### Operação
| Rota | Página | Descrição |
|---|---|---|
| `/` | Dashboard.tsx | KPIs, inbox, score engine status, performance, disparos |
| `/compose` | Composer.tsx | Disparo manual com preview LLM |
| `/activity` | Activity.tsx | Feed: Fila de envio, Crawlers, Jonfrey, Loops, LLM, Auditoria |
| `/suggestions-l4` | SuggestionsL4.tsx | Aprovação de sugestões de loops |

### Catálogo e Scraping
| Rota | Página | Descrição |
|---|---|---|
| `/admin/catalog-canonical` | AdminCatalogCanonical.tsx | Catálogo com filtros e stats |
| `/taxonomy` | Taxonomy.tsx | Categorias/marcas + patterns de auto-match |
| `/crawlers` | Crawlers.tsx | Group spy crawlers list |
| `/crawlers/:id` | CrawlerDetail.tsx | Detalhe + mensagens capturadas |
| `/admin/scrapers` | AdminScrapers.tsx | Configs de extração + health + promote |

### Distribuição
| Rota | Página | Descrição |
|---|---|---|
| `/channels` | Channels.tsx | Canais lógicos + sliders de categoria + grupos |
| `/groups` | Groups.tsx | Grupos WA/TG — CRUD + importar + vincular |
| `/groups/:id` | GroupDetail.tsx | Detalhe: membros, admins, configuração |
| `/admin/templates` | AdminTemplates.tsx | Templates de mensagem CRUD + toggle |
| `/admin/senders` | AdminSenders.tsx | Modems + contas WA + QR + pause/resume |
| `/admin/domains` | RedirectDomains.tsx | Rotação de domínios de redirect |
| `/affiliates` | Affiliates.tsx | Programas de afiliados |
| `/links` | PublicLinks.tsx | Links públicos de grupos |

### Análise
| Rota | Página | Descrição |
|---|---|---|
| `/admin/conversions` | AdminConversions.tsx | Conversões por grupo/dia/source |
| `/admin/metrics` | AdminMetrics.tsx | Learned weights + daily + A/B + Virality |
| `/clusters` | Clusters.tsx | Clusters analíticos |
| `/analytics` | Analytics.tsx | Analytics de cliques (legacy/ativo) |

### Algoritmo
| Rota | Página | Descrição |
|---|---|---|
| `/admin/params` | AdminParams.tsx | ~25 tunables do Score Engine |
| `/settings/loops` ou `/admin/loops` | AdminLoops.tsx | 9 loops LLM (on/off, modo) |

### Sistema
| Rota | Página | Descrição |
|---|---|---|
| `/settings` | Settings.tsx | Router → sub-tabs |
| `/settings/system` | settings/SystemTab.tsx | Config global (send hours, interval) |
| `/settings/loops` | settings/LoopsTab.tsx | Loops LLM config |
| `/settings/jonfrey` | settings/JonfreyTab.tsx | Jonfrey config (actions, interval) |
| `/settings/llm` | settings/LLMTab.tsx | Provider LLM (OpenRouter, Ollama, vLLM) |
| `/settings/integrations` | settings/IntegrationsTab.tsx | Evolution, webhooks |
| `/settings/team` | settings/TeamTab.tsx | Invite/remove membros |
| `/settings/alerts` | settings/AlertsTab.tsx | Alert rules |
| `/settings/danger` | settings/DangerTab.tsx | Soft-wipe |
| `/admin/audit` | AdminAudit.tsx | Audit timeline |
| `/admin/alerts` | AdminAlerts.tsx | Alert rules dashboard |
| `/manual` | Manual.tsx | Índice de tutoriais |
| `/manual/:slug` | ManualTutorialPage.tsx | Tutorial individual |

### Redirects legados (existem no router — não criar novas páginas)
```
/logs          → /activity
/ads           → /activity
/automations   → /settings/loops
/auto-match    → /settings/loops
/match         → /settings/params
/admin/loops   → /settings/loops (alias)
/admin/params  → /settings/params (alias)
/settings/jonfrey → /settings/loops
```

## Activity — Abas

`/activity?tab=<aba>`

| Tab | Componente | O que mostra |
|---|---|---|
| `queue` (default) | SendQueueTab (inline) | send_queue — pending/sending/sent/failed, refresh 10s |
| `crawl` | CrawlLogsTab | Logs de crawl por search term |
| `jonfrey` | JonfreyTab | Ações Jonfrey + execução |
| `loops` | LoopActionsTab | Actions dos loops LLM |
| `llm` | LLMTab | Custo, tokens, modelos |
| `audit` | AuditTab | Timeline de auditoria |

## Dashboard — Score Engine Widget

`AlgoStatusWidget` no Dashboard.tsx — polling 30s em `/api/admin/algo/status`.

Estados:
- **disabled** — dot cinza — `use_algo_tick = 0` — mostra toggle "Ligar"
- **paused** — dot amarelo — fora da janela 21h–6h SP
- **error** — dot vermelho — último tick com erro (exibe texto do erro)
- **ok** — dot verde pulsante — saudável — mostra countdown + toggle "Desligar"

Quando `ok` mas `last_enqueued = 0`: link inline que expande diagnóstico por grupo
via `GET /api/admin/algo/dry-run` (chamado com `apiClient`, não href direto).

Toggle chama `POST /api/admin/algo/toggle { enabled: bool }`.

## Design System

Tokens CSS (via Tailwind):
```
text-fg          — texto principal
text-fg-2        — texto secundário
text-fg-3        — texto terciário/label
bg-surface       — fundo card
bg-surface-2     — fundo alternado
border-border    — bordas
text-accent      — cor de destaque (purple)
text-success     — verde
text-warning     — amarelo/laranja
text-danger      — vermelho
```

Componentes UI base (src/components/ui/):
`Button`, `Input`, `Switch`, `KpiCard`, `Tabs`, `PageHeader`, `Badge`

## Convenções

### Queries (react-query)
```tsx
const { data } = useQuery<T>({
  queryKey: ['chave-unica'],
  queryFn: () => apiClient.get('/api/endpoint').then(r => r.data),
  refetchInterval: 30_000,  // polling quando necessário
})
```

### Mutations
```tsx
const mut = useMutation({
  mutationFn: (val) => apiClient.post('/api/endpoint', { val }).then(r => r.data),
  onSuccess: () => qc.invalidateQueries({ queryKey: ['chave'] }),
})
```

### Navegação
- React Router v6: `useNavigate()`, `<Link to="...">`, `useParams()`
- Query params: `useSearchParams()`

### Formulários
- Estado local com `useState` — sem libs de form
- Validação inline antes de submeter

## Tutoriais (Manual)

`src/content/tutorials.ts` — lista de slugs com metadados
`src/content/tutorialBodies.tsx` — conteúdo JSX de cada tutorial
`src/content/operationalManual.tsx` — Manual operacional completo

Slugs existentes: `quickstarter`, `operacional`, `dashboard`, `compose`,
`activity`, `insights`, `catalog`, `taxonomy`, `crawlers`, `scrapers`,
`canais`, `groups`, `templates`, `modems`, `accounts` (legado → modems),
`domains`, `affiliates`, `links`, `conversoes`, `analytics`, `clusters`,
`scoring`, `loops`, `params`, `settings`, `automations` (legado), `jonfrey`
(legado), `match` (legado), `logs` (legado).

## Armadilhas

### apiClient vs href direto
Endpoints com JWT **não funcionam** como `href` direto no browser.
Use sempre `apiClient.get(...)` para endpoints admin.

### Rotas legadas
Várias rotas antigas redirecionam — não criar página nova para elas.
Checar redirects no App.tsx antes de adicionar nova rota.

### AdminParams — flag strangler
`STRANGLER_FLAGS` é a lista de flags que aparecem como toggle no topo.
Novos tunables precisam de entrada em `PARAM_META` para ter label/descrição.

### Canais vs Grupos
`/channels` = canais lógicos (agrupadores com config)
`/groups` = grupos físicos WA/TG
Um canal tem N grupos. Sliders ficam no canal, não no grupo.

### send_queue vs dispatches
`dispatches` foi dropada. A fila real é `send_queue`.
`/activity?tab=queue` mostra `send_queue`.
`/api/admin/send-queue` é o endpoint.
`/api/dashboard/upcoming-dispatches` também usa `send_queue`.
