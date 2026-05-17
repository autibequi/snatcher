// Strings narrativas com voz "mythos" — restritas a empty/error/tooltip por invariante.
// NUNCA usar em: títulos de página, labels de tabela, headers de coluna, breadcrumbs,
// métricas numéricas, log structured, métricas Prometheus/OTel.

export const mythosEmpty = {
  catalog:     'Silêncio na biblioteca. Nenhum item aguarda olhar.',
  queue:       'Fila silenciosa. O Despachante repousa.',
  sendLog:     'Nenhum envio registrado nesta janela.',
  baseline:    'Sem snapshots ainda. O Guardião memoriza.',
  quarantine:  'Quarentena vazia. O Censor descansa.',
  outbox:      'O carteiro entregou tudo. Sem eventos pendentes.',
  rejections:  'Nenhuma rejeição. Tudo passa pelos crivos.',
  canonical:   'Catálogo sem duplicatas detectadas. Cada item é um.',
  taxonomy:    'Árvore vazia. O Taxonomista aguarda sua primeira folha.',
  bandit:      'O Apostador ainda não jogou neste canal.',
  jonfrey:     'Sem decisões recentes. Jonfrey observa.',
  automations: 'Nenhuma automação registrada.',
  routing:     'Roteamento padrão. Nenhuma afinidade declarada.',
  rateBuckets: 'Buckets cheios. O Despachante tem fôlego.',
  default:     'Vazio por aqui.',
} as const

export const mythosError = {
  apiOffline:   'O Mensageiro não responde. Tente novamente em instantes.',
  timeout:      'A resposta tarda. O Oráculo está distante.',
  validation:   'Forma inválida. O Escriba pede revisão.',
  unauthorized: 'Acesso negado. As portas reconhecem outros.',
  notFound:     'O recurso pediu silêncio. 404.',
  server:       'O servidor tropeçou. Verifique os logs.',
  unknown:      'Algo escapou ao mythos. Recarregue e tente.',
} as const

export const mythosTooltip = {
  bandit:         'UCB1 contextual. O Apostador equilibra exploração e ganho.',
  jonfrey:        'Decisões do regulador. Guardião do anti-loop.',
  quarantine:     'Itens retidos pelo Censor. Aguardam absolvição.',
  baseline:       'Snapshots periódicos do estado do sistema. O Guardião memoriza.',
  observability:  'Pulso da máquina: workers, breakers, custos LLM, distribuição do catálogo.',
  canonical:      'Produtos canônicos: dedup cross-marketplace.',
  routing:        'Afinidade modem×domínio. Roteamento do Despachante.',
  rateBuckets:    'Tokens disponíveis por escopo. Ritmo do envio.',
  catalogStatus:  'Estado do item: pending → enriching → ready → sent.',
  circuitBreaker: 'Closed: tudo flui. Open: pausa. Half-open: probe.',
} as const

export type MythosEmptyKey = keyof typeof mythosEmpty
export type MythosErrorKey = keyof typeof mythosError
export type MythosTooltipKey = keyof typeof mythosTooltip
