package models

import (
	"database/sql"
	"encoding/json"
	"time"
)

// Source represents a marketplace data source (e.g., Mercado Livre, Amazon).
type Source struct {
	ID         string      `db:"id" json:"id"`
	Name       string      `db:"name" json:"name"`
	Category   string      `db:"category" json:"category"`
	Enabled    bool        `db:"enabled" json:"enabled"`
	ConfigJSON NullString  `db:"config_json" json:"config_json,omitempty"`
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
	ID              int64          `db:"id" json:"id"`
	Name            string         `db:"name" json:"name"`
	Description     string         `db:"description" json:"description"`
	SearchPrompt    string         `db:"search_prompt" json:"search_prompt"`
	MinVal          float64        `db:"min_val" json:"min_val"`
	MaxVal          float64        `db:"max_val" json:"max_val"`
	WhatsappGroupID NullString `db:"whatsapp_group_id" json:"whatsapp_group_id,omitempty"`
	WAGroupStatus   NullString `db:"wa_group_status" json:"wa_group_status,omitempty"`
	TelegramChatID  NullString `db:"telegram_chat_id" json:"telegram_chat_id,omitempty"`
	TGGroupStatus   NullString `db:"tg_group_status" json:"tg_group_status,omitempty"`
	MessageTemplate NullString `db:"message_template" json:"message_template,omitempty"`
	Active          bool           `db:"active" json:"active"`
	ScanInterval    int            `db:"scan_interval" json:"scan_interval"`
	CreatedAt       time.Time      `db:"created_at" json:"created_at"`
	UpdatedAt       time.Time      `db:"updated_at" json:"updated_at"`
}

type Product struct {
	ID        int64          `db:"id" json:"id"`
	GroupID   int64          `db:"group_id" json:"group_id"`
	Title     string         `db:"title" json:"title"`
	Price     float64        `db:"price" json:"price"`
	URL       string         `db:"url" json:"url"`
	ImageURL  NullString `db:"image_url" json:"image_url,omitempty"`
	Source    string         `db:"source" json:"source"`
	ShortID   NullString `db:"short_id" json:"short_id,omitempty"`
	FamilyKey NullString `db:"family_key" json:"family_key,omitempty"`
	FoundAt   time.Time      `db:"found_at" json:"found_at"`
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
	ID            int64          `db:"id" json:"id"`
	GroupID       int64          `db:"group_id" json:"group_id"`
	StartedAt     time.Time      `db:"started_at" json:"started_at"`
	FinishedAt    NullTime   `db:"finished_at" json:"finished_at,omitempty"`
	ProductsFound int            `db:"products_found" json:"products_found"`
	Status        string         `db:"status" json:"status"`
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
}

type WAAccount struct {
	ID          int64          `db:"id" json:"id"`
	Name        string         `db:"name" json:"name"`
	Provider    string         `db:"provider" json:"provider"`
	BaseURL     NullString `db:"base_url" json:"base_url,omitempty"`
	APIKey      NullString `db:"api_key" json:"api_key,omitempty"`
	Instance    NullString `db:"instance" json:"instance,omitempty"`
	GroupPrefix NullString `db:"group_prefix" json:"group_prefix,omitempty"`
	Status      string         `db:"status" json:"status"`
	Active      bool           `db:"active" json:"active"`
	Role        string         `db:"role" json:"role"`
	DailyLimit  int            `db:"daily_limit" json:"daily_limit"`
	SentToday   int            `db:"sent_today" json:"sent_today"`
	CreatedAt   time.Time      `db:"created_at" json:"created_at"`
}

type TGAccount struct {
	ID           int64          `db:"id" json:"id"`
	Name         string         `db:"name" json:"name"`
	BotToken     NullString `db:"bot_token" json:"bot_token,omitempty"`
	BotUsername  NullString `db:"bot_username" json:"bot_username,omitempty"`
	GroupPrefix  NullString `db:"group_prefix" json:"group_prefix,omitempty"`
	LastUpdateID NullInt64  `db:"last_update_id" json:"last_update_id,omitempty"`
	Active       bool           `db:"active" json:"active"`
	Role         string         `db:"role" json:"role"`
	DailyLimit   int            `db:"daily_limit" json:"daily_limit"`
	SentToday    int            `db:"sent_today" json:"sent_today"`
	CreatedAt    time.Time      `db:"created_at" json:"created_at"`
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

// GetSources returns the list of source IDs for this search term.
// It parses the Sources field as JSON if possible, falling back to legacy ad-hoc values.
func (s *SearchTerm) GetSources() []string {
	// Try to parse as JSON array first
	var sources []string
	if err := json.Unmarshal([]byte(s.Sources), &sources); err == nil && len(sources) > 0 {
		return sources
	}

	// Fallback to legacy ad-hoc values
	switch s.Sources {
	case "all":
		return []string{"ml", "amz"}
	case "mercadolivre":
		return []string{"ml"}
	case "amazon":
		return []string{"amz"}
	default:
		// Return as-is if not recognized (for future extensibility)
		if s.Sources != "" {
			return []string{s.Sources}
		}
		return []string{}
	}
}

type CrawlResult struct {
	ID               int64          `db:"id" json:"id"`
	SearchTermID     int64          `db:"search_term_id" json:"search_term_id"`
	Title            string         `db:"title" json:"title"`
	Price            float64        `db:"price" json:"price"`
	URL              string         `db:"url" json:"url"`
	ImageURL         NullString `db:"image_url" json:"image_url,omitempty"`
	Source           string         `db:"source" json:"source"`
	SourceSubID      NullString `db:"source_subid" json:"source_subid,omitempty"`
	CrawledAt        time.Time      `db:"crawled_at" json:"crawled_at"`
	CatalogVariantID NullInt64  `db:"catalog_variant_id" json:"catalog_variant_id,omitempty"`
}

type CatalogProduct struct {
	ID                int64           `db:"id" json:"id"`
	CanonicalName     string          `db:"canonical_name" json:"canonical_name"`
	Brand             NullString  `db:"brand" json:"brand,omitempty"`
	Weight            NullString  `db:"weight" json:"weight,omitempty"`
	ImageURL          NullString  `db:"image_url" json:"image_url,omitempty"`
	LowestPrice       NullFloat64 `db:"lowest_price" json:"lowest_price,omitempty"`
	LowestPriceURL    NullString  `db:"lowest_price_url" json:"lowest_price_url,omitempty"`
	LowestPriceSource NullString  `db:"lowest_price_source" json:"lowest_price_source,omitempty"`
	Tags              string          `db:"tags" json:"tags"`
	CreatedAt         time.Time       `db:"created_at" json:"created_at"`
	UpdatedAt         time.Time       `db:"updated_at" json:"updated_at"`
}

func (p *CatalogProduct) GetTags() []string {
	var tags []string
	_ = json.Unmarshal([]byte(p.Tags), &tags)
	return tags
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
	ID               int64          `db:"id" json:"id"`
	CatalogProductID int64          `db:"catalog_product_id" json:"catalog_product_id"`
	Title            string         `db:"title" json:"title"`
	VariantLabel     NullString `db:"variant_label" json:"variant_label,omitempty"`
	Price            float64        `db:"price" json:"price"`
	URL              string         `db:"url" json:"url"`
	ShortID          NullString `db:"short_id" json:"short_id,omitempty"`
	ImageURL         NullString `db:"image_url" json:"image_url,omitempty"`
	Source           string         `db:"source" json:"source"`
	FirstSeenAt      time.Time      `db:"first_seen_at" json:"first_seen_at"`
	LastSeenAt       time.Time      `db:"last_seen_at" json:"last_seen_at"`
}

type PriceHistoryV2 struct {
	ID         int64     `db:"id" json:"id"`
	VariantID  int64     `db:"variant_id" json:"variant_id"`
	Price      float64   `db:"price" json:"price"`
	RecordedAt time.Time `db:"recorded_at" json:"recorded_at"`
}

type VariantStats struct {
	P25    float64 `json:"p25"`
	P50    float64 `json:"p50"`
	P75    float64 `json:"p75"`
	Mean   float64 `json:"mean"`
	Current float64 `json:"current"`
	Score  *float64 `json:"score"` // null if insufficient data or no variance
	Count  int     `json:"count"`
	Window string  `json:"window"`
	Reason *string `json:"reason,omitempty"` // reason score is null (e.g., "insufficient_data", "no_variance")
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
	ID        int64          `db:"id" json:"id"`
	ChannelID int64          `db:"channel_id" json:"channel_id"`
	Provider  string         `db:"provider" json:"provider"`
	ChatID    string         `db:"chat_id" json:"chat_id"`
	Name      NullString `db:"name" json:"name,omitempty"`
	InviteURL NullString `db:"invite_url" json:"invite_url,omitempty"`
	Status    string         `db:"status" json:"status"`
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
	ID            int64           `db:"id" json:"id"`
	ChannelID     int64           `db:"channel_id" json:"channel_id"`
	MatchType     string          `db:"match_type" json:"match_type"`
	MatchValue    NullString  `db:"match_value" json:"match_value,omitempty"`
	MaxPrice      NullFloat64 `db:"max_price" json:"max_price,omitempty"`
	NotifyNew     bool            `db:"notify_new" json:"notify_new"`
	NotifyDrop    bool            `db:"notify_drop" json:"notify_drop"`
	NotifyLowest  bool            `db:"notify_lowest" json:"notify_lowest"`
	DropThreshold float64         `db:"drop_threshold" json:"drop_threshold"`
	Active        bool            `db:"active" json:"active"`
}

type SentMessageV2 struct {
	ID               int64     `db:"id" json:"id"`
	CatalogProductID int64     `db:"catalog_product_id" json:"catalog_product_id"`
	ChannelTargetID  int64     `db:"channel_target_id" json:"channel_target_id"`
	IsDrop           bool      `db:"is_drop" json:"is_drop"`
	SentAt           time.Time `db:"sent_at" json:"sent_at"`
}

type CrawlLog struct {
	ID            int64          `db:"id" json:"id"`
	SearchTermID  int64          `db:"search_term_id" json:"search_term_id"`
	StartedAt     time.Time      `db:"started_at" json:"started_at"`
	FinishedAt    NullTime   `db:"finished_at" json:"finished_at,omitempty"`
	Status        string         `db:"status" json:"status"`
	MLCount       int            `db:"ml_count" json:"ml_count"`
	AmzCount      int            `db:"amz_count" json:"amz_count"`
	SourceCounts  NullString `db:"source_counts" json:"source_counts,omitempty"`
	ErrorMsg      NullString `db:"error_msg" json:"error_msg,omitempty"`
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
	ID         int64          `db:"id" json:"id"`
	Text       string         `db:"text" json:"text"`
	ImageURL   NullString `db:"image_url" json:"image_url,omitempty"`
	ChannelIDs string         `db:"channel_ids" json:"channel_ids"`
	Status     string         `db:"status" json:"status"`
	SentCount  int            `db:"sent_count" json:"sent_count"`
	SentAt     NullTime   `db:"sent_at" json:"sent_at,omitempty"`
	ErrorMsg   NullString `db:"error_msg" json:"error_msg,omitempty"`
	CreatedAt  time.Time      `db:"created_at" json:"created_at"`
}

// RedesignGroup é o destino físico (WA/TG) do ReDesign — tabela groups.
// Não confundir com Group legado (tabela "group").
type RedesignGroup struct {
	ID            int64      `db:"id" json:"id"`
	ShortID       string     `db:"short_id" json:"short_id"`
	ChannelID     int64      `db:"channel_id" json:"channel_id"`
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
	FallbackChain    []byte    `db:"fallback_chain" json:"fallback_chain"`
	RedirectStrategy string    `db:"redirect_strategy" json:"redirect_strategy"`
	RoundRobinIdx    int       `db:"round_robin_idx" json:"-"`
	Active           bool      `db:"active" json:"active"`
	Clicks30d        int       `db:"clicks_30d" json:"clicks_30d"`
	CreatedAt        time.Time `db:"created_at" json:"created_at"`
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

type TelegramChat struct {
	ChatID          string         `db:"chat_id" json:"chat_id"`
	Type            string         `db:"type" json:"type"`
	Title           string         `db:"title" json:"title"`
	Username        NullString `db:"username" json:"username,omitempty"`
	MemberCount     NullInt64  `db:"member_count" json:"member_count,omitempty"`
	IsAdmin         bool           `db:"is_admin" json:"is_admin"`
	DiscoveredAt    time.Time      `db:"discovered_at" json:"discovered_at"`
	LastSeenAt      time.Time      `db:"last_seen_at" json:"last_seen_at"`
	LinkedGroupID   NullInt64  `db:"linked_group_id" json:"linked_group_id,omitempty"`
	LinkedChannelID NullInt64  `db:"linked_channel_id" json:"linked_channel_id,omitempty"`
}
