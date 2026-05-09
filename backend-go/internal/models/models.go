package models

import (
	"database/sql"
	"encoding/json"
	"strings"
	"time"

	"github.com/lib/pq"
)

// Source represents a marketplace data source (e.g., Mercado Livre, Amazon).
type Source struct {
	ID         string     `db:"id" json:"id"`
	Name       string     `db:"name" json:"name"`
	Category   string     `db:"category" json:"category"`
	Enabled    bool       `db:"enabled" json:"enabled"`
	ConfigJSON NullString `db:"config_json" json:"config_json,omitempty"`
}

// Affiliate represents affiliate tracking information for a source.
type Affiliate struct {
	ID         int64     `db:"id" json:"id"`
	SourceID   string    `db:"source_id" json:"source_id"`
	Name       string    `db:"name" json:"name"`
	TrackingID string    `db:"tracking_id" json:"tracking_id"`
	Active     bool      `db:"active" json:"active"`
	CreatedAt  time.Time `db:"created_at" json:"created_at"`
}

type Group struct {
	ID              int64      `db:"id" json:"id"`
	Name            string     `db:"name" json:"name"`
	Description     string     `db:"description" json:"description"`
	SearchPrompt    string     `db:"search_prompt" json:"search_prompt"`
	MinVal          float64    `db:"min_val" json:"min_val"`
	MaxVal          float64    `db:"max_val" json:"max_val"`
	WhatsappGroupID NullString `db:"whatsapp_group_id" json:"whatsapp_group_id,omitempty"`
	WAGroupStatus   NullString `db:"wa_group_status" json:"wa_group_status,omitempty"`
	TelegramChatID  NullString `db:"telegram_chat_id" json:"telegram_chat_id,omitempty"`
	TGGroupStatus   NullString `db:"tg_group_status" json:"tg_group_status,omitempty"`
	MessageTemplate NullString `db:"message_template" json:"message_template,omitempty"`
	Active          bool       `db:"active" json:"active"`
	ScanInterval    int        `db:"scan_interval" json:"scan_interval"`
	CreatedAt       time.Time  `db:"created_at" json:"created_at"`
	UpdatedAt       time.Time  `db:"updated_at" json:"updated_at"`
}

type Product struct {
	ID        int64      `db:"id" json:"id"`
	GroupID   int64      `db:"group_id" json:"group_id"`
	Title     string     `db:"title" json:"title"`
	Price     float64    `db:"price" json:"price"`
	URL       string     `db:"url" json:"url"`
	ImageURL  NullString `db:"image_url" json:"image_url,omitempty"`
	Source    string     `db:"source" json:"source"`
	ShortID   NullString `db:"short_id" json:"short_id,omitempty"`
	FamilyKey NullString `db:"family_key" json:"family_key,omitempty"`
	FoundAt   time.Time  `db:"found_at" json:"found_at"`
	SentAt    NullTime   `db:"sent_at" json:"sent_at,omitempty"`
}

type ClickLog struct {
	ID        int64     `db:"id" json:"id"`
	ProductID int64     `db:"product_id" json:"product_id"`
	ClickedAt time.Time `db:"clicked_at" json:"clicked_at"`
	IPHash    string    `db:"ip_hash" json:"ip_hash"`
	UserAgent string    `db:"user_agent" json:"user_agent"`
	Referrer  string    `db:"referrer" json:"referrer"`
}

type ScanJob struct {
	ID            int64      `db:"id" json:"id"`
	GroupID       int64      `db:"group_id" json:"group_id"`
	StartedAt     time.Time  `db:"started_at" json:"started_at"`
	FinishedAt    NullTime   `db:"finished_at" json:"finished_at,omitempty"`
	ProductsFound int        `db:"products_found" json:"products_found"`
	Status        string     `db:"status" json:"status"`
	ErrorMsg      NullString `db:"error_msg" json:"error_msg,omitempty"`
}

type AppConfig struct {
	ID             int        `db:"id" json:"id"`
	WAProvider     string     `db:"wa_provider" json:"wa_provider"`
	WABaseURL      NullString `db:"wa_base_url" json:"wa_base_url,omitempty"`
	WAApiKey       NullString `db:"wa_api_key" json:"wa_api_key,omitempty"`
	WAInstance     NullString `db:"wa_instance" json:"wa_instance,omitempty"`
	GlobalInterval int        `db:"global_interval" json:"global_interval"`
	SendStartHour  int        `db:"send_start_hour" json:"send_start_hour"`
	SendEndHour    int        `db:"send_end_hour" json:"send_end_hour"`
	MLClientID     NullString `db:"ml_client_id" json:"ml_client_id,omitempty"`
	MLClientSecret NullString `db:"ml_client_secret" json:"ml_client_secret,omitempty"`
	WAGroupPrefix  NullString `db:"wa_group_prefix" json:"wa_group_prefix,omitempty"`
	AlertPhone     NullString `db:"alert_phone" json:"alert_phone,omitempty"`
	UseShortLinks  bool       `db:"use_short_links" json:"use_short_links"`
	TGEnabled      bool       `db:"tg_enabled" json:"tg_enabled"`
	TGBotToken     NullString `db:"tg_bot_token" json:"tg_bot_token,omitempty"`
	TGBotUsername  NullString `db:"tg_bot_username" json:"tg_bot_username,omitempty"`
	TGGroupPrefix  NullString `db:"tg_group_prefix" json:"tg_group_prefix,omitempty"`
	TGLastUpdateID NullInt64  `db:"tg_last_update_id" json:"tg_last_update_id,omitempty"`

	// LLM provider
	LLMProvider NullString `db:"llm_provider" json:"llm_provider,omitempty"`
	LLMApiKey   NullString `db:"llm_api_key" json:"llm_api_key,omitempty"`
	LLMBaseURL  NullString `db:"llm_base_url" json:"llm_base_url,omitempty"`
	LLMModel    NullString `db:"llm_model" json:"llm_model,omitempty"`
	// Self-hosted separado (migration 0115) — não partilha URL/modelo entre Ollama e vLLM.
	LLMOllamaBaseURL NullString `db:"llm_ollama_base_url" json:"llm_ollama_base_url,omitempty"`
	LLMOllamaModel   NullString `db:"llm_ollama_model" json:"llm_ollama_model,omitempty"`
	LLMVLLMBaseURL   NullString `db:"llm_vllm_base_url" json:"llm_vllm_base_url,omitempty"`
	LLMVLLMModel     NullString `db:"llm_vllm_model" json:"llm_vllm_model,omitempty"`
	LLMVLLMApiKey    NullString `db:"llm_vllm_api_key" json:"llm_vllm_api_key,omitempty"`
	// OpenRouter model fallbacks — URL openrouter apenas; segunda opção se o primário falhar.
	LLMOpenRouterFallbackModel NullString `db:"llm_openrouter_fallback_model" json:"llm_openrouter_fallback_model,omitempty"`

	// White-label
	AppName   NullString `db:"app_name" json:"app_name,omitempty"`
	AppDomain NullString `db:"app_domain" json:"app_domain,omitempty"`

	// Auto match
	AutoMatchEnabled   bool    `db:"auto_match_enabled" json:"auto_match_enabled"`
	AutoMatchThreshold float64 `db:"auto_match_threshold" json:"auto_match_threshold"`
	AutoMatchMaxPerRun int     `db:"auto_match_max_per_run" json:"auto_match_max_per_run"`
	// migration 0120 — só considerar produtos curated/auto no worker de auto-match
	AutoMatchOnlyCurated bool `db:"auto_match_only_curated" json:"auto_match_only_curated"`
	// migration 0123 — última vez que RunAutoMatchWorker rodou (gocron 1 min)
	AutoMatchLastWorkerRunAt NullTime `db:"auto_match_last_worker_run_at" json:"auto_match_last_worker_run_at,omitempty"`

	// Automation mode — migration 0096
	FullAutoMode          bool   `db:"full_auto_mode" json:"full_auto_mode"`
	NotifyApprovalWebhook string `db:"notify_approval_webhook" json:"notify_approval_webhook"`
	AutoCurateLLM         bool   `db:"auto_curate_llm" json:"auto_curate_llm"`

	// LLM reasoning por provider — migration 0118 (antes: llm_reasoning_enabled único).
	// Default false: desliga chain-of-thought (deepseek-v4, gpt-5, r1).
	LLMReasoningOllama     bool `db:"llm_reasoning_ollama" json:"llm_reasoning_ollama"`
	LLMReasoningVllm       bool `db:"llm_reasoning_vllm" json:"llm_reasoning_vllm"`
	LLMReasoningOpenrouter bool `db:"llm_reasoning_openrouter" json:"llm_reasoning_openrouter"`

	// Opcional — quando definido, sobrescreve a temperatura indicada em cada prompt YAML (0–2).
	LLMTemperature NullFloat64 `db:"llm_temperature" json:"llm_temperature,omitempty"`
}

type AutoMatchLog struct {
	ID         int64     `db:"id" json:"id"`
	ProductID  int64     `db:"product_id" json:"product_id"`
	ChannelID  int64     `db:"channel_id" json:"channel_id"`
	DispatchID int64     `db:"dispatch_id" json:"dispatch_id"`
	Score      float64   `db:"score" json:"score"`
	CreatedAt  time.Time `db:"created_at" json:"created_at"`

	// Joinados para exibição
	ProductName string `db:"product_name" json:"product_name,omitempty"`
	ChannelName string `db:"channel_name" json:"channel_name,omitempty"`
	GroupNames  string `db:"group_names" json:"group_names,omitempty"` // CSV dos grupos que receberam o disparo

	// migration 0113 — breakdown e false positive tracking
	ScoreBreakdown        []byte         `db:"score_breakdown" json:"-"` // JSONB raw
	MatchReasons          pq.StringArray `db:"match_reasons" json:"match_reasons,omitempty"`
	FalsePositive         *bool          `db:"false_positive" json:"false_positive,omitempty"`
	FalsePositiveReason   string         `db:"false_positive_reason" json:"false_positive_reason,omitempty"`
	FalsePositiveMarkedAt NullTime       `db:"false_positive_marked_at" json:"false_positive_marked_at,omitempty"`
}

type WAAccount struct {
	ID          int64      `db:"id" json:"id"`
	Name        string     `db:"name" json:"name"`
	Provider    string     `db:"provider" json:"provider"`
	BaseURL     NullString `db:"base_url" json:"base_url,omitempty"`
	APIKey      NullString `db:"api_key" json:"api_key,omitempty"`
	Instance    NullString `db:"instance" json:"instance,omitempty"`
	GroupPrefix NullString `db:"group_prefix" json:"group_prefix,omitempty"`
	Status      string     `db:"status" json:"status"`
	Active      bool       `db:"active" json:"active"`
	Role        string     `db:"role" json:"role"`
	DailyLimit  int        `db:"daily_limit" json:"daily_limit"`
	SentToday   int        `db:"sent_today" json:"sent_today"`
	CreatedAt   time.Time  `db:"created_at" json:"created_at"`
}

type TGAccount struct {
	ID           int64      `db:"id" json:"id"`
	Name         string     `db:"name" json:"name"`
	BotToken     NullString `db:"bot_token" json:"bot_token,omitempty"`
	BotUsername  NullString `db:"bot_username" json:"bot_username,omitempty"`
	GroupPrefix  NullString `db:"group_prefix" json:"group_prefix,omitempty"`
	LastUpdateID NullInt64  `db:"last_update_id" json:"last_update_id,omitempty"`
	Active       bool       `db:"active" json:"active"`
	Role         string     `db:"role" json:"role"`
	DailyLimit   int        `db:"daily_limit" json:"daily_limit"`
	SentToday    int        `db:"sent_today" json:"sent_today"`
	CreatedAt    time.Time  `db:"created_at" json:"created_at"`
}

type SearchTerm struct {
	ID            int64     `db:"id" json:"id"`
	Query         string    `db:"query" json:"query"`
	Queries       string    `db:"queries" json:"queries"`
	MinVal        float64   `db:"min_val" json:"min_val"`
	MaxVal        float64   `db:"max_val" json:"max_val"`
	Sources       string    `db:"sources" json:"sources"`
	Category      string    `db:"category" json:"category"`
	Active        bool      `db:"active" json:"active"`
	CrawlInterval int       `db:"crawl_interval" json:"crawl_interval"`
	LastCrawledAt NullTime  `db:"last_crawled_at" json:"last_crawled_at,omitempty"`
	ResultCount   int       `db:"result_count" json:"result_count"`
	CreatedAt     time.Time `db:"created_at" json:"created_at"`
}

func (s *SearchTerm) GetQueries() []string {
	var extra []string
	_ = json.Unmarshal([]byte(s.Queries), &extra)
	seen := map[string]bool{s.Query: true}
	out := []string{s.Query}
	for _, q := range extra {
		if q != "" && !seen[q] {
			seen[q] = true
			out = append(out, q)
		}
	}
	return out
}

// srcAlias normaliza nomes longos pra IDs curtos do registry de scrapers.
var srcAlias = map[string]string{
	"amazon": "amz", "mercadolivre": "ml", "mercado livre": "ml",
	"magalu": "magalu", "shopee": "shopee", "aliexpress": "aliexpress",
	"casasbahia": "casasbahia", "casas bahia": "casasbahia",
	"kabum": "kabum", "americanas": "americanas",
}

func normSource(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	if a, ok := srcAlias[s]; ok {
		return a
	}
	return s
}

// GetSources returns the list of source IDs for this search term.
// Handles JSON array, comma-separated, legacy strings and long names (amazon→amz, etc.)
func (s *SearchTerm) GetSources() []string {
	if s.Sources == "" || s.Sources == "all" {
		return []string{"ml", "amz"}
	}
	var raw []string
	if err := json.Unmarshal([]byte(s.Sources), &raw); err != nil {
		// comma-separated fallback
		for _, p := range strings.Split(s.Sources, ",") {
			if p = strings.TrimSpace(p); p != "" {
				raw = append(raw, p)
			}
		}
	}
	seen := map[string]bool{}
	out := []string{}
	for _, v := range raw {
		id := normSource(v)
		if id != "" && !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	if len(out) == 0 {
		return []string{"ml", "amz"}
	}
	return out
}

type CrawlResult struct {
	ID               int64      `db:"id" json:"id"`
	SearchTermID     int64      `db:"search_term_id" json:"search_term_id"`
	Title            string     `db:"title" json:"title"`
	Price            float64    `db:"price" json:"price"`
	URL              string     `db:"url" json:"url"`
	ImageURL         NullString `db:"image_url" json:"image_url,omitempty"`
	Source           string     `db:"source" json:"source"`
	SourceSubID      NullString `db:"source_subid" json:"source_subid,omitempty"`
	CrawledAt        time.Time  `db:"crawled_at" json:"crawled_at"`
	CatalogVariantID NullInt64  `db:"catalog_variant_id" json:"catalog_variant_id,omitempty"`
	// Metadata (migration 0105): JSON livre — description, rating, reviews_count, seller, free_shipping, installments, etc.
	Metadata []byte `db:"metadata" json:"-"`
}

// CrawlMetadata é a estrutura recomendada pra Metadata. Os scrapers preenchem só
// os campos que conseguem extrair — todo o resto é opcional.
type CrawlMetadata struct {
	Description   string  `json:"description,omitempty"`
	Rating        float64 `json:"rating,omitempty"` // 0..5
	ReviewsCount  int     `json:"reviews_count,omitempty"`
	Seller        string  `json:"seller,omitempty"` // "Loja Oficial Samsung"
	OfficialStore bool    `json:"official_store,omitempty"`
	FreeShipping  bool    `json:"free_shipping,omitempty"`
	Installments  string  `json:"installments,omitempty"`   // "12x R$ 50 sem juros"
	OriginalPrice float64 `json:"original_price,omitempty"` // pra calcular % de desconto
}

type CatalogProduct struct {
	ID                int64       `db:"id" json:"id"`
	CanonicalName     string      `db:"canonical_name" json:"canonical_name"`
	Brand             NullString  `db:"brand" json:"brand,omitempty"`
	Weight            NullString  `db:"weight" json:"weight,omitempty"`
	ImageURL          NullString  `db:"image_url" json:"image_url,omitempty"`
	LowestPrice       NullFloat64 `db:"lowest_price" json:"lowest_price,omitempty"`
	LowestPriceURL    NullString  `db:"lowest_price_url" json:"lowest_price_url,omitempty"`
	LowestPriceSource NullString  `db:"lowest_price_source" json:"lowest_price_source,omitempty"`
	Tags              string      `db:"tags" json:"tags"`
	CreatedAt         time.Time   `db:"created_at" json:"created_at"`
	UpdatedAt         time.Time   `db:"updated_at" json:"updated_at"`
	// migration 0084
	CurationStatus string `db:"curation_status" json:"curation_status"`
	// migration 0091 — purge 404/3-strikes
	ConsecutiveFailures int  `db:"consecutive_failures" json:"consecutive_failures"`
	Inactive            bool `db:"inactive" json:"inactive"`
	// migration 0095 — tamanho/quantidade para dedup e agrupamento
	Quantity string `db:"quantity" json:"quantity"`
	// migration 0102 — auditoria por LLM
	Inspected       bool       `db:"inspected" json:"inspected"`
	InspectedAt     NullTime   `db:"inspected_at" json:"inspected_at,omitempty"`
	InspectionNotes NullString `db:"inspection_notes" json:"inspection_notes,omitempty"`
	// migration 0112 — atributos estruturados (cor, tamanho, voltagem, etc)
	Attributes []byte `db:"attributes" json:"-"` // JSONB raw
}

func (p *CatalogProduct) GetTags() []string {
	var tags []string
	_ = json.Unmarshal([]byte(p.Tags), &tags)
	return tags
}

// MarshalJSON serializa Tags como []string (em vez de string JSON) para a resposta HTTP.
func (p CatalogProduct) MarshalJSON() ([]byte, error) {
	type shadow struct {
		ID                  int64           `json:"id"`
		CanonicalName       string          `json:"canonical_name"`
		Brand               NullString      `json:"brand,omitempty"`
		Weight              NullString      `json:"weight,omitempty"`
		ImageURL            NullString      `json:"image_url,omitempty"`
		LowestPrice         NullFloat64     `json:"lowest_price,omitempty"`
		LowestPriceURL      NullString      `json:"lowest_price_url,omitempty"`
		LowestPriceSource   NullString      `json:"lowest_price_source,omitempty"`
		Tags                []string        `json:"tags"`
		CreatedAt           time.Time       `json:"created_at"`
		UpdatedAt           time.Time       `json:"updated_at"`
		CurationStatus      string          `json:"curation_status"`
		ConsecutiveFailures int             `json:"consecutive_failures"`
		Inactive            bool            `json:"inactive"`
		Quantity            string          `json:"quantity"`
		Inspected           bool            `json:"inspected"`
		InspectedAt         NullTime        `json:"inspected_at,omitempty"`
		InspectionNotes     NullString      `json:"inspection_notes,omitempty"`
		Attributes          json.RawMessage `json:"attributes,omitempty"`
	}
	return json.Marshal(shadow{
		ID: p.ID, CanonicalName: p.CanonicalName, Brand: p.Brand,
		Weight: p.Weight, ImageURL: p.ImageURL, LowestPrice: p.LowestPrice,
		LowestPriceURL: p.LowestPriceURL, LowestPriceSource: p.LowestPriceSource,
		Tags: p.GetTags(), CreatedAt: p.CreatedAt, UpdatedAt: p.UpdatedAt,
		CurationStatus: p.CurationStatus, ConsecutiveFailures: p.ConsecutiveFailures,
		Inactive: p.Inactive, Quantity: p.Quantity,
		Inspected: p.Inspected, InspectedAt: p.InspectedAt, InspectionNotes: p.InspectionNotes,
		Attributes: json.RawMessage(p.Attributes),
	})
}

func (p *CatalogProduct) SetTags(tags []string) {
	b, _ := json.Marshal(tags)
	p.Tags = string(b)
}

func (p *CatalogProduct) AddTag(tag string) {
	tags := p.GetTags()
	for _, t := range tags {
		if t == tag {
			return
		}
	}
	p.SetTags(append(tags, tag))
}

type CatalogVariant struct {
	ID               int64      `db:"id" json:"id"`
	CatalogProductID int64      `db:"catalog_product_id" json:"catalog_product_id"`
	Title            string     `db:"title" json:"title"`
	VariantLabel     NullString `db:"variant_label" json:"variant_label,omitempty"`
	Price            float64    `db:"price" json:"price"`
	URL              string     `db:"url" json:"url"`
	ShortID          NullString `db:"short_id" json:"short_id,omitempty"`
	ImageURL         NullString `db:"image_url" json:"image_url,omitempty"`
	Source           string     `db:"source" json:"source"`
	FirstSeenAt      time.Time  `db:"first_seen_at" json:"first_seen_at"`
	LastSeenAt       time.Time  `db:"last_seen_at" json:"last_seen_at"`
	// Match metadata (migration 0104) — confidence do merge no momento da criação.
	MatchConfidence NullFloat64 `db:"match_confidence" json:"match_confidence,omitempty"`
	MatchMethod     NullString  `db:"match_method" json:"match_method,omitempty"`
	// Metadata enriquecido (migration 0105) — descrição, rating, vendedor, frete, etc.
	Metadata []byte `db:"metadata" json:"-"`
}

type PriceHistoryV2 struct {
	ID         int64     `db:"id" json:"id"`
	VariantID  int64     `db:"variant_id" json:"variant_id"`
	Price      float64   `db:"price" json:"price"`
	RecordedAt time.Time `db:"recorded_at" json:"recorded_at"`
}

type VariantStats struct {
	P25     float64  `json:"p25"`
	P50     float64  `json:"p50"`
	P75     float64  `json:"p75"`
	Mean    float64  `json:"mean"`
	Current float64  `json:"current"`
	Score   *float64 `json:"score"` // null if insufficient data or no variance
	Count   int      `json:"count"`
	Window  string   `json:"window"`
	Reason  *string  `json:"reason,omitempty"` // reason score is null (e.g., "insufficient_data", "no_variance")
}

type GroupingKeyword struct {
	ID      int64  `db:"id" json:"id"`
	Keyword string `db:"keyword" json:"keyword"`
	Tag     string `db:"tag" json:"tag"`
	Active  bool   `db:"active" json:"active"`
}

// Audience define o perfil de audiência de um canal.
type Audience struct {
	Categories []string `json:"categories"`
	Brands     []string `json:"brands"`
	AgeRange   [2]int   `json:"age_range"`
	Gender     string   `json:"gender"` // "m"|"f"|"mix"
	MinDrop    float64  `json:"min_drop"`
	MinPrice   float64  `json:"min_price"`
	MaxPrice   float64  `json:"max_price"`
	Locales    []string `json:"locales"`
	// Weights — pontuação configurável por canal. Soma deve ficar próxima de 1.0.
	// Se todos forem 0, usa defaults (Category 0.30, Brand 0.20, Drop 0.20, Price 0.15, History 0.15).
	Weights AudienceWeights `json:"weights"`
	// migration 0112 — taxonomy IDs para filtros estruturados
	IncludeCategoryIDs    []int64            `json:"include_category_ids,omitempty"`
	ExcludeCategoryIDs    []int64            `json:"exclude_category_ids,omitempty"`
	IncludeSubcategoryIDs []int64            `json:"include_subcategory_ids,omitempty"`
	IncludeBrandIDs       []int64            `json:"include_brand_ids,omitempty"`
	ExcludeBrandIDs       []int64            `json:"exclude_brand_ids,omitempty"`
	RequiredAttributes    map[string][]int64 `json:"required_attributes,omitempty"` // chaves: "color","size","voltage","capacity"
	PreferredAttributes   map[string][]int64 `json:"preferred_attributes,omitempty"`
}

type AudienceWeights struct {
	Category float64 `json:"category"`
	Brand    float64 `json:"brand"`
	Drop     float64 `json:"drop"`
	Price    float64 `json:"price"`
	History  float64 `json:"history"`
}

type Channel struct {
	ID              int64      `db:"id" json:"id"`
	Name            string     `db:"name" json:"name"`
	Description     string     `db:"description" json:"description"`
	Slug            NullString `db:"slug" json:"slug,omitempty"`
	MessageTemplate NullString `db:"message_template" json:"message_template,omitempty"`
	SendStartHour   int        `db:"send_start_hour" json:"send_start_hour"`
	SendEndHour     int        `db:"send_end_hour" json:"send_end_hour"`
	DigestMode      bool       `db:"digest_mode" json:"digest_mode"`
	DigestMaxItems  int        `db:"digest_max_items" json:"digest_max_items"`
	Active          bool       `db:"active" json:"active"`
	CreatedAt       time.Time  `db:"created_at" json:"created_at"`
	// Audience fields (migration 0050)
	Audience    Audience `db:"-" json:"audience"`
	AudienceRaw []byte   `db:"audience" json:"-"` // JSONB raw para sqlx
	MemberCount int64    `db:"member_count" json:"member_count"`
	CTR30d      float64  `db:"ctr_30d" json:"ctr_30d"`
	CVR30d      float64  `db:"cvr_30d" json:"cvr_30d"`
	Revenue30d  float64  `db:"revenue_30d" json:"revenue_30d"`
}

// UnmarshalAudience desserializa AudienceRaw para Audience.
func (c *Channel) UnmarshalAudience() error {
	if len(c.AudienceRaw) == 0 {
		return nil
	}
	return json.Unmarshal(c.AudienceRaw, &c.Audience)
}

// MarshalAudience serializa Audience para AudienceRaw.
func (c *Channel) MarshalAudience() error {
	b, err := json.Marshal(c.Audience)
	if err != nil {
		return err
	}
	c.AudienceRaw = b
	return nil
}

type ChannelTarget struct {
	ID        int64      `db:"id" json:"id"`
	ChannelID int64      `db:"channel_id" json:"channel_id"`
	Provider  string     `db:"provider" json:"provider"`
	ChatID    string     `db:"chat_id" json:"chat_id"`
	Name      NullString `db:"name" json:"name,omitempty"`
	InviteURL NullString `db:"invite_url" json:"invite_url,omitempty"`
	Status    string     `db:"status" json:"status"`
}

type ChannelTargetAccount struct {
	ID        int64     `db:"id" json:"id"`
	TargetID  int64     `db:"target_id" json:"target_id"`
	AccountID int64     `db:"account_id" json:"account_id"`
	Role      string    `db:"role" json:"role"` // 'primary' or 'fallback'
	Priority  int       `db:"priority" json:"priority"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
}

type ChannelRule struct {
	ID            int64       `db:"id" json:"id"`
	ChannelID     int64       `db:"channel_id" json:"channel_id"`
	MatchType     string      `db:"match_type" json:"match_type"`
	MatchValue    NullString  `db:"match_value" json:"match_value,omitempty"`
	MaxPrice      NullFloat64 `db:"max_price" json:"max_price,omitempty"`
	NotifyNew     bool        `db:"notify_new" json:"notify_new"`
	NotifyDrop    bool        `db:"notify_drop" json:"notify_drop"`
	NotifyLowest  bool        `db:"notify_lowest" json:"notify_lowest"`
	DropThreshold float64     `db:"drop_threshold" json:"drop_threshold"`
	Active        bool        `db:"active" json:"active"`
}

type ChannelAutomation struct {
	ID        int64 `db:"id" json:"id"`
	ChannelID int64 `db:"channel_id" json:"channel_id"`
	Enabled   bool  `db:"enabled" json:"enabled"`

	AutoMatchEnabled bool        `db:"auto_match_enabled" json:"auto_match_enabled"`
	Threshold        NullFloat64 `db:"threshold" json:"threshold,omitempty"`
	MaxPerRun        NullInt64   `db:"max_per_run" json:"max_per_run,omitempty"`
	CooldownHours    int         `db:"cooldown_hours" json:"cooldown_hours"`

	EventsEnabled bool    `db:"events_enabled" json:"events_enabled"`
	NotifyNew     bool    `db:"notify_new" json:"notify_new"`
	NotifyDrop    bool    `db:"notify_drop" json:"notify_drop"`
	NotifyLowest  bool    `db:"notify_lowest" json:"notify_lowest"`
	DropThreshold float64 `db:"drop_threshold" json:"drop_threshold"`

	MatchType  string      `db:"match_type" json:"match_type"`
	MatchValue NullString  `db:"match_value" json:"match_value,omitempty"`
	MaxPrice   NullFloat64 `db:"max_price" json:"max_price,omitempty"`

	PausedUntil NullTime  `db:"paused_until" json:"paused_until,omitempty"`
	CreatedAt   time.Time `db:"created_at" json:"created_at"`
	UpdatedAt   time.Time `db:"updated_at" json:"updated_at"`

	// Joinado para listagem
	ChannelName string `db:"channel_name" json:"channel_name,omitempty"`
}

type SentMessageV2 struct {
	ID               int64     `db:"id" json:"id"`
	CatalogProductID int64     `db:"catalog_product_id" json:"catalog_product_id"`
	ChannelTargetID  int64     `db:"channel_target_id" json:"channel_target_id"`
	IsDrop           bool      `db:"is_drop" json:"is_drop"`
	SentAt           time.Time `db:"sent_at" json:"sent_at"`
}

type CrawlLog struct {
	ID           int64      `db:"id" json:"id"`
	SearchTermID int64      `db:"search_term_id" json:"search_term_id"`
	StartedAt    time.Time  `db:"started_at" json:"started_at"`
	FinishedAt   NullTime   `db:"finished_at" json:"finished_at,omitempty"`
	Status       string     `db:"status" json:"status"`
	MLCount      int        `db:"ml_count" json:"ml_count"`
	AmzCount     int        `db:"amz_count" json:"amz_count"`
	SourceCounts NullString `db:"source_counts" json:"source_counts,omitempty"`
	ErrorMsg     NullString `db:"error_msg" json:"error_msg,omitempty"`
}

// GetSourceCounts parses the SourceCounts JSON and returns a map of source ID -> count.
// Falls back to legacy ml_count/amz_count if SourceCounts is not set.
func (cl *CrawlLog) GetSourceCounts() map[string]int {
	result := make(map[string]int)

	// Try to parse SourceCounts JSON if available
	if cl.SourceCounts.Valid && cl.SourceCounts.String != "" {
		var counts map[string]int
		if err := json.Unmarshal([]byte(cl.SourceCounts.String), &counts); err == nil {
			return counts
		}
	}

	// Fallback to legacy columns
	if cl.MLCount > 0 {
		result["ml"] = cl.MLCount
	}
	if cl.AmzCount > 0 {
		result["amz"] = cl.AmzCount
	}

	return result
}

// SetSourceCounts serializes a map of source ID -> count into JSON format.
func (cl *CrawlLog) SetSourceCounts(counts map[string]int) error {
	data, err := json.Marshal(counts)
	if err != nil {
		return err
	}
	cl.SourceCounts = NullString{
		NullString: sql.NullString{
			String: string(data),
			Valid:  true,
		},
	}
	return nil
}

type BroadcastMessage struct {
	ID         int64      `db:"id" json:"id"`
	Text       string     `db:"text" json:"text"`
	ImageURL   NullString `db:"image_url" json:"image_url,omitempty"`
	ChannelIDs string     `db:"channel_ids" json:"channel_ids"`
	Status     string     `db:"status" json:"status"`
	SentCount  int        `db:"sent_count" json:"sent_count"`
	SentAt     NullTime   `db:"sent_at" json:"sent_at,omitempty"`
	ErrorMsg   NullString `db:"error_msg" json:"error_msg,omitempty"`
	CreatedAt  time.Time  `db:"created_at" json:"created_at"`
}

// RedesignGroup é o destino físico (WA/TG) do ReDesign — tabela groups.
// Não confundir com Group legado (tabela "group").
type RedesignGroup struct {
	ID            int64      `db:"id" json:"id"`
	ShortID       string     `db:"short_id" json:"short_id"`
	ChannelID     NullInt64  `db:"channel_id" json:"channel_id"`
	WAAccountID   NullInt64  `db:"wa_account_id" json:"wa_account_id,omitempty"`
	TGAccountID   NullInt64  `db:"tg_account_id" json:"tg_account_id,omitempty"`
	Name          string     `db:"name" json:"name"`
	Platform      string     `db:"platform" json:"platform"` // whatsapp|telegram
	JID           NullString `db:"jid" json:"jid,omitempty"`
	InviteLink    NullString `db:"invite_link" json:"invite_link,omitempty"`
	Status        string     `db:"status" json:"status"` // active|paused|banned|full
	MemberCount   int64      `db:"member_count" json:"member_count"`
	Overrides     []byte     `db:"overrides" json:"-"`
	CreatedAt     time.Time  `db:"created_at" json:"created_at"`
	LastMessageAt NullTime   `db:"last_message_at" json:"last_message_at,omitempty"`
	// migration 0083
	Archived    bool       `db:"archived" json:"archived"`
	LastError   NullString `db:"last_error" json:"last_error,omitempty"`
	LastErrorAt NullTime   `db:"last_error_at" json:"last_error_at,omitempty"`
}

// GroupAdmin representa um administrador de um grupo (tabela group_admins).
type GroupAdmin struct {
	ID          int64     `db:"id" json:"id"`
	GroupID     int64     `db:"group_id" json:"group_id"`
	AccountType string    `db:"account_type" json:"account_type"` // wa|tg
	AccountID   int64     `db:"account_id" json:"account_id"`
	AddedAt     time.Time `db:"added_at" json:"added_at"`
}

// AffiliateProgram é o programa de afiliado do ReDesign (tabela affiliate_programs).
type AffiliateProgram struct {
	ID          int64     `db:"id" json:"id"`
	ShortID     string    `db:"short_id" json:"short_id"`
	Name        string    `db:"name" json:"name"`
	Marketplace string    `db:"marketplace" json:"marketplace"`
	Credentials []byte    `db:"credentials" json:"-"` // JSONB, nunca expor raw
	Active      bool      `db:"active" json:"active"`
	Rules       []byte    `db:"rules" json:"rules"`
	Postback    []byte    `db:"postback" json:"postback"`
	CreatedAt   time.Time `db:"created_at" json:"created_at"`
}

// Dispatch representa um disparo de mensagem para múltiplos grupos.
type Dispatch struct {
	ID            int64     `db:"id" json:"id"`
	ShortID       string    `db:"short_id" json:"short_id"`
	ProductID     NullInt64 `db:"product_id" json:"product_id,omitempty"`
	ComposedBy    string    `db:"composed_by" json:"composed_by"`
	Message       []byte    `db:"message" json:"message"`
	AffiliateLink string    `db:"affiliate_link" json:"affiliate_link"`
	ScheduledFor  NullTime  `db:"scheduled_for" json:"scheduled_for,omitempty"`
	CreatedBy     NullInt64 `db:"created_by" json:"created_by,omitempty"`
	Status        string    `db:"status" json:"status"`
	CreatedAt     time.Time `db:"created_at" json:"created_at"`
}

// DispatchTarget representa um destino individual de um disparo.
type DispatchTarget struct {
	ID          int64      `db:"id" json:"id"`
	DispatchID  int64      `db:"dispatch_id" json:"dispatch_id"`
	GroupID     int64      `db:"group_id" json:"group_id"`
	WAAccountID NullInt64  `db:"wa_account_id" json:"wa_account_id,omitempty"`
	TGAccountID NullInt64  `db:"tg_account_id" json:"tg_account_id,omitempty"`
	Status      string     `db:"status" json:"status"`
	AttemptedAt NullTime   `db:"attempted_at" json:"attempted_at,omitempty"`
	DeliveredAt NullTime   `db:"delivered_at" json:"delivered_at,omitempty"`
	ErrorReason NullString `db:"error_reason" json:"error_reason,omitempty"`
	ClickCount  int        `db:"click_count" json:"click_count"`
	Conversions int        `db:"conversions" json:"conversions"`
	Revenue     float64    `db:"revenue" json:"revenue"`
}

// PublicLink é uma URL estável com fallback automático entre grupos.
type PublicLink struct {
	ID               int64     `db:"id" json:"id"`
	Slug             string    `db:"slug" json:"slug"`
	ChannelID        int64     `db:"channel_id" json:"channel_id"`
	FallbackChain    []byte    `db:"fallback_chain" json:"-"` // raw JSONB do DB; exposto via MarshalJSON
	RedirectStrategy string    `db:"redirect_strategy" json:"redirect_strategy"`
	RoundRobinIdx    int       `db:"round_robin_idx" json:"-"`
	Active           bool      `db:"active" json:"active"`
	Clicks30d        int       `db:"clicks_30d" json:"clicks_30d"`
	CreatedAt        time.Time `db:"created_at" json:"created_at"`
}

// MarshalJSON serializa FallbackChain como array de objetos em vez de bytes (base64).
func (l PublicLink) MarshalJSON() ([]byte, error) {
	var chain []map[string]any
	if len(l.FallbackChain) > 0 {
		_ = json.Unmarshal(l.FallbackChain, &chain)
	}
	if chain == nil {
		chain = []map[string]any{}
	}
	type alias PublicLink
	return json.Marshal(&struct {
		alias
		FallbackChain []map[string]any `json:"fallback_chain"`
	}{
		alias:         alias(l),
		FallbackChain: chain,
	})
}

// Cluster é um agrupamento analítico de canais.
type Cluster struct {
	ID             int64     `db:"id" json:"id"`
	Label          string    `db:"label" json:"label"`
	Description    string    `db:"description" json:"description"`
	MemberChannels []byte    `db:"member_channels" json:"member_channels"`
	Metrics        []byte    `db:"metrics" json:"metrics"`
	TopCategories  []byte    `db:"top_categories" json:"top_categories"`
	TopBrands      []byte    `db:"top_brands" json:"top_brands"`
	ComputedAt     time.Time `db:"computed_at" json:"computed_at"`
}

// GroupSpy é um grupo concorrente sendo espionado.
type GroupSpy struct {
	ID            int64      `db:"id"              json:"id"`
	ShortID       string     `db:"short_id"        json:"short_id"`
	GroupName     string     `db:"group_name"      json:"group_name"`
	Platform      string     `db:"platform"        json:"platform"` // whatsapp|telegram
	InviteLink    string     `db:"invite_link"     json:"invite_link"`
	ReaderWAID    NullInt64  `db:"reader_wa_id"    json:"reader_wa_id,omitempty"`
	ReaderTGID    NullInt64  `db:"reader_tg_id"    json:"reader_tg_id,omitempty"`
	RemoteGroupID NullString `db:"remote_group_id" json:"remote_group_id,omitempty"`
	Active        bool       `db:"active"          json:"active"`
	JoinedAt      time.Time  `db:"joined_at"       json:"joined_at"`
	Stats         []byte     `db:"stats"           json:"stats"`
	DeletedAt     NullTime   `db:"deleted_at"      json:"-"`
}

type SpyMessage struct {
	ID          int64      `db:"id"           json:"id"`
	SpyID       int64      `db:"spy_id"        json:"spy_id"`
	Sender      string     `db:"sender"        json:"sender"`
	Text        string     `db:"text"          json:"text"`
	MediaURL    NullString `db:"media_url"     json:"media_url,omitempty"`
	CollectedAt time.Time  `db:"collected_at"  json:"collected_at"`
}

type TelegramChat struct {
	ChatID          string     `db:"chat_id" json:"chat_id"`
	Type            string     `db:"type" json:"type"`
	Title           string     `db:"title" json:"title"`
	Username        NullString `db:"username" json:"username,omitempty"`
	MemberCount     NullInt64  `db:"member_count" json:"member_count,omitempty"`
	IsAdmin         bool       `db:"is_admin" json:"is_admin"`
	DiscoveredAt    time.Time  `db:"discovered_at" json:"discovered_at"`
	LastSeenAt      time.Time  `db:"last_seen_at" json:"last_seen_at"`
	LinkedGroupID   NullInt64  `db:"linked_group_id" json:"linked_group_id,omitempty"`
	LinkedChannelID NullInt64  `db:"linked_channel_id" json:"linked_channel_id,omitempty"`
}

// ChannelHistoryEntry representa um disparo associado a um grupo de um canal.
type ChannelHistoryEntry struct {
	DispatchID  int64       `db:"dispatch_id"  json:"dispatch_id"`
	GroupID     int64       `db:"group_id"     json:"group_id"`
	GroupName   string      `db:"group_name"   json:"group_name"`
	Status      string      `db:"status"       json:"status"`
	DeliveredAt NullTime    `db:"delivered_at" json:"delivered_at,omitempty"`
	MessageText string      `db:"message_text" json:"message_text"`
	CreatedAt   time.Time   `db:"created_at"   json:"created_at"`
	Score       NullFloat64 `db:"score"      json:"score,omitempty"`
}

// AffiliateConversion representa uma conversão de afiliado (tabela affiliate_conversions).
type AffiliateConversion struct {
	ID              int64       `db:"id" json:"id"`
	ProgramID       int64       `db:"program_id" json:"program_id"`
	ClickID         NullInt64   `db:"click_id" json:"click_id,omitempty"`
	ExternalOrderID NullString  `db:"external_order_id" json:"external_order_id,omitempty"`
	Revenue         NullFloat64 `db:"revenue" json:"revenue,omitempty"`
	Status          string      `db:"status" json:"status"`
	CreatedAt       time.Time   `db:"created_at" json:"created_at"`
}

// Taxonomy é categoria ou marca de produto, usada para autocomplete em audience
// e para detecção pelo crawler/categorizador.
type Taxonomy struct {
	ID             int64          `db:"id" json:"id"`
	Type           string         `db:"type" json:"type"` // 'category' | 'brand'
	Name           string         `db:"name" json:"name"`
	Slug           string         `db:"slug" json:"slug"`
	Keywords       pq.StringArray `db:"keywords" json:"keywords"`
	ParentID       NullInt64      `db:"parent_id" json:"parent_id,omitempty"`
	DetectCount    int            `db:"detect_count" json:"detect_count"`
	LastDetectedAt NullTime       `db:"last_detected_at" json:"last_detected_at,omitempty"`
	Active         bool           `db:"active" json:"active"`
	Status         string         `db:"status" json:"status"` // 'approved' | 'pending' | 'rejected'
	Source         string         `db:"source" json:"source"` // 'manual' | 'crawler' | 'llm'
	SampleText     NullString     `db:"sample_text" json:"sample_text,omitempty"`
	CreatedAt      time.Time      `db:"created_at" json:"created_at"`
}

// JonfreyAction é uma ação tomada pelo assistente Jonfrey, com auditoria
// completa (estado antes/depois, reasoning).
type JonfreyAction struct {
	ID             int64      `db:"id" json:"id"`
	ActionType     string     `db:"action_type" json:"action_type"`
	Target         NullString `db:"target" json:"target,omitempty"`
	Status         string     `db:"status" json:"status"` // pending|running|success|failed|skipped
	Reasoning      NullString `db:"reasoning" json:"reasoning,omitempty"`
	BeforeSnapshot []byte     `db:"before_snapshot" json:"-"`
	AfterSnapshot  []byte     `db:"after_snapshot" json:"-"`
	ErrorMessage   NullString `db:"error_message" json:"error_message,omitempty"`
	TriggeredBy    string     `db:"triggered_by" json:"triggered_by"` // manual|auto|scheduled
	CreatedAt      time.Time  `db:"created_at" json:"created_at"`
	FinishedAt     NullTime   `db:"finished_at" json:"finished_at,omitempty"`
}

// MarshalJSON expõe before/after como objeto JSON (não base64).
func (a JonfreyAction) MarshalJSON() ([]byte, error) {
	var before, after map[string]any
	if len(a.BeforeSnapshot) > 0 {
		_ = json.Unmarshal(a.BeforeSnapshot, &before)
	}
	if len(a.AfterSnapshot) > 0 {
		_ = json.Unmarshal(a.AfterSnapshot, &after)
	}
	if before == nil {
		before = map[string]any{}
	}
	if after == nil {
		after = map[string]any{}
	}
	type alias JonfreyAction
	return json.Marshal(&struct {
		alias
		Before map[string]any `json:"before"`
		After  map[string]any `json:"after"`
	}{alias: alias(a), Before: before, After: after})
}

// JonfreyLastRunSummary é a última execução concluída por action_type (para UI /available).
type JonfreyLastRunSummary struct {
	FinishedAt time.Time `json:"finished_at"`
	Status     string    `json:"status"` // success | failed | skipped
}

// JonfreyConfig é a configuração singleton do assistente.
type JonfreyConfig struct {
	ID              int            `db:"id" json:"id"`
	Enabled         bool           `db:"enabled" json:"enabled"`
	IntervalMinutes int            `db:"interval_minutes" json:"interval_minutes"`
	EnabledActions  pq.StringArray `db:"enabled_actions" json:"enabled_actions"`
	LastRunAt       NullTime       `db:"last_run_at" json:"last_run_at,omitempty"`
	UpdatedAt       time.Time      `db:"updated_at" json:"updated_at"`
}

// Ad é um anúncio recorrente customizado (texto+imagem) PAGO por um cliente,
// que dispara num schedule até atingir active_until. Diferente de Dispatch (one-shot).
type Ad struct {
	ID               int64         `db:"id" json:"id"`
	Name             string        `db:"name" json:"name"`
	MessageText      string        `db:"message_text" json:"message_text"`
	ImageURL         NullString    `db:"image_url" json:"image_url,omitempty"`
	ChannelIDs       pq.Int64Array `db:"channel_ids" json:"channel_ids"`
	GroupIDs         pq.Int64Array `db:"group_ids" json:"group_ids"`
	ScheduleCron     string        `db:"schedule_cron" json:"schedule_cron"`
	ActiveUntil      NullTime      `db:"active_until" json:"active_until,omitempty"`
	Enabled          bool          `db:"enabled" json:"enabled"`
	LastDispatchedAt NullTime      `db:"last_dispatched_at" json:"last_dispatched_at,omitempty"`
	DispatchCount    int           `db:"dispatch_count" json:"dispatch_count"`
	CreatedAt        time.Time     `db:"created_at" json:"created_at"`
	UpdatedAt        time.Time     `db:"updated_at" json:"updated_at"`
	// Billing & tracking (migration 0107)
	ClientName string     `db:"client_name" json:"client_name"`
	PaidAmount float64    `db:"paid_amount" json:"paid_amount"`
	ShortID    NullString `db:"short_id" json:"short_id,omitempty"`
	ClickCount int        `db:"click_count" json:"click_count"`
	TargetURL  string     `db:"target_url" json:"target_url"`
}

// AdActive retorna true se o anúncio está dentro da janela de ativação.
func (a Ad) IsActiveNow() bool {
	if !a.Enabled {
		return false
	}
	if a.ActiveUntil.Valid && a.ActiveUntil.Time.Before(time.Now()) {
		return false
	}
	return true
}

// migration 0112 — TaxonomyPattern: padrões de matching para detection/enrichment
type TaxonomyPattern struct {
	ID         int64     `db:"id" json:"id"`
	TaxonomyID int64     `db:"taxonomy_id" json:"taxonomy_id"`
	Kind       string    `db:"kind" json:"kind"` // exact_keyword, contains_keyword, word_boundary, regex, exclude_regex, exclude_keyword
	Value      string    `db:"value" json:"value"`
	Weight     float64   `db:"weight" json:"weight"`
	Locale     string    `db:"locale" json:"locale"`
	Source     string    `db:"source" json:"source"` // seed, manual, llm, crawler
	Active     bool      `db:"active" json:"active"`
	CreatedAt  time.Time `db:"created_at" json:"created_at"`
	UpdatedAt  time.Time `db:"updated_at" json:"updated_at"`
}

// migration 0112 — CatalogProductTaxonomy: linking products to taxonomies com roles
type CatalogProductTaxonomy struct {
	ProductID  int64     `db:"product_id" json:"product_id"`
	TaxonomyID int64     `db:"taxonomy_id" json:"taxonomy_id"`
	Role       string    `db:"role" json:"role"` // primary_category, subcategory, brand, attribute_color, attribute_size, attribute_voltage, attribute_capacity, attribute_other
	Confidence float64   `db:"confidence" json:"confidence"`
	Source     string    `db:"source" json:"source"` // pipeline, manual, llm
	CreatedAt  time.Time `db:"created_at" json:"created_at"`
}
