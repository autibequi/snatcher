# Snatcher Frontend

React 18 + Vite + TypeScript frontend com tipagem automática do backend.

## Estrutura

- `src/pages/` — páginas (Login, Dashboard, Crawlers, etc.)
- `src/components/` — componentes reutilizáveis
- `src/api.js` — cliente HTTP Axios (sem tipos; será migrando em 007/003)
- `src/types/` — tipos TS gerados do Swagger 2.0 do backend

## Desenvolvimento

### Instalar dependências

```bash
npm install
```

### Dev server

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Lint & Type Check

```bash
npm run lint
npm run typecheck
```

### Formatar código

```bash
npm run format
```

## Geração de tipos do backend

O arquivo `src/types/swagger.json` contém o snapshot do OpenAPI/Swagger 2.0 do backend.
Para regerar tipos quando o backend mudar:

```bash
npm run generate:types
```

### Como atualizar swagger.json

Se o backend adicionou novos endpoints ou alterou modelos:

1. **Backend rodando em `http://localhost:8000`:**
   ```bash
   curl http://localhost:8000/api/swagger/swagger.json > src/types/swagger.json
   npm run generate:types
   ```

2. **Backend não disponível:**
   Copiar swagger.json do arquivo estático do backend (`internal/docs/swagger.json`).

### Estrutura dos tipos gerados

- `ApiClient.ts` — cliente Axios tipado
- `core/` — utilitários (request, response, errors, OpenAPI config)
- `models/` — tipos de dados (SearchTerm, Channel, CatalogProduct, etc.)
- `services/` — serviços tipados por domínio (SearchTermsService, ChannelsService, etc.)
- `index.ts` — exportações principais

### Uso dos tipos em componentes

```typescript
import { ApiClient, SearchTerm, SearchTermsService } from './types';

const client = new ApiClient();
const terms: SearchTerm[] = await SearchTermsService.getSearchTerms();
```

## Plano de migração (Fase 9)

| Card | Descricao |
|------|-----------|
| 001 | ✓ TypeScript + ESLint + Prettier (flat config) |
| 002 | ✓ Codegen swagger → `src/types/` |
| 003 | TODO: Migrar `src/api.js` → `src/api.ts` tipado |
| 004-008 | TODO: Migrar componentes e páginas incrementalmente |

## Gotchas

1. **ESLint v9** — configuração flat em `eslint.config.js`. Ver CLAUDE.md para detalhes.
2. **allowJs: true** — durante migração incremental, arquivos `.js` coexistem com `.ts`.
3. **Swagger 2.0** — codegen via `openapi-typescript-codegen` v0.27+ suporta automático.
4. **token Authorization** — interceptor em `src/api.js:11-17`; será tipado em card 003.
