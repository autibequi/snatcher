# DECISIONS.md — Snatcher

> Registro de decisões de arquitetura e produto.
> Última atualização: 2026-05-12. Autor: Pedro Corrêa + Claude (executor).
> Formato: ADR simplificado. Decisões fixadas não são reabertas sem evidência nova.

---

## Decisões fixadas

### Q1 — Hardware: Mac mini como host de produção

**Status:** FIXADO (2026-05-12)
**Decisão:** O Mac mini é o host de produção. O Raspberry Pi foi o host anterior. A migração já está in progress.
**Consequência:** Deploy via Coolify orquestrando containers Docker no Mac mini. Scripts e docker-compose devem remover referências arm/Pi-specific.
**Não reabre:** hardware está definido.

---

### Q-dup — Schema: "última definição vence"

**Status:** FIXADO (2026-05-12)
**Decisão:** Quando o schema SQL tem uma tabela ou campo declarado 2×, a **segunda** (mais recente no arquivo) é a canônica. A primeira é removida no `snatcher-schema-resolved.sql`.
**Aplicação imediata:**
- Tabela `group_conversion_features`: manter a segunda definição (com `last_validated`, `status='active|expired|rejected'`).
- Tabela `catalog`: campos `quality_score`, `price_anchor_30d`, `canonical_url_alive`, `last_price_change_at` duplicados — manter a segunda ocorrência (com `quality_score_at`, `last_price_drop_at`).
**Não reabre:** regra de resolução de duplicatas é definitiva.

---

### Q5 — Algo tick: novo worker a partir de `algo/tick.go`

**Status:** FIXADO (2026-05-12)
**Decisão:** O `auto_match_worker.go` existente **não** é refatorado in-place. Um novo worker em `internal/algo/tick.go` implementa o Algo com as 5 camadas cimentadas (quality_score pré-computado, learned_weights, anti-repeat, pacing 1-item-por-grupo-por-tick, janela 21h-6h). O `auto_match_worker.go` permanece ativo até o novo worker estar validado em produção, desativado via `tunable_parameter` flag.
**Motivo:** refactor in-place em código de envio ativo tem risco de double-send; strangler é mais seguro.
**Não reabre:** abordagem strangler é a padrão do projeto.

---

### Q9 — Migration tool: golang-migrate com timestamp

**Status:** FIXADO (2026-05-12)
**Decisão:** O projeto migra de dbmate-like (sequencial `0001`, `0002`, ...) para **golang-migrate** com nomes de arquivo em formato timestamp (`YYYYMMDDHHMMSS_nome_descritivo.up.sql` / `.down.sql`). A Fase 0.7 executa essa troca de tooling antes de qualquer migration nova.
**Motivo:** golang-migrate é idiomático em Go, tem suporte a `down`, lock distribuído, e o brief o menciona explicitamente.
**Consequência:** migrations existentes (0001-0136) são tratadas como histórico aplicado; a primeira migration nova será `20260512XXXXXX_xxx.up.sql`.
**Não reabre:** tooling swap é objetivo da Fase 0.7.

---

### Q3 — Jonfrey escopo

**Status:** FIXADO (2026-05-17)
**Decisão:** DB-driven via tabela `automations` + `jonfrey_decisions` audit (V3 W5). Jonfrey vira **regulador do bandit** (W2.B): ajusta `exploration_factor` por canal, pode congelar canal. Anti-loop guard: cooldown 1h decisões opostas; 3 oscilações/24h → `escalate_to_human` via alerta no grupo Críticos. Critical automations NUNCA pausadas por Jonfrey (invariante I10).
**Consequência:** Tabela `jonfrey_actions` antiga não é wiring de L4 — virou audit separado. L4 (cooldown_suggest + cap_suggest) é independente, fica em `llm_suggestions` (entrega em V3 W3 + Dashboard). ADR-011 já cimentou bandit-regulator.
**Não reabre:** wiring está claro.

---

### Q4 — Channel/ChannelRule/ChannelAutomation deprecation

**Status:** FIXADO (2026-05-17)
**Decisão:** Auto-quarantine via V3 W3 (`taxonomy_node` + `taxonomy_feedback` + `quarantine_events`) + manual review humano via UI W4 (`ActivityHub` tab Quarantine). Threshold de quarentena em `tunable_parameters.quarantine_threshold` (preserva config existente). Auto-lift via Jonfrey job (W5) quando TTL expira ou correção humana.
**Consequência:** ChannelRule legado fica vivo até W2.A migrar `send_ready` → `catalog_status` enum. ChannelAutomation absorvida pela tabela `automations` em W5. Sem big-bang delete; expand-contract.
**Não reabre:** caminho W3 + W5 está cimentado em ADR-011 + ADR-012.

---

### Q8 — LLM provider canônico

**Status:** FIXADO (2026-05-17)
**Decisão:** OpenRouter como provider canônico. Formaliza ADR-001 existente. Modelo default `gpt-4o-mini`; `claude-3-5-sonnet` apenas em creative template (copy de WhatsApp). Budget $20/mês modo economy via `tunable_parameters.llm_budget_usd_daily`.
**Consequência:** V3 W2.B (UCB1 bandit), W3 (taxonomy LLM enrich), W5 (Jonfrey regulator) usam OpenRouter. Cache obrigatório com prompt-hash TTL 24h-7d. Kill-switch via `tunable_param`. DeepSeek V4 Flash NÃO é caminho canônico (alternativa rejeitada pelo overhead de mais um SDK).
**Não reabre:** ADR-001 e ADR-003 já tinham fixado; esta linha consolida formalmente.

---

### Q12 — Coolify como orquestrador no Mac mini

**Status:** FIXADO (2026-05-17)
**Decisão:** Sim, Coolify orquestrando containers Docker no Mac mini. Imagens em `ghcr.io/autibequi/snatcher-{backend,frontend,redirect}:latest`. Q1 (hardware) já cimentou Mac mini; Q12 só formaliza o orquestrador.
**Consequência:** Cutover staged do V3 W1 (10% → 50% → 100% modems) usa `tunable_parameters.dispatch_engine` (não Coolify env). Coolify continua sendo o caminho de deploy de imagens novas.
**Não reabre:** Q1 + Q12 fecham a stack de runtime.

---

### Q15 — Conta WhatsApp Business dedicada para alertas

**Status:** FIXADO (2026-05-17)
**Decisão:** Sim. Conta WA Business NOVA (não as do snatcher) cadastrada em `accounts` table com `modem_id` correto, status `warming`, `daily_send_quota=20` (incrementar gradualmente). Operacionaliza a Fase 6 (curator + 2 grupos curator).
**Consequência:** Card a05 da Fase A executa o cadastro. Bloco SQL canônico está no RUNBOOK seção "Antes de subir em prod" itens 3 e 7. V3 W1 + W3 + W5 dependem dos grupos curator existirem para testar Jonfrey alerts.
**Não reabre:** decisão operacional, sem alternativa razoável.

---

## Decisões pendentes

> Estas 11 questões precisam de resposta do Pedrinho antes ou durante a Fase correspondente.
> Formato: pergunta + contexto mínimo + data-limite sugerida + bloqueio.

---

### Q2 — Telegram: descontinuar no pipeline de promoções?

**Status:** PENDENTE
**Pergunta:** Devo planejar a descontinuação do suporte TG no pipeline de envio de promoções? Manter TG apenas para os 2 grupos de alertas (Fase 6)?
**Contexto:** Specs cimentadas falam exclusivamente WhatsApp para promoções. `internal/messaging` suporta WA + TG. `tgaccount`, `telegramchat` são tabelas ativas. Se há grupos TG com audiência real, descontinuar bruscamente perde essa audiência.
**Impacto se não respondido:** migrations da Fase 1 não sabem se devem incluir `tg_account_id` no schema de `groups` cimentado ou não.
**Data-limite:** antes de iniciar Fase 1 (migrations).
**Bloqueio:** Fase 1 (schema de groups), Fase 4 (senders), Fase 6 (alertas).

---


### Q6 — Ads e Broadcast: ainda são features ativas?

**Status:** PENDENTE
**Pergunta:** `ads`, `broadcastmessage`, `clicklog` (ads) ainda são usados em produção? Devo mantê-los completamente fora do hot path do pipeline novo ou há planos de integração?
**Contexto:** Não estão nas specs cimentadas. Se estão em uso ativo em produção, preciso garantir que as migrations da Fase 1 não quebrem o schema dessas tabelas.
**Impacto se não respondido:** baixo (são tabelas separadas), mas se o frontend lê `ads` em dashboards, precisamos saber.
**Data-limite:** antes de Fase 1 (por segurança).
**Bloqueio:** nenhum crítico; apenas documentação de scope.

---

### Q7 — Group_spies: fonte de learning ou isolar completamente?

**Status:** PENDENTE
**Pergunta:** `internal/spy` + `group_spies` + `spy_messages` (crawler de grupos concorrentes) vira fonte de learning para L5/L9, ou fica completamente isolado e fora do roadmap?
**Contexto:** Não está nas specs. Mas `spy_messages` pode ser input valioso para `taxonomy_grow` (L5) — o LLM poderia aprender categorias a partir dos produtos que concorrentes estão enviando. Se integrar, precisa de schema bridge.
**Impacto se não respondido:** L5 (Fase 5) pode ficar sem uma fonte de dados de treinamento relevante.
**Data-limite:** antes de Fase 5.
**Bloqueio:** Fase 5 (L5 taxonomy_grow).

---


### Q10 — Renomear `background_jobs` → `jobs`?

**Status:** PENDENTE
**Pergunta:** Posso renomear a tabela `background_jobs` para `jobs` em uma migration? Há código externo (frontend/scripts) que lê `background_jobs` diretamente pelo nome?
**Contexto:** Schema cimentado usa `jobs`. O projeto existente usa `background_jobs`. Renomear é trivial em SQL (`ALTER TABLE background_jobs RENAME TO jobs`) mas requer atualizar todas as referências Go + frontend.
**Impacto se não respondido:** Fase 1 cria a tabela `jobs` nova separada, mantendo `background_jobs` como legado — gera duplicação.
**Data-limite:** antes de Fase 1.
**Bloqueio:** Fase 1 (schema de jobs).

---

### Q11 — CDKey scraper: Kinguin/Humble como `source='cdkey'` ou source separado?

**Status:** PENDENTE
**Pergunta:** O schema cimentado tem `source='cdkey'`. Existem scrapers de Humble e Kinguin. Mapeio Humble/Kinguin como `source_id` do CDKey single, crio sources separadas, ou o CDKey scraper vai ser dedicado a uma loja específica?
**Contexto:** CDKey é um mercado (Kinguin, G2A, Humble, CDKeys.com são diferentes lojas). Se o cimentado prevê um único source `cdkey`, precisamos definir qual loja ele representa ou se é um agregador.
**Impacto se não respondido:** seeds da Fase 1 inserem `cdkey` sem saber de qual scraper ele é consumer.
**Data-limite:** antes de Fase 1 (seeds de sources).
**Bloqueio:** Fase 1 (seeds).

---


### Q13 — Frontend split: antes ou depois da Fase 4?

**Status:** PENDENTE
**Pergunta:** O `docs/split-admin-public.md` descreve split do frontend em admin (privado) e public (dashboard de sugestões L4 + grupo de alertas). Esse split entra antes ou depois da Fase 4?
**Contexto:** Fase 5 cria `llm_suggestions` que aparecem na dashboard. Se o frontend não estiver splitado, as sugestões ficam na mesma SPA admin. Sem urgência operacional, mas afeta o planejamento de Fase 5.
**Impacto se não respondido:** Fase 5 expõe sugestões LLM na UI admin atual (aceitável temporariamente).
**Data-limite:** antes de Fase 5.
**Bloqueio:** nenhum crítico (Fase 5 pode usar admin temporariamente).

---


## Log de mudanças

| Data | Questão | Ação |
|---|---|---|
| 2026-05-12 | Q1, Q-dup, Q5, Q9 | Fixadas com base em GAP_ANALYSIS.md e brief |
| 2026-05-12 | Q2-Q4, Q6-Q8, Q10-Q13, Q15 | Documentadas como pendentes aguardando Pedrinho |
| 2026-05-17 | Q3, Q4, Q8, Q12, Q15 | Fixadas conforme plan-2026-05-17 + ADR-013 |
