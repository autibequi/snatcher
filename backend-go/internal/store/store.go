package store

import (
	"context"
	"snatcher/backendv2/internal/models"
	"time"
)

// ChannelStats agrega métricas reais de um canal.
type ChannelStats struct {
	TotalClicks  int64              `json:"total_clicks"`
	Clicks24h    int64              `json:"clicks_24h"`
	Dispatches7d int64              `json:"dispatches_7d"`
	ProductCount int64              `json:"product_count"`
	DeliveryRate float64            `json:"delivery_rate"` // % de targets delivered
	Series       []ChannelDayStat   `json:"dispatches_7d_series"`
}

// ChannelDayStat representa disparos por dia para o gráfico.
type ChannelDayStat struct {
	Day   string `db:"day"   json:"day"`
	Value int    `db:"value" json:"value"`
}

// GroupDeliveryCount agrega quantos dispatches por grupo (usado para rate limit / backpressure).
type GroupDeliveryCount struct {
	GroupID int64 `db:"group_id"`
	Count   int   `db:"count"`
}

// CatalogFilters agrupa filtros para listagem do catálogo.
type CatalogFilters struct {
	Search           string
	Source           string
	Status           string // 'novos' | 'curados' | 'disparados_7d' | '' (all)
	Tag              string // filtro por tag exata (JSONB contains)
	Brand            string // filtro por marca (ILIKE)
	PrimaryCategory  string // nome da taxonomy ligada como primary_category
	Subcategory      string // nome da taxonomy ligada como subcategory
	IncludeInactive  bool
	Limit            int
	Offset           int
}

// Store é a interface central de persistência.
type Store interface {
	// Config
	GetConfig() (models.AppConfig, error)
	UpdateConfig(cfg models.AppConfig) error
	// ApplyGlobalDailyLimitToAccounts copia o teto diário global para todas as contas WA/TG (anti-ban).
	ApplyGlobalDailyLimitToAccounts(limit int) error
	// Atualiza só o marcador de ciclo do worker (migration 0123).
	TouchAutoMatchWorkerRun(at time.Time) error
	// AccountV2 — contas WA v2 (tabela accounts). Substituem WAAccount após F10.
	ListAccountsV2() ([]models.AccountV2, error)
	GetAccountV2(id int64) (models.AccountV2, error)
	CreateAccountV2(phone, nickname string, modemID int64, quota int) (int64, error)
	DeleteAccountV2(id int64) error
	UpdateAccountV2(id int64, status string, quota int) error
	DeleteTGAccount(id int64) error

	// Throttle (check and increment daily message limits)
	CheckAndIncrementTG(accountID int64) error

	// SearchTerms
	ListSearchTerms() ([]models.SearchTerm, error)
	GetSearchTerm(id int64) (models.SearchTerm, error)
	CreateSearchTerm(t models.SearchTerm) (int64, error)
	UpdateSearchTerm(t models.SearchTerm) error
	DeleteSearchTerm(id int64) error
	TouchSearchTerm(id int64, count int) error

	// Affiliates
	ListAffiliates(sourceID *string) ([]models.Affiliate, error)
	GetAffiliate(id int64) (models.Affiliate, error)
	CreateAffiliate(a models.Affiliate) (int64, error)
	UpdateAffiliate(a models.Affiliate) error
	DeleteAffiliate(id int64) error
	GetAffiliateBySource(sourceID string) (models.Affiliate, bool, error)

	// CrawlResults
	InsertCrawlResult(r models.CrawlResult) (int64, error)
	ListUnprocessedCrawlResults() ([]models.CrawlResult, error)
	ListCrawlResultsByTerm(termID int64, limit, offset int) ([]models.CrawlResult, error)
	CountCrawlResultsByTerm(termID int64) (int64, error)
	MarkCrawlResultProcessed(id int64, variantID int64) error
	URLAlreadyCrawled(searchTermID int64, url string) (bool, error)
	// InsertRawItem grava um CrawlResult em raw_items (pipeline canônico v2).
	// Tolerante a erro — nunca bloqueia o fluxo principal.
	InsertRawItem(r models.CrawlResult, payload []byte) error
	// InsertDiscardedItem grava um item rejeitado em discarded_items (pipeline canônico v2).
	// Tolerante a erro — nunca bloqueia o fluxo principal.
	InsertDiscardedItem(r models.CrawlResult, payload []byte, reason string) error

	// CrawlLogs
	InsertCrawlLog(l models.CrawlLog) (int64, error)
	UpdateCrawlLog(l models.CrawlLog) error
	ListCrawlLogs(termID int64, limit int) ([]models.CrawlLog, error)

	// Catalog v1 identifiers (interface stubs — impls removed in F12)
	SetAutoMatchProductCursor(cursor int64) error
	SetCurationHeuristicCheckpoint(at time.Time, lastProductID int64) error
	DeactivateCatalogProductsWithoutPrice() (int64, error)
	GetShortIDByURL(url string) string
	InsertPriceHistoryV2(h models.PriceHistoryV2) error
	ListPriceHistoryV2(variantID int64) ([]models.PriceHistoryV2, error)
	GetVariantStats(variantID int64, windowDays int) (*models.VariantStats, error)
	WasSentRecently(productID, targetID int64, since time.Time) (bool, error)
	RecordSent(s models.SentMessageV2) error

	// Analytics
	CountClicksByProduct(productID int64) (int64, error)

	// Analytics
	GetAnalyticsSummary(since time.Time, days int) (map[string]any, error)

	// RedesignGroups
	ListRedesignGroups(channelID int64, platform, status string) ([]models.RedesignGroup, error)
	GetRedesignGroup(id int64) (models.RedesignGroup, error)
	CreateRedesignGroup(g models.RedesignGroup) (int64, error)
	UpdateRedesignGroup(g models.RedesignGroup) error
	DeleteRedesignGroup(id int64) error
	CountGroupsWithSameJID(platform, jid string) (int, error)
	// FindConflictingRedesignGroup retorna outra linha ativa com o mesmo JID+plataforma no mesmo escopo
	// (canal vinculado, ou conta WA/TG quando sem canal). excludeID ignora a própria linha em updates.
	FindConflictingRedesignGroup(g models.RedesignGroup, excludeID int64) (*models.RedesignGroup, error)
	SetGroupArchived(id int64, archived bool, lastError *string) error
	// FetchAndPersistWhatsAppInvite busca invite na Evolution e atualiza o grupo (página pública /canal).
	FetchAndPersistWhatsAppInvite(ctx context.Context, groupID int64) (string, error)

	// SoftWipeOperationalData arquiva grupos, desativa canais e produtos de catálogo (soft delete operacional).
	SoftWipeOperationalData() error
	// ReseedTaxonomySeedInserts reaplica os INSERTs de taxonomia da migração 0112 (ON CONFLICT DO NOTHING).
	ReseedTaxonomySeedInserts() error
	// ReseedCrawlerChannelSeedInserts reaplica INSERTs idempotentes de searchterm + channel (crawler_channel_seed.sql).
	ReseedCrawlerChannelSeedInserts() error

	// GroupAdmins
	ListGroupAdmins(groupID int64) ([]models.GroupAdmin, error)
	AddGroupAdmin(a models.GroupAdmin) (int64, error)
	DeleteGroupAdmin(id int64) error
	CountGroupAdmins(groupID int64) (int, error)

	// AffiliatePrograms (ReDesign)
	ListAffiliatePrograms(active *bool) ([]models.AffiliateProgram, error)
	GetAffiliateProgram(id int64) (models.AffiliateProgram, error)
	CreateAffiliateProgram(p models.AffiliateProgram) (int64, error)
	UpdateAffiliateProgram(p models.AffiliateProgram) error
	DeleteAffiliateProgram(id int64) error
	ListAffiliateProgramsByMarketplace(marketplace string) ([]models.AffiliateProgram, error)

	// PublicLinks
	CreatePublicLink(l models.PublicLink) (int64, error)
	GetPublicLink(id int64) (models.PublicLink, error)
	GetPublicLinkBySlug(slug string) (models.PublicLink, error)
	ListPublicLinks() ([]models.PublicLink, error)
	UpdatePublicLink(l models.PublicLink) error
	DeletePublicLink(id int64) error
	IncrementRoundRobinIdx(id int64, newIdx int) error
	IncrementPublicLinkClicks(id int64) error

	// Clusters
	ListClusters() ([]models.Cluster, error)
	GetCluster(id int64) (models.Cluster, error)
	UpsertClusters(clusters []models.Cluster) error

	// GroupSpies (spy crawlers)
	ListGroupSpies(platform string, activeOnly bool) ([]models.GroupSpy, error)
	GetGroupSpy(id int64) (models.GroupSpy, error)
	CreateGroupSpy(g models.GroupSpy) (int64, error)
	SoftDeleteGroupSpy(id int64) error
	UpdateGroupSpyReader(id int64, readerWAID, readerTGID models.NullInt64) error
	ListSpyMessages(spyID int64, limit int) ([]models.SpyMessage, error)
	CreateSpyMessage(m models.SpyMessage) error


	// Auto Match
	// AutoMatchProductChannelInFlight bloqueia duplicar fila (produto+canal com dispatch/target pendente).
	AutoMatchProductChannelInFlight(productID, channelID int64) (bool, error)
	// AutoMatchHasRecentPairLog cooldown por par produto+canal (qualquer log recente).
	AutoMatchHasRecentPairLog(productID, channelID int64, since time.Time) (bool, error)
	// SetDispatchWaRRCursor persiste cursor round-robin WA no dispatch worker.
	SetDispatchWaRRCursor(cursor int) error
	// CountAutoMatchDispatchesSince conta dispatches criados pelo worker auto-match (composed_by=auto-match).
	CountAutoMatchDispatchesSince(since time.Time) (int64, error)

	// Match — CTR histórico
	// GetHistoricalCTRForGroup calcula CTR = clicks/dispatches para o grupo no contexto
	// da categoria do produto. Retorna nil se o número de dispatches for < minDispatches.
	GetHistoricalCTRForGroup(groupID int64, category string, minDispatches int) (*float64, error)

	// Short Links
	GetOrCreateShortLink(destURL, source string) (string, error)
	// PeekShortLinkByID lê dest/source sem incrementar click_count (uso em redirects + log).
	PeekShortLinkByID(shortID string) (destURL string, source string, found bool)
	IncrementShortLinkClickCount(shortID string)
	GetShortLinkByID(shortID string) (destURL string, source string, found bool)


	// OperationalContext agrega canais ativos, crawlers, cobertura do catálogo e lacunas (prompts LLM).
	GetOperationalContext(ctx context.Context) (OperationalContext, error)

	// AffiliateConversions
	InsertAffiliateConversion(c models.AffiliateConversion) (int64, error)

	// Rate limit / backpressure
	CountRecentDeliveriesByGroup(minutes int) ([]GroupDeliveryCount, error)
	CountPendingTargetsByGroup() ([]GroupDeliveryCount, error)

	// Product failures (purge 404)
	IncrementProductFailures(id int64) error
	ResetProductFailures(id int64) error

	// Taxonomy (categorias e marcas)
	ListTaxonomy(taxType string) ([]models.Taxonomy, error)
	ListTaxonomyWithParent(taxType string, parentID *int64) ([]models.Taxonomy, error)
	IncrementTaxonomyDetect(id int64) error
	CreateTaxonomy(t models.Taxonomy) (int64, error)
	UpdateTaxonomy(t models.Taxonomy) error
	DeleteTaxonomy(id int64) error
	SetTaxonomyStatus(id int64, status string) error
	ListPendingTaxonomy() ([]models.Taxonomy, error)
	DetectAndUpsertTaxonomy(text string) ([]int64, error)
	GetTaxonomy(id int64) (*models.Taxonomy, error)
	GetTaxonomyByIDs(ids []int64) ([]models.Taxonomy, error)
	SuggestTaxonomyCandidate(taxType, name string, keywords []string, sampleText, source string) (int64, error)

	// Jonfrey assistant (orquestrador AI)
	CreateJonfreyAction(a models.JonfreyAction) (int64, error)
	UpdateJonfreyAction(a models.JonfreyAction) error
	ListJonfreyActions(limit int, actionType string) ([]models.JonfreyAction, error)
	ListJonfreyActionsForWorkQueue(limit int) ([]models.JonfreyAction, error)
	ReconcileStaleJonfreyActions(staleMinutes int, message string) (int64, error)
	// DeleteTerminalJonfreyActions remove linhas de auditoria já finalizadas (success/failed/skipped).
	DeleteTerminalJonfreyActions() (int64, error)
	GetJonfreyConfig() (models.JonfreyConfig, error)
	UpdateJonfreyConfig(c models.JonfreyConfig) error
	// JonfreyLastRunByActionType última linha terminada por action_type (finished_at + status).
	JonfreyLastRunByActionType() (map[string]models.JonfreyLastRunSummary, error)

	// Taxonomy Patterns (PR-1: triage-refactor)
	ListTaxonomyPatterns(taxonomyIDs []int64, kinds []string) ([]models.TaxonomyPattern, error)
	ListAllActivePatterns() ([]models.TaxonomyPattern, error)
	MaxTaxonomyPatternUpdatedAt() (time.Time, error)

	// Product Taxonomy (PR-1: triage-refactor)
	UpsertProductTaxonomy(productID, taxonomyID int64, role string, confidence float64, source string) error

	// Product attributes (PR-1: triage-refactor)
	UpdateProductAttributesJSON(productID int64, attrs []byte) error
	CountChannelClicksLast30d(channelID int64) (int, error)

	// Catalog v2 — pipeline canônico (F03+)
	UpsertCatalogItem(p CatalogV2UpsertParams) (string, error)
	GetCatalogItemByDedupKey(dedupKey string) (CatalogV2Item, bool, error)
	GetCatalogItemByURL(canonicalURL string) (CatalogV2Item, bool, error)
	ListCatalogV2ForMatch(limit int) ([]CatalogV2Item, error)

	// ChannelV2
	ListChannelsV2() ([]models.ChannelV2, error)
	GetChannelV2(id int64) (models.ChannelV2, error)
	CreateChannelV2(c models.ChannelV2) (int64, error)
	UpdateChannelV2(c models.ChannelV2) error
	DeleteChannelV2(id int64) error
	// Grupos vinculados
	ListGroupsByChannel(channelID int64) ([]models.RedesignGroup, error)
	SetGroupChannel(groupID, channelID int64) error
	UnsetGroupChannel(groupID int64) error

	// Pesos de categoria por canal
	ListChannelCategoryWeights(channelID int64) ([]models.ChannelCategoryWeight, error)
	SetChannelCategoryWeights(channelID int64, weights []models.ChannelCategoryWeight) error
}
