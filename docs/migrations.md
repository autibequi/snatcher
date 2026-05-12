# Migrations — golang-migrate workflow

Snatcher usa [golang-migrate/migrate](https://github.com/golang-migrate/migrate) v4 com driver `postgres`
e source `file://` para gerenciar o schema do banco.

## Formato dos arquivos

Cada migration é um **par** de arquivos no diretório `backend-go/internal/db/migrations/`:

```
YYYYMMDDHHMMSS_<slug>.up.sql    # aplicar (forward)
YYYYMMDDHHMMSS_<slug>.down.sql  # reverter (rollback)
```

O timestamp `YYYYMMDDHHMMSS` deve ser **único** — é a chave de ordenação e identificação.
O golang-migrate não usa marcadores `-- migrate:up` / `-- migrate:down` — os arquivos
contêm o SQL puro a ser executado.

### Exemplo

```
20260512000001_initial.up.sql
20260512000001_initial.down.sql
20260513120000_add_widget.up.sql
20260513120000_add_widget.down.sql
```

## Comandos disponíveis

### Via Makefile (raiz do projeto)

```bash
# Aplicar todas as migrations pendentes
make migrate-up

# Reverter última migration
make migrate-down

# Ver versão atual
make migrate-status

# Criar novo par de arquivos de migration
make migrate-create NAME=add_widget

# Forçar versão sem executar SQL (para sincronização de estado)
make migrate-force V=20260512000076

# Migrar para versão específica (up ou down conforme necessário)
make migrate-goto V=20260512000050
```

### Via backend-go/Makefile

Os mesmos comandos acima também estão disponíveis em `backend-go/Makefile`:

```bash
cd backend-go
make migrate-up
make migrate-down
make migrate-status
make migrate-create NAME=add_widget
make migrate-force V=20260512000076
make migrate-goto V=20260512000050
```

### Diretamente via `go run`

```bash
cd backend-go
DATABASE_URL="postgres://user:pass@localhost/dbname?sslmode=disable" \
  go run -buildvcs=false ./cmd/migrate up

go run -buildvcs=false ./cmd/migrate version
go run -buildvcs=false ./cmd/migrate down
go run -buildvcs=false ./cmd/migrate force 20260512000076
go run -buildvcs=false ./cmd/migrate goto 20260512000050
go run -buildvcs=false ./cmd/migrate drop   # PERIGOSO
```

## Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | Connection string postgres (obrigatório) |
| `MIGRATIONS_PATH` | Caminho para o diretório de migrations (padrão: `internal/db/migrations`) |

## Criando uma nova migration

```bash
make migrate-create NAME=add_users_table
```

Isso cria automaticamente:
- `backend-go/internal/db/migrations/<timestamp>_add_users_table.up.sql`
- `backend-go/internal/db/migrations/<timestamp>_add_users_table.down.sql`

Edite os dois arquivos com o SQL desejado. O timestamp é gerado automaticamente
via `date -u +%Y%m%d%H%M%S` — sempre único se criado com mais de 1 segundo de intervalo.

**Regras:**
1. Sempre criar `.up.sql` e `.down.sql` em par
2. O timestamp tem que ser único (nunca copiar/renomear um timestamp existente)
3. O `.down.sql` deve reverter exatamente o que o `.up.sql` aplicou
4. Quando a reversão não for possível (ex: DROP TABLE com dados), documentar no `.down.sql` como comentário

## Importação de estado (DB existente com schema legado)

O banco legado usava a tabela `schema_migrations` com versões no formato `NNNN_slug.sql`
(ex: `0001_initial.sql`). O golang-migrate cria sua própria tabela `schema_migrations`
com versões numéricas correspondentes ao timestamp.

Para sincronizar o estado em um banco já migrado (sem reexecutar SQL):

```bash
# Forçar o golang-migrate a considerar todas as 76 migrations como aplicadas
DATABASE_URL="postgres://..." make migrate-force V=20260512000076
```

Isso marca a versão `20260512000076` como aplicada sem executar nenhum SQL.
Executar uma única vez por banco existente que já tem o schema completo.

**Atenção:** após o `force`, a tabela `schema_migrations` legada (com entradas `0001_*.sql`)
pode ser mantida ou removida — o golang-migrate não a usa.

## Gotchas

- **Dirty state**: se uma migration falhar no meio, o banco fica `dirty`. Use
  `make migrate-force V=<versao-que-falhou>` para limpar o estado, corrija o SQL,
  e reaplique.
- **Sem transação automática**: o golang-migrate executa cada migration em uma transação
  separada por padrão (com postgres). Se precisar de múltiplas operações atômicas,
  escreva a migration inteira dentro de um `BEGIN/COMMIT` explícito.
- **Ordem de aplicação**: determinada pelo timestamp — sempre use `make migrate-create`
  para garantir timestamps únicos e crescentes.
- **`.down.sql` obrigatório**: mesmo que seja no-op, o arquivo deve existir para que o
  golang-migrate possa listar as migrations disponíveis.

## Tracking interno (in-process RunMigrations)

O `internal/db/db.go` contém `RunMigrations()` — função de conveniência para aplicar
migrations durante o boot do servidor (em desenvolvimento ou containers auto-managed).
Essa função usa `embed.FS` e lê apenas arquivos `*.up.sql`. Ela mantém sua própria
tabela `schema_migrations` com a versão sendo o nome do arquivo (ex: `20260512000001_initial.up.sql`).

Em produção, prefira o `cmd/migrate` externo para ter controle explícito sobre o momento
da aplicação.
