# Jornadas de automação (Snatcher)

Documentação curta alinhada ao código: **dois caminhos** principais e estados de dispatch.

## 1. Pipeline agendado (crawl → process → evaluate)

1. **Crawl**: termos em `searchterm` geram resultados brutos.
2. **Process**: deduplicação, zonas de confiança de match (HIGH / GRAY / NONE).
3. **Evaluate**: produtos atualizados na janela recente, canais ativos, **janela de envio** (`send_start_hour` / `send_end_hour`), automação com **`events_enabled`**: detecta eventos (novo / drop / lowest) e envia via adapters.

Este fluxo é orientado a **notificações de evento**, não à fila contínua do auto-match.

## 2. Auto-match (fila operacional → WhatsApp)

- Worker **~1 min**: `ListCatalogProducts` (cap típico 100 ativos recentes), opcionalmente filtrado por política **`auto_match_only_curated`** (`curated` / `auto` apenas).
- Automations com **`auto_match_enabled`**, não pausadas.
- Match por score (`match.RankChannels` + taxonomias/atributos).
- Cria **`dispatches`** com `composed_by = "auto-match"` e **targets** por grupos.
- **`full_auto_mode`** (app config):
  - **false** → status **`pending_approval`** (precisa aprovação na UI ou ação tipo Jonfrey).
  - **true** → **`queued`** → worker Evolution processa.

## 3. Envio WhatsApp (Evolution)

- Worker **~15 s** processa targets cujo dispatch está **`queued`** (ou `sending`), não `pending_approval`.
- Exige **URL / chave / instância** Evolution (global ou conta WA ativa com instância).
- **Rate limit**: 3 mensagens / hora / grupo (janela 60 min).
- **Backpressure**: não enfileira novos dispatches se o grupo já tem muitos targets pendentes (limite 10).

## 4. Jonfrey

- Ciclo opcional quando `jonfrey_config.enabled`; melhora taxonomia, inspeção e dados usados no **score** — métricas expostas em `/api/dashboard/automation-diagnostics`.

## Onde ver no produto

- Dashboard: cartão **“Por que não saiu mensagem?”** (`GET /api/dashboard/automation-diagnostics`).
- Config geral: **Full-auto** e **Auto-match só curated/auto**.
