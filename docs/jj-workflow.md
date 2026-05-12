# JJ Workflow — Snatcher

> Convenção de uso do Jujutsu (jj) como ferramenta de VCS local sobre o repositório Git.
> O remote continua sendo GitHub. O histórico visível no GitHub é Git puro.
> Data: 2026-05-12.

---

## Por que JJ?

O brief define "JJ commits descritivos" como padrão. JJ oferece:
- Edição de mensagem de commit sem `--amend` explícito (o working copy é um change em progresso)
- Melhor suporte a rebase/squash interativo
- Histórico limpo com mudanças atômicas por componente

---

## Setup inicial (uma vez por máquina)

```bash
# Instalar jj (se não instalado)
brew install jujutsu  # macOS / Homebrew

# Dentro do repo snatcher: inicializar jj sobre o git existente
cd /path/to/snatcher
jj git init --colocate

# Verificar que o remote está configurado
jj git remote list
# deve mostrar: origin  git@github.com:autibequi/snatcher.git (ou similar)
```

---

## Workflow por sessão

### 1. Início de sessão — sincronizar com o remote

```bash
jj git fetch
```

Equivalente ao `git fetch --all`. Busca todas as branches e tags do remote sem fazer merge automático.

### 2. Checar estado atual

```bash
jj status       # arquivos modificados no working copy
jj log          # histórico recente
```

### 3. Trabalhar normalmente

Edite arquivos normalmente. O JJ trata o working copy como um change em andamento (`@`).

```bash
# Ver diff do que está pendente
jj diff

# Ver apenas os arquivos mudados
jj diff --stat
```

### 4. Descrever a mudança atual

```bash
jj describe -m "[fase-0.5] runbook: initial draft

Por quê: alinhamento operacional antes de tocar código —
backup/restore, decisões, schema limpo."
```

Convenção de mensagem:
- Primeira linha: `[fase-N] componente: o que mudou` (≤ 72 chars)
- Linha em branco
- Parágrafo "Por quê:" (contexto de decisão, não o que mudou)

Exemplos por componente:
```
[fase-0.5] runbook: initial draft
[fase-0.5] decisions: 4 fixed + 11 pending
[fase-0.5] schema: resolve duplicate catalog fields and group_conversion_features
[fase-1] migration: add modems, accounts, group_sent_history tables
[fase-1] seed: insert 3 modems and 10 tunable_parameters
[fase-2] redirect: add fraud filter rate-limit by IP
```

### 5. Criar um novo change vazio para continuar trabalhando

```bash
# Cria um novo change (equivale a "commitar" o atual e começar um novo)
jj new
```

Ou, se quiser criar um change com mensagem já definida:

```bash
jj new -m "[fase-1] migration: add categories table"
```

### 6. Publicar no remote

```bash
# Publicar o change imediatamente anterior ao working copy (o mais recente "fechado")
jj git push --change @-

# Publicar um change específico por ID
jj git push --change <change-id>

# Ver os change IDs disponíveis
jj log --no-graph -r 'ancestors(@, 5)'
```

`@-` significa "o change pai do working copy atual" — o último change descrito e pronto para push.

### 7. Squash antes de publicar (opcional, pra PR limpo)

```bash
# Squash do working copy no change anterior
jj squash

# Squash de múltiplos changes em um (interativo)
jj squash --from <change-id> --into <outro-change-id>
```

---

## Convenção de nomes de change

Formato obrigatório:
```
[fase-N] componente: o que mudou
```

| Fase | Exemplos de componente |
|---|---|
| 0.5 | `runbook`, `decisions`, `schema` |
| 0.7 | `migrate-tool`, `migration-template` |
| 1 | `migration`, `seed`, `model`, `handler` |
| 2 | `redirect`, `conversion`, `webhook` |
| 3 | `catalog`, `quality-score`, `price-history` |
| 4 | `sender`, `anti-ban`, `send-queue` |
| 5+ | `l1-affinity`, `l5-taxonomy`, `l7-scraper` |

---

## Fluxo completo de exemplo

```bash
# Sessão de trabalho na Fase 0.5

jj git fetch

# Editar RUNBOOK.md...
jj describe -m "[fase-0.5] runbook: initial draft

Por quê: backup + restore + kill switch documentados antes de qualquer mudança de schema."
jj new

# Editar DECISIONS.md...
jj describe -m "[fase-0.5] decisions: 4 fixed + 11 pending

Por quê: decisões tomadas por Pedrinho no brief precisam estar em formato consultável
para que o coder não adivinhe em Fases futuras."
jj new

# Criar snatcher-schema-resolved.sql...
jj describe -m "[fase-0.5] schema: resolve duplicate catalog fields and group_conversion_features

Por quê: regra Q-dup (última definição vence) aplicada — remove ambiguidade antes
das migrations da Fase 1 dependerem do schema canônico."

# Publicar os dois changes fechados
jj git push --change @--   # runbook
jj git push --change @-    # decisions
# o schema ainda está no working copy (@), publicar quando pronto:
jj git push --change @
```

---

## Comandos de referência rápida

| Ação | Comando |
|---|---|
| Sincronizar com remote | `jj git fetch` |
| Ver estado | `jj status` |
| Ver diff atual | `jj diff` |
| Descrever change atual | `jj describe -m "mensagem"` |
| Criar novo change | `jj new` |
| Push de change específico | `jj git push --change @-` |
| Log resumido | `jj log` |
| Squash working copy no anterior | `jj squash` |
| Ver branches remotas | `jj git remote list` |
| Desfazer última operação | `jj undo` |

---

## Notas sobre branches

O JJ com colocated Git mantém as branches Git sincronizadas. Para trabalhar em uma branch de feature (padrão do projeto):

```bash
# Criar branch de feature equivalente ao git checkout -b
jj bookmark create feature/fase-1-foundation --revision @

# Push da branch
jj git push --bookmark feature/fase-1-foundation
```

O projeto usa branches no formato `FUK2-XXXXX/nome-feature` para PRs — continua funcionando normalmente com jj.

---

## Limitação desta árvore

O `.git` nesta worktree é um stub (sem remote acessível diretamente). Para `jj git push` funcionar de verdade, o comando deve ser executado no host com acesso SSH ao GitHub. Esta documentação descreve o workflow para uso em ambiente completo.
