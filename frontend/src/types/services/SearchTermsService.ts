/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { internal_handlers_searchTermRequest } from '../models/internal_handlers_searchTermRequest';
import type { snatcher_backendv2_internal_models_SearchTerm } from '../models/snatcher_backendv2_internal_models_SearchTerm';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class SearchTermsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Listar search terms
     * Retorna todos os termos de busca cadastrados.
     * @returns snatcher_backendv2_internal_models_SearchTerm OK
     * @throws ApiError
     */
    public getApiSearchTerms(): CancelablePromise<Array<snatcher_backendv2_internal_models_SearchTerm>> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/search-terms',
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Criar search term
     * Cria um novo termo de busca para scraping.
     * @param body Dados do search term
     * @returns snatcher_backendv2_internal_models_SearchTerm Created
     * @throws ApiError
     */
    public postApiSearchTerms(
        body: internal_handlers_searchTermRequest,
    ): CancelablePromise<snatcher_backendv2_internal_models_SearchTerm> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/api/search-terms',
            body: body,
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
}
