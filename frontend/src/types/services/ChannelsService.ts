/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { internal_handlers_channelRequest } from '../models/internal_handlers_channelRequest';
import type { snatcher_backendv2_internal_models_Channel } from '../models/snatcher_backendv2_internal_models_Channel';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class ChannelsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Criar canal
     * Cria um canal de notificação (WhatsApp/Telegram) com regras de alerta.
     * @param body Dados do canal
     * @returns snatcher_backendv2_internal_models_Channel Created
     * @throws ApiError
     */
    public postApiChannels(
        body: internal_handlers_channelRequest,
    ): CancelablePromise<snatcher_backendv2_internal_models_Channel> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/api/channels',
            body: body,
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
}
