package repositories

import (
	_ "embed"
)

//go:embed crawler_channel_seed.sql
var crawlerChannelSeedSQL string
