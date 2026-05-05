/* Extended types for API responses that don't match codegen exactly */
import type { snatcher_backendv2_internal_models_NullString, snatcher_backendv2_internal_models_NullFloat64 } from './index'

export interface CatalogVariant {
  id?: number
  sku?: string
  price?: number
  source?: string
  url?: string
  image_url?: string
  title?: string
  variant_label?: string
  created_at?: string
}

export interface CatalogProduct {
  id?: number
  canonical_name?: string
  brand?: snatcher_backendv2_internal_models_NullString | string
  image_url?: snatcher_backendv2_internal_models_NullString | string
  lowest_price?: snatcher_backendv2_internal_models_NullFloat64 | number
  lowest_price_source?: snatcher_backendv2_internal_models_NullString | string
  lowest_price_url?: snatcher_backendv2_internal_models_NullString | string
  created_at?: string
  updated_at?: string
  tags?: string
  weight?: snatcher_backendv2_internal_models_NullString | string
  variant_count?: number
  variants?: CatalogVariant[]
}

export interface CrawlLog {
  id: string
  search_term_id: string
  status: 'done' | 'partial' | 'error' | 'running'
  start_time?: string
  started_at?: string
  end_time?: string
  finished_at?: string
  result_count?: number
  search_term_query?: string
  ml_count?: number
  amz_count?: number
  error_msg?: string
  source_counts?: Record<string, number>
}

export interface ChannelTarget {
  id: string
  provider: 'whatsapp' | 'telegram'
  chat_id: string
}

export interface ChannelRule {
  id: string
  name?: string
}

export interface Channel {
  id?: number | string
  active?: boolean
  created_at?: string
  description?: string
  digest_max_items?: number
  digest_mode?: boolean
  message_template?: snatcher_backendv2_internal_models_NullString | string
  name?: string
  send_end_hour?: number
  send_start_hour?: number
  slug?: snatcher_backendv2_internal_models_NullString | string
  targets?: ChannelTarget[]
  rules?: ChannelRule[]
  sent_count?: number
}

export interface SearchTerm {
  id?: number | string
  active?: boolean
  query?: string
  min_val?: number
  max_val?: number
  sources?: string
  crawl_interval?: number
  last_crawled_at?: string
  result_count?: number
}

export interface Source {
  id: string
  name: string
  category: 'ecommerce' | 'cdkey'
  enabled: boolean
}
