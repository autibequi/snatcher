/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class AnalyticsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Resumo analítico
     * Retorna métricas consolidadas de scraping, produtos e alertas para o período.
     * @param days Número de dias (1-365, default 30)
     * @returns any OK
     * @throws ApiError
     */
    public getApiAnalyticsSummary(
        days?: number,
    ): CancelablePromise<any> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/analytics/summary',
            query: {
                'days': days,
            },
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
}
