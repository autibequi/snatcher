# Split admin / public — isolamento de credencial Postgres

## Por que existe `snatcher_public_ro`

`cmd/public` serve apenas leitura (home, redirects, short links). Ele não precisa — e não deve
ter — permissão de escrita no banco. A role `snatcher_public_ro` garante que mesmo que o
processo público seja comprometido, o atacante só consegue ler os dados, não modificá-los.

## Variáveis de ambiente

| Variável | Quem usa | Permissão |
|---|---|---|
| `DATABASE_URL` | `cmd/server` (admin r/w) | superuser snatcher — leitura e escrita |
| `PUBLIC_DATABASE_URL` | `cmd/public` | snatcher_public_app — SELECT only |

Se `PUBLIC_DATABASE_URL` não estiver definida, `cmd/public` faz fallback para `DATABASE_URL`
(compatibilidade retroativa — sem quebra imediata em ambientes existentes).

## Migrations

**Migrations só rodam no `cmd/server`.** O `cmd/public` é read-only e não tem permissão DDL.
A migration `0088_public_readonly_role.sql` cria a role `snatcher_public_ro` e concede SELECT.

## Criando o user na primeira subida

A senha do user `snatcher_public_app` não fica na migration (evita vazar pro repo). Use o script
de bootstrap uma única vez após subir o `cmd/server` pela primeira vez (que já rodou as
migrations):

```bash
PUBLIC_DATABASE_PASSWORD=<senha-forte> \
DATABASE_URL=postgres://snatcher:<SNATCHER_DB_PASS>@snatcher-app-postgres:5432/snatcher?sslmode=disable \
  ./backend-go/scripts/init-public-user.sh
```

O script é idempotente: se o user já existir, apenas atualiza a senha e garante o GRANT.

## Checklist para nova instalação

1. Subir o stack (`docker compose up`)
2. Aguardar `cmd/server` aplicar migrations (incluindo 0088)
3. Rodar `init-public-user.sh` com `PUBLIC_DATABASE_PASSWORD` e `DATABASE_URL` de admin
4. Definir `SNATCHER_PUBLIC_DB_PASS` no `.env` (mesma senha usada acima)
5. Reiniciar `cmd/public` para que ele pegue `PUBLIC_DATABASE_URL`

## Riscos em produção

- Em instalações existentes, `SNATCHER_PUBLIC_DB_PASS` ainda não existe no `.env`; o `cmd/public`
  fará fallback para `DATABASE_URL` (admin) até o operador configurar a nova variável. Isso é
  seguro funcionalmente mas mantém o isolamento desativado até a ação manual.
- O user `snatcher_public_app` precisa existir antes de `cmd/public` tentar conectar com
  `PUBLIC_DATABASE_URL`; se o script não for rodado, o serviço recusará a conexão.
