/**
 * Ponto de entrada para tipos e serviços da API
 *
 * A pasta generated/ é gerada via `npm run gen:api` e não é commitada.
 *
 * Imports:
 * - Tipos manuais do api.ts existente
 * - Quando disponível, tipos gerados do OpenAPI via npm run gen:api
 *
 * Re-exportar tipos manuais existentes até que codegen esteja disponível.
 */

// Re-exportar tipos e funções manuais existentes
export * from '../api'

// TODO: Após primeira geração, descomentar para usar tipos gerados:
// export * from './generated'
