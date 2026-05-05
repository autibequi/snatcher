/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseHttpRequest } from './core/BaseHttpRequest';
import type { OpenAPIConfig } from './core/OpenAPI';
import { AxiosHttpRequest } from './core/AxiosHttpRequest';
import { AnalyticsService } from './services/AnalyticsService';
import { AuthService } from './services/AuthService';
import { CatalogService } from './services/CatalogService';
import { ChannelsService } from './services/ChannelsService';
import { HealthService } from './services/HealthService';
import { SearchTermsService } from './services/SearchTermsService';
type HttpRequestConstructor = new (config: OpenAPIConfig) => BaseHttpRequest;
export class ApiClient {
    public readonly analytics: AnalyticsService;
    public readonly auth: AuthService;
    public readonly catalog: CatalogService;
    public readonly channels: ChannelsService;
    public readonly health: HealthService;
    public readonly searchTerms: SearchTermsService;
    public readonly request: BaseHttpRequest;
    constructor(config?: Partial<OpenAPIConfig>, HttpRequest: HttpRequestConstructor = AxiosHttpRequest) {
        this.request = new HttpRequest({
            BASE: config?.BASE ?? 'http://localhost:8000',
            VERSION: config?.VERSION ?? '1.0',
            WITH_CREDENTIALS: config?.WITH_CREDENTIALS ?? false,
            CREDENTIALS: config?.CREDENTIALS ?? 'include',
            TOKEN: config?.TOKEN,
            USERNAME: config?.USERNAME,
            PASSWORD: config?.PASSWORD,
            HEADERS: config?.HEADERS,
            ENCODE_PATH: config?.ENCODE_PATH,
        });
        this.analytics = new AnalyticsService(this.request);
        this.auth = new AuthService(this.request);
        this.catalog = new CatalogService(this.request);
        this.channels = new ChannelsService(this.request);
        this.health = new HealthService(this.request);
        this.searchTerms = new SearchTermsService(this.request);
    }
}

