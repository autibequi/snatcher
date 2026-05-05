package store

import (
	"snatcher/backendv2/internal/models"
	"time"
)

// Store é a interface central de persistência.
type Store interface {
	// Config
	GetConfig() (models.AppConfig, error)
	UpdateConfig(cfg models.AppConfig) error
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
	ListCatalogProducts(limit, offset int) ([]models.CatalogProduct, error)
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
	SetGroupArchived(id int64, archived bool, lastError *string) error

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
	ListSpyMessages(spyID int64, limit int) ([]models.SpyMessage, error)
	CreateSpyMessage(m models.SpyMessage) error

	// Dispatches
	CreateDispatch(d models.Dispatch, targets []models.DispatchTarget) (int64, error)
	GetDispatch(id int64) (models.Dispatch, error)
	ListDispatches(status string, limit, offset int) ([]models.Dispatch, error)
	ListDispatchTargets(dispatchID int64) ([]models.DispatchTarget, error)
	ListPendingDispatchTargets(limit int) ([]models.DispatchTarget, error)
	UpdateDispatchTargetStatus(id int64, status, errorReason string) error
	UpdateDispatchStatus(id int64, status string) error
	CancelDispatch(id int64) error
	AllDispatchTargetsFinished(dispatchID int64) (bool, error)

	// Auto Match
	CreateAutoMatchLog(log models.AutoMatchLog) error
	ListAutoMatchLogs(limit int) ([]models.AutoMatchLog, error)

	// Match — CTR histórico
	// GetHistoricalCTRForGroup calcula CTR = clicks/dispatches para o grupo no contexto
	// da categoria do produto. Retorna nil se o número de dispatches for < minDispatches.
	GetHistoricalCTRForGroup(groupID int64, category string, minDispatches int) (*float64, error)

	// Short Links
	GetOrCreateShortLink(destURL, source string) (string, error)
	GetShortLinkByID(shortID string) (destURL string, source string, found bool)

	// AffiliateConversions
	InsertAffiliateConversion(c models.AffiliateConversion) (int64, error)
}
