/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class HealthService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Health check
     * Verifica se o servidor está no ar.
     * @returns any OK
     * @throws ApiError
     */
    public getApiHealth(): CancelablePromise<{
        status?: string;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/health',
        });
    }
}
