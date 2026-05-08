# CARD: Refactor Triagem de Anúncios — Catalog → Match

**Project root:** `/workspace/.cache/snatcher`
**Plan source:** `/home/bardiel/.claude/plans/agora-avalie-todas-as-idempotent-milner.md`
**Status:** PR-4 in progress (coder-haiku-2026-05-08)
**Heartbeat:** 2026-05-08T23:07:00Z
**Owner:** coder-haiku-20260508-0001

## Objetivo

Reformar o flow `crawl → process → catalog → match` para ter:
1. Schema rico com taxonomy hierárquica + atributos estruturados + patterns flexíveis
2. Seed pré-populado extenso (categorias, subcategorias, marcas, atributos, regex/keywords/excludes)
3. Pipeline com dedup robusto (source+external_id → URL → fuzzy + LLM tiebreaker executado de fato)
4. Match scoring com breakdown auditável + regex/word_boundary/atributos/hard filters
5. Loop de feedback Jonfrey usando false_positive flag

## Arquitetura geral

Ler o plano completo em `/home/bardiel/.claude/plans/agora-avalie-todas-as-idempotent-milner.md`.

## Notas de Execução

- [x] Migration 0114 criada: `/workspace/.cache/snatcher/backend-go/internal/db/migrations/0114_taxonomy_patterns_extra.sql`
- [x] 362 patterns inseridos (word_boundary: 233, regex: 65, contains_keyword: 54, exclude_regex: 10)
- [x] Brands (80 principais + 25 aliases + 10 excludes)
- [x] Subcategorias (~160 patterns genéricos)
- [x] Cores, tamanhos roupa/calçado, voltagens, capacidades
- [x] Raiz categorias (~30 patterns)
- [x] Build/vet limpos
- [x] Idempotência garantida (ON CONFLICT DO NOTHING em todos INSERTs)

## Fases (executar em sequência, cada uma com build/vet limpos)

---

### PR-1 — Schema + Seed + Models + Store

**Migration `0112_taxonomy_seed.sql`** (idempotente; tudo `ON CONFLICT DO NOTHING` ou `IF NOT EXISTS`):

Estruturas:
```sql
CREATE TABLE IF NOT EXISTS taxonomy_pattern (
  id BIGSERIAL PRIMARY KEY,
  taxonomy_id BIGINT NOT NULL REFERENCES taxonomy(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('exact_keyword','contains_keyword','word_boundary','regex','exclude_regex','exclude_keyword')),
  value TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  locale TEXT DEFAULT 'pt-BR',
  source TEXT DEFAULT 'seed',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_taxonomy_pattern_tx ON taxonomy_pattern(taxonomy_id, kind, active);
CREATE INDEX IF NOT EXISTS ix_taxonomy_pattern_kind_active ON taxonomy_pattern(kind, active);

CREATE TABLE IF NOT EXISTS catalogproduct_taxonomy (
  product_id BIGINT NOT NULL REFERENCES catalogproduct(id) ON DELETE CASCADE,
  taxonomy_id BIGINT NOT NULL REFERENCES taxonomy(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('primary_category','subcategory','brand','attribute_color','attribute_size','attribute_voltage','attribute_capacity','attribute_other')),
  confidence REAL NOT NULL DEFAULT 1.0,
  source TEXT DEFAULT 'pipeline',
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (product_id, taxonomy_id, role)
);
CREATE INDEX IF NOT EXISTS ix_cpt_role_tx ON catalogproduct_taxonomy(role, taxonomy_id);
CREATE INDEX IF NOT EXISTS ix_cpt_product ON catalogproduct_taxonomy(product_id);

ALTER TABLE catalogproduct ADD COLUMN IF NOT EXISTS attributes JSONB DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS ix_cp_attrs_gin ON catalogproduct USING GIN (attributes);
```

**Seed pré-populado** — siga a especificação do plano. Tamanhos esperados:
- ~15 categorias-raiz
- ~120 subcategorias (com `parent_id` apontando pra categoria-raiz)
- ~250 marcas
- ~25 cores, ~20 tamanhos roupa, ~16 tamanhos calçado, 3 voltagens, ~30 capacidades/características
- ~1500 patterns (taxonomy_pattern) cobrindo: word_boundary pra cada brand, regex pra aliases (Galaxy/iPhone/etc), exclude_regex pra anti-falso-positivo (Acer→Racer, Mor→morrer, Apple→suco), keyword genérico pra subcategorias

Para cada categoria/subcat, inserir com `INSERT INTO taxonomy(type, name, slug, parent_id, source, status, ...) ... ON CONFLICT (slug) DO NOTHING`. Verificar a estrutura exata da tabela `taxonomy` (mig 0099 + 0100) — campos: id, type, name, slug, keywords (TEXT[]), parent_id, detect_count, source, status (status pode ser 'approved'/'pending'/etc — verifique).

Para patterns, fazer `INSERT INTO taxonomy_pattern(taxonomy_id, kind, value, weight, source) SELECT t.id, 'word_boundary', 'samsung', 1.0, 'seed' FROM taxonomy t WHERE t.slug='samsung' ON CONFLICT DO NOTHING` ou similar (idempotência via WHERE NOT EXISTS).

**Migration `0113_match_logs_breakdown.sql`** (mais simples):

```sql
ALTER TABLE auto_match_logs
  ADD COLUMN IF NOT EXISTS score_breakdown JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS match_reasons TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS false_positive BOOLEAN,
  ADD COLUMN IF NOT EXISTS false_positive_reason TEXT,
  ADD COLUMN IF NOT EXISTS false_positive_marked_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS ix_aml_fp ON auto_match_logs(false_positive) WHERE false_positive = true;
```

**Models** (`internal/models/models.go`):
- `TaxonomyPattern` struct (ID, TaxonomyID, Kind, Value, Weight, Locale, Source, Active, CreatedAt, UpdatedAt)
- `CatalogProductTaxonomy` struct (ProductID, TaxonomyID, Role, Confidence, Source, CreatedAt)
- Adicionar `Attributes models.JSONB` em `CatalogProduct` (ou `[]byte`/`json.RawMessage` conforme padrão atual do projeto — ver outros campos JSONB)
- `Audience` struct: adicionar campos novos opcionais (omitempty):
  - `IncludeCategoryIDs []int64 json:"include_category_ids,omitempty"`
  - `ExcludeCategoryIDs []int64 json:"exclude_category_ids,omitempty"`
  - `IncludeSubcategoryIDs []int64 json:"include_subcategory_ids,omitempty"`
  - `IncludeBrandIDs []int64 json:"include_brand_ids,omitempty"`
  - `ExcludeBrandIDs []int64 json:"exclude_brand_ids,omitempty"`
  - `RequiredAttributes map[string][]int64 json:"required_attributes,omitempty"` (chaves: "color","size","voltage","capacity")
  - `PreferredAttributes map[string][]int64 json:"preferred_attributes,omitempty"`
- `AutoMatchLog`: adicionar `ScoreBreakdown []byte` (jsonb), `MatchReasons pq.StringArray`, `FalsePositive *bool`, `FalsePositiveReason string`, `FalsePositiveMarkedAt *time.Time`

**Store** (`internal/store/sql_store.go`):
Métodos novos:
- `ListTaxonomyPatterns(taxonomyIDs []int64, kinds []string) ([]TaxonomyPattern, error)`
- `ListAllActivePatterns() ([]TaxonomyPattern, error)` (pra cache em memória)
- `MaxTaxonomyPatternUpdatedAt() (time.Time, error)` (pra invalidação de cache)
- `UpsertProductTaxonomy(productID, taxonomyID int64, role string, confidence float64, source string) error`
- `ListProductTaxonomies(productID int64) ([]CatalogProductTaxonomy, error)`
- `MarkAutoMatchFalsePositive(logID int64, reason string) error`
- `ListFalsePositiveLogs(sinceDays int) ([]AutoMatchLog, error)`
- `UpdateAutoMatchScoreBreakdown(logID int64, breakdown []byte, reasons []string) error`
- `UpdateProductAttributesJSON(productID int64, attrs []byte) error`

**Handlers/router** (mínimos pra PR-1):
- `internal/handlers/admin/taxonomy_patterns.go` — CRUD: `GET /api/taxonomy-patterns?taxonomy_id=X`, `POST /api/taxonomy-patterns`, `PATCH /api/taxonomy-patterns/{id}`, `DELETE /api/taxonomy-patterns/{id}`
- `internal/handlers/admin/match_logs.go` — `POST /api/match-logs/{id}/false-positive` body `{reason: string}`
- Registrar rotas em `internal/router/router.go`

#### Verificação PR-1

```
cd /workspace/.cache/snatcher/backend-go && go build -buildvcs=false ./... && go vet ./...
```

Build + vet limpos. Não rodar migrations no DB nesta fase (rodam quando a app subir).

---

### PR-2 — Pipeline: dedup robusto + LLM tiebreaker executado + atributos

**Files**:
- `internal/scrapers/amazon.go`, `mercadolivre.go` — extrair `ASIN`/`MLB-id` da URL pra preencher `CrawlResult.SourceSubID`. Para Amazon: regex `/dp/([A-Z0-9]{10})` ou `/gp/product/([A-Z0-9]{10})`. Para ML: regex `MLB-?\d+` da URL.
- `internal/pipeline/crawl.go` — chamada que persiste crawl_result deve passar `source_subid` do scraper.
- `internal/match/patterns.go` (NOVO) — `MatchAllPatterns(text string, kinds []string) []TaxonomyHit`:
  - Cache RAM `sync.Map[taxonomyID]CompiledPatterns`
  - Versão = max(updated_at) de `taxonomy_pattern`; recompila se mudou
  - Aplica em ordem: exclude_regex/exclude_keyword primeiro (se bater, descarta o hit); depois exact, word_boundary, regex, contains
  - Retorna `[]TaxonomyHit{TaxonomyID, Role, Confidence (= weight × kind_priority), MatchedValue}`
- `internal/pipeline/process.go` — `processResult` reorganizado:
  ```
  1. Dedup por (source, source_subid) — store.GetVariantBySourceSubID(source, subid)
     → se existe: UPDATE price + INSERT pricehistoryv2 + atualiza last_seen_at; return
  2. Dedup por URL canônica normalizada (já existe parcialmente — ver GetVariantByURL)
     → idem return
  3. findBestMatch (fuzzy):
     - score ≥ 0.90 → CREATE variant; INSERT pricehistoryv2
     - 0.65 ≤ score < 0.90 → CHAMA llmFn (com timeout 90s); resposta {decision: merge|new, target_id, reasoning}; aplica
     - < 0.65 → CREATE catalogproduct novo + variant
  4. EnrichTags via MatchAllPatterns; UpsertProductTaxonomy pra cada hit; atualiza catalogproduct.attributes JSONB com {color:[ids], size:[ids], voltage:[ids], capacity:[ids]}
  5. Curation: tem primary_category + brand → 'auto'; senão 'pending'
  ```

**Helper novo no store**: `GetVariantBySourceSubID(source, subid string) (*CatalogVariant, bool, error)`. URL canônica: implementar `canonicalizeURL(rawURL string) string` removendo `utm_*`, `tag`, `ref`, `fbclid` e fragmentos.

#### Verificação PR-2

```
go build -buildvcs=false ./... && go vet ./...
```

Cenários (manuais via curl/teste, opcional):
- Crawl mesmo ASIN 2x → 1 variant, 2 entradas em pricehistoryv2
- Crawl Acer notebook → primary_category=Notebooks, brand=Acer; NÃO tem brand=Razer mesmo se título tiver "racer-style"

---

### PR-3 — Match scoring com breakdown + regex/word_boundary/atributos

**File**: `internal/match/score.go`

Nova struct:
```go
type ScoreBreakdown struct {
    Category float64 `json:"category"`
    Subcategory float64 `json:"subcategory"`
    Brand float64 `json:"brand"`
    Attribute float64 `json:"attribute"`
    Price float64 `json:"price"`
    Drop float64 `json:"drop"`
    History float64 `json:"history"`
    HardFiltersPassed bool `json:"hard_filters_passed"`
    WeightsUsed map[string]float64 `json:"weights_used"`
}

type ScoreResult struct {
    Total int                 // 0..100
    Breakdown ScoreBreakdown
    Reasons []string
}
```

`ScoreChannel(input ProductInput, ch Channel) ScoreResult`:

1. **Hard filters** primeiro (se algum falhar → Total=0, HardFiltersPassed=false):
   - bate em `Audience.ExcludeCategoryIDs` OU `ExcludeBrandIDs` (consulta `catalogproduct_taxonomy`)
   - falta atributo de `Audience.RequiredAttributes` (todas chaves precisam ter ≥1 ID em comum com produto)
2. **Soft components** (cada um 0.0–1.0):
   - `Category`: hit em `IncludeCategoryIDs` → 1.0, senão 0.0
   - `Subcategory`: hit em `IncludeSubcategoryIDs` → 1.0; se canal não definir → 0.5 (neutro)
   - `Brand`: hit em `IncludeBrandIDs` → 1.0; senão 0.3
   - `Attribute`: proporção de `PreferredAttributes` satisfeitos
   - `Price`: dentro de `[MinPrice, MaxPrice]` → 1.0; decay linear nas bordas
   - `Drop`: drop ≥ MinDrop → 1.0; ramp linear
   - `History`: clicks_30d desse canal+produto/categoria, normalizado (cap em 10 = 1.0)
3. **Total** = round((Σ component × weight) × 100); clip [0..100]
4. **Reasons**: array de strings explicativas pra cada componente que somou >0

Persistir em `auto_match_logs.score_breakdown` (JSON) e `match_reasons` (TEXT[]) — usar `UpdateAutoMatchScoreBreakdown` ao logar match (ou direto no INSERT — verifique `auto_match_worker.go`).

**Match types adicionais** em `MatchesChannelFilter`:
- `regex`: compila `MatchValue` (cache por canal); aplica em `canonical_name`
- `word_boundary`: usa `MatchesWordBoundary(text, MatchValue)` (já existe no store)
- `attribute_strict`: `MatchValue` é JSON `{"color":["preto"], "size":["G"]}`; todos precisam bater
- `attribute_any`: idem, qualquer um basta

#### Verificação PR-3

```
go build -buildvcs=false ./... && go vet ./...
```

---

### PR-4 — Frontend + 3 ações Jonfrey novas

**Frontend**:
- `frontend/src/components/AudienceEditor.tsx`:
  - Trocar inputs de string-list por multiselect que busca em `/api/taxonomies?type=category&parent_id=null` (cat-raiz) e `/api/taxonomies?type=category&parent_id=X` (subcats)
  - Seções: **Inclusos** / **Excluídos** / **Atributos requeridos** / **Atributos preferidos**
  - Dropdowns pra cor/tamanho/voltagem listando taxonomias do tipo color/size/voltage
- `frontend/src/pages/Logs.tsx`:
  - Linha expansível mostra `score_breakdown` (barra horizontal por componente) + `match_reasons` (lista)
  - Botão "Marcar falso positivo" → chama `POST /api/match-logs/:id/false-positive` com `reason` em prompt
- `frontend/src/pages/Catalog.tsx`:
  - Adicionar filtros sidebar por subcategoria + atributos (cor/tamanho/voltagem) — usar `attributes` JSONB no produto
- `frontend/src/pages/Taxonomy.tsx`:
  - Tab "Patterns" com tabela CRUD: `taxonomy_pattern` filtrado por taxonomy. Form: kind dropdown, value, weight, active

**Jonfrey** (`internal/handlers/admin/jonfrey.go`):
3 ações novas:
- `enrich_taxonomy_from_unmatched` (curation): `SELECT id, canonical_name FROM catalogproduct WHERE id NOT IN (SELECT product_id FROM catalogproduct_taxonomy WHERE role='primary_category') LIMIT 100`. Agrupa por similaridade de título. Pede LLM JSON `{groups: [{suggested_taxonomy: "Smartphones", parent: "Eletrônicos", patterns: [{kind:"word_boundary", value:"galaxy"}], confidence: 0.9}]}`. Aplica se ≥0.85.
- `prune_false_positives` (curation): `SELECT taxonomy_id, COUNT(*) FROM auto_match_logs aml JOIN catalogproduct_taxonomy cpt ON cpt.product_id = aml.product_id WHERE aml.false_positive = true AND aml.created_at > now() - interval '30 days' GROUP BY taxonomy_id ORDER BY 2 DESC LIMIT 20`. Para cada taxonomy_id top, LLM sugere `exclude_regex` baseado nos títulos dos produtos flagged. Sempre approval.
- `refine_subcategories` (optimization): para cada categoria-raiz com >100 produtos sem subcategory, LLM agrupa amostras (50 produtos) em 3-7 subcategorias coerentes, retorna JSON `{subcategories: [{name, slug, patterns: [...]}]}`.

3 ações expandidas:
- `optimize_audience_from_clicks`: além de cat/brand strings, sugerir IDs e atributos preferidos
- `auto_curate_high_confidence`: usar `catalogproduct_taxonomy` em vez de `tags` do produto
- `maintain_taxonomy`: dedupe `taxonomy_pattern` (regex equivalentes via comparação textual)

#### Verificação PR-4

```
go build -buildvcs=false ./... && go vet ./...
cd /workspace/.cache/snatcher/frontend && ./node_modules/.bin/tsc --noEmit
```

---

## Notas gerais

- **NÃO** quebre compat: `tags` JSON do `catalogproduct` continua sendo lido/escrito por enquanto (espelha de `catalogproduct_taxonomy`). `Audience.Categories[]` (strings) também continua existindo — campos novos `*_ids` são adicionais.
- LSP errors com `BrokenImport` em `.cache/` são RUÍDO conhecido. Confiar APENAS no `go build` e `tsc --noEmit` reais.
- Para chamadas LLM, sempre usar timeout: `ctx, cancel := context.WithTimeout(ctx, 90*time.Second); defer cancel()`.
- Build limpo = sem stdout além de download de deps.
- **NÃO** mexer em código fora do escopo de cada PR — não refatorar arquivos não listados.

## Arquivos a tocar (resumo cross-PR)

**Migrations**: `0112_taxonomy_seed.sql`, `0113_match_logs_breakdown.sql`
**Backend**: models.go, sql_store.go, match/patterns.go (novo), match/score.go, pipeline/process.go, pipeline/crawl.go, scrapers/amazon.go, scrapers/mercadolivre.go, handlers/admin/taxonomy_patterns.go (novo), handlers/admin/match_logs.go (novo), handlers/admin/jonfrey.go, router/router.go
**Frontend**: AudienceEditor.tsx, Logs.tsx, Catalog.tsx, Taxonomy.tsx
