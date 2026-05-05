/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { snatcher_backendv2_internal_models_NullString } from './snatcher_backendv2_internal_models_NullString';
import type { snatcher_backendv2_internal_models_NullTime } from './snatcher_backendv2_internal_models_NullTime';
export type snatcher_backendv2_internal_models_SearchTerm = {
    active?: boolean;
    amz_tracking_id?: snatcher_backendv2_internal_models_NullString;
    crawl_interval?: number;
    created_at?: string;
    id?: number;
    last_crawled_at?: snatcher_backendv2_internal_models_NullTime;
    max_val?: number;
    min_val?: number;
    ml_affiliate_tool_id?: snatcher_backendv2_internal_models_NullString;
    queries?: string;
    query?: string;
    result_count?: number;
    sources?: string;
};

