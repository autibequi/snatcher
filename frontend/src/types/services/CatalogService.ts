/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { snatcher_backendv2_internal_models_CatalogProduct } from '../models/snatcher_backendv2_internal_models_CatalogProduct';
import type { snatcher_backendv2_internal_models_CatalogVariant } from '../models/snatcher_backendv2_internal_models_CatalogVariant';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class CatalogService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Listar catálogo
     * Retorna lista paginada de produtos do catálogo.
     * @param limit Número máximo de itens (default 30)
     * @param offset Offset para paginação
     * @returns any OK
     * @throws ApiError
     */
    public getApiCatalog(
        limit?: number,
        offset?: number,
    ): CancelablePromise<{
        items?: Array<snatcher_backendv2_internal_models_CatalogProduct>;
        limit?: number;
        offset?: number;
        total?: number;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/catalog',
            query: {
                'limit': limit,
                'offset': offset,
            },
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Obter produto
     * Retorna um produto com suas variantes pelo ID.
     * @param id ID do produto
     * @returns any OK
     * @throws ApiError
     */
    public getApiCatalog1(
        id: number,
    ): CancelablePromise<{
        product?: snatcher_backendv2_internal_models_CatalogProduct;
        variants?: Array<snatcher_backendv2_internal_models_CatalogVariant>;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/catalog/{id}',
            path: {
                'id': id,
            },
            errors: {
                400: `Bad Request`,
                404: `Not Found`,
            },
        });
    }
}
