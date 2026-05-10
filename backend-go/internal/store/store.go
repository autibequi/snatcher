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
	ListWAAccounts() ([]models.WAAccount, error)
	GetWAAccount(id int64) (models.WAAccount, error)
	CreateWAAccount(a models.WAAccount) (int64, error)
	UpdateWAAccount(a models.WAAccount) error
	DeleteWAAccount(id int64) error
	ListTGAccounts() ([]models.TGAccount, error)
	GetTGAccount(id int64) (models.TGAccount, error)
	CreateTGAccount(a models.TGAccount) (int64, error)
	UpdateTGAccount(a models.TGAccount) error
	DeleteTGAccount(id int64) error

	// Throttle (check and increment daily message limits)
	CheckAndIncrementWA(accountID int64) error
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

	// CrawlLogs
	InsertCrawlLog(l models.CrawlLog) (int64, error)
	UpdateCrawlLog(l models.CrawlLog) error
	ListCrawlLogs(termID int64, limit int) ([]models.CrawlLog, error)

	// Catalog
	ListCatalogProducts(limit, offset int, includeInactive bool) ([]models.CatalogProduct, error)
	// ListCatalogProductsAfterCursor ordena por id ASC após cursor (auto-match justo).
	ListCatalogProductsAfterCursor(limit int, afterID int64, includeInactive bool) ([]models.CatalogProduct, error)
	// ListCatalogProductsForHeuristicBatch pending/incompletos para worker de heurística (id ASC).
	ListCatalogProductsForHeuristicBatch(afterID int64, limit int) ([]models.CatalogProduct, error)
	SetAutoMatchProductCursor(cursor int64) error
	SetCurationHeuristicCheckpoint(at time.Time, lastProductID int64) error
	DeactivateCatalogProductsWithoutPrice() (int64, error)
	SearchCatalogProducts(q string, limit int) ([]models.CatalogProduct, error)
	CountCatalogProducts() (int64, error)
	GetCatalogProduct(id int64) (models.CatalogProduct, error)
	CreateCatalogProduct(p models.CatalogProduct) (int64, error)
	UpdateCatalogProduct(p models.CatalogProduct) error
	DeleteCatalogProduct(id int64) error
	GetVariantByURL(url string) (models.CatalogVariant, bool, error)
	GetVariantByShortID(shortID string) (models.CatalogVariant, bool, error)
	GetCatalogVariant(id int64) (models.CatalogVariant, error)
	GetShortIDByURL(url string) string
	CreateCatalogVariant(v models.CatalogVariant) (int64, error)
	UpdateCatalogVariant(v models.CatalogVariant) error
	ListVariantsByProduct(productID int64) ([]models.CatalogVariant, error)
	// HydrateVariantPricesFromHistory preenche variant.Price com o último preço em pricehistoryv2 quando Price<=0.
	HydrateVariantPricesFromHistory(variants []models.CatalogVariant) error
	InsertPriceHistoryV2(h models.PriceHistoryV2) error
	ListPriceHistoryV2(variantID int64) ([]models.PriceHistoryV2, error)
	GetVariantStats(variantID int64, windowDays int) (*models.VariantStats, error)
	ListGroupingKeywords() ([]models.GroupingKeyword, error)
	CreateGroupingKeyword(k models.GroupingKeyword) (int64, error)
	UpdateGroupingKeyword(k models.GroupingKeyword) error
	DeleteGroupingKeyword(id int64) error
	GetRecentlyUpdatedProducts(since time.Time) ([]models.CatalogProduct, error)

	// Channels
	ListChannels() ([]models.Channel, error)
	GetChannel(id int64) (models.Channel, error)
	GetChannelBySlug(slug string) (models.Channel, error)
	CreateChannel(c models.Channel) (int64, error)
	UpdateChannel(c models.Channel) error
	DeleteChannel(id int64) error
	ListChannelsByCategory(category string) ([]models.Channel, error)
	ListChannelsForProduct(category, brand string, price, drop float64) ([]models.Channel, error)
	ListChannelTargets(channelID int64) ([]models.ChannelTarget, error)
	GetChannelTarget(id int64) (models.ChannelTarget, error)
	ListAllChannelTargets() ([]models.ChannelTarget, error)
	CreateChannelTarget(t models.ChannelTarget) (int64, error)
	UpdateChannelTarget(t models.ChannelTarget) error
	DeleteChannelTarget(id int64) error
	ListChannelRules(channelID int64) ([]models.ChannelRule, error)
	CreateChannelRule(r models.ChannelRule) (int64, error)
	UpdateChannelRule(r models.ChannelRule) error
	DeleteChannelRule(id int64) error
	GetChannelAutomation(channelID int64) (*models.ChannelAutomation, error)
	UpsertChannelAutomation(a models.ChannelAutomation) error
	UpdateAutoMatchNextGroupIdx(channelID int64, idx int) error
	ListChannelAutomations(enabledOnly bool) ([]models.ChannelAutomation, error)
	ListAutoMatchLogsByChannel(channelID int64, limit int) ([]models.AutoMatchLog, error)
	WasSentRecently(productID, targetID int64, since time.Time) (bool, error)
	RecordSent(s models.SentMessageV2) error

	// Broadcast
	CreateBroadcast(b models.BroadcastMessage) (int64, error)
	UpdateBroadcast(b models.BroadcastMessage) error
	ListBroadcasts(limit int) ([]models.BroadcastMessage, error)

	// Analytics
	CountClicksByProduct(productID int64) (int64, error)
	InsertClickLog(l models.ClickLog) error

	// Legacy
	ListGroups() ([]models.Group, error)
	GetGroup(id int64) (models.Group, error)
	ListProductsByGroup(groupID int64, limit int) ([]models.Product, error)
	GetProductByShortID(shortID string) (models.Product, bool, error)

	// TelegramChat
	UpsertTelegramChat(c models.TelegramChat) error
	ListTelegramChats() ([]models.TelegramChat, error)

	// Analytics
	GetAnalyticsSummary(since time.Time, days int) (map[string]any, error)

	// Coverage (multi-WA)
	ListAccountsForTarget(targetID int64) ([]models.ChannelTargetAccount, error)
	GetAccountsByTargetWithRole(targetID int64, role string) ([]models.ChannelTargetAccount, error)

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

	// Channel history
	ListChannelDispatchHistory(channelID int64, limit int) ([]models.ChannelHistoryEntry, error)

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

	// Dispatches
	CreateDispatch(d models.Dispatch, targets []models.DispatchTarget) (int64, error)
	GetDispatch(id int64) (models.Dispatch, error)
	ListDispatches(status string, limit, offset int) ([]models.Dispatch, error)
	ListDispatchTargets(dispatchID int64) ([]models.DispatchTarget, error)
	ListPendingDispatchTargets(limit int) ([]models.DispatchTarget, error)
	// PromotePendingApprovalToQueued passa pending_approval → queued quando full_auto_mode=true
	// (não depende do Jonfrey nem da ação auto_release_pending).
	PromotePendingApprovalToQueued() (int64, error)
	UpdateDispatchTargetStatus(id int64, status, errorReason string) error
	UpdateDispatchStatus(id int64, status string) error
	CancelDispatch(id int64) error
	AllDispatchTargetsFinished(dispatchID int64) (bool, error)
	HasDeliveredTarget(dispatchID int64) (bool, error)
	// DispatchIDsWithDelivered devolve true nas chaves que têm pelo menos um target status=delivered.
	DispatchIDsWithDelivered(dispatchIDs []int64) map[int64]bool

	// Auto Match
	CreateAutoMatchLog(log models.AutoMatchLog) (int64, error)
	ListAutoMatchLogs(limit int) ([]models.AutoMatchLog, error)
	// AutoMatchProductChannelInFlight bloqueia duplicar fila (produto+canal com dispatch/target pendente).
	AutoMatchProductChannelInFlight(productID, channelID int64) (bool, error)
	// AutoMatchHasRecentPairLog cooldown por par produto+canal (qualquer log recente).
	AutoMatchHasRecentPairLog(productID, channelID int64, since time.Time) (bool, error)
	// SetDispatchWaRRCursor persiste cursor round-robin WA no dispatch worker.
	SetDispatchWaRRCursor(cursor int) error
	// ListAutoMatchLogsSince: timeline por dispatches na janela (created_at), enriquecida com auto_match_logs.
	// sem linha de log (órfãos), mesma janela temporal — para timeline na UI.
	ListAutoMatchLogsSince(since time.Time, limit int) ([]models.AutoMatchLog, error)
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

	// Channel stats (cliques reais, disparos, série diária)
	GetChannelStats(channelID int64) (ChannelStats, error)

	// OperationalContext agrega canais ativos, crawlers, cobertura do catálogo e lacunas (prompts LLM).
	GetOperationalContext(ctx context.Context) (OperationalContext, error)

	// AffiliateConversions
	InsertAffiliateConversion(c models.AffiliateConversion) (int64, error)

	// Catalog com filtros
	FilterCatalogProducts(f CatalogFilters) ([]models.CatalogProduct, int64, error)
	ListPendingCurationProducts(limit int) ([]models.CatalogProduct, error)

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

	// Ads — disparos recorrentes customizados
	ListAds(activeOnly bool) ([]models.Ad, error)
	GetAd(id int64) (models.Ad, error)
	CreateAd(a models.Ad) (int64, error)
	UpdateAd(a models.Ad) error
	DeleteAd(id int64) error
	MarkAdDispatched(id int64) error
	IncrementAdClicks(shortID string, n int) error

	// Taxonomy Patterns (PR-1: triage-refactor)
	ListTaxonomyPatterns(taxonomyIDs []int64, kinds []string) ([]models.TaxonomyPattern, error)
	ListAllActivePatterns() ([]models.TaxonomyPattern, error)
	MaxTaxonomyPatternUpdatedAt() (time.Time, error)

	// Product Taxonomy (PR-1: triage-refactor)
	UpsertProductTaxonomy(productID, taxonomyID int64, role string, confidence float64, source string) error
	ListProductTaxonomies(productID int64) ([]models.CatalogProductTaxonomy, error)

	// Auto Match Log false positives and breakdown (PR-1: triage-refactor)
	MarkAutoMatchFalsePositive(logID int64, reason string) error
	ListFalsePositiveLogs(sinceDays int) ([]models.AutoMatchLog, error)
	UpdateAutoMatchScoreBreakdown(logID int64, breakdown []byte, reasons []string) error

	// Product attributes (PR-1: triage-refactor)
	UpdateProductAttributesJSON(productID int64, attrs []byte) error
	GetVariantBySourceSubID(source, subid string) (models.CatalogVariant, bool, error)
	CountChannelClicksLast30d(channelID int64) (int, error)
}
