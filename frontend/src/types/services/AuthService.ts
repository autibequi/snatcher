/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class AuthService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Login
     * Autentica com usuário e senha, retorna access_token JWT.
     * @param body Credenciais
     * @returns any OK
     * @throws ApiError
     */
    public postApiAuthLogin(
        body: {
            password?: string;
            username?: string;
        },
    ): CancelablePromise<{
        access_token?: string;
        token_type?: string;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/api/auth/login',
            body: body,
            errors: {
                400: `Bad Request`,
                401: `Unauthorized`,
            },
        });
    }
}
