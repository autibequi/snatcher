# Manual do utilizador — Promo Snatcher

Este documento é para **quem nunca usou** o sistema ou precisa de uma visão completa antes de operar o painel. O mesmo conteúdo operacional está também na app em **Sistema → Manual** (e no ícone **❓** na barra).

---

## O que é o Snatcher?

O **Snatcher** descobre ofertas em marketplaces e lojas configuradas (através de **crawlers** / termos de busca), normaliza tudo num **catálogo** de produtos e permite enviar ou automatizar mensagens para **WhatsApp** e **Telegram**, usando **canais** (perfil de audiência / tópicos) e **grupos** como destinos finais.

Não é obrigatório perceber código ou servidores para usar o painel web.

---

## Duas formas de chegar ao painel

### Só vou usar o sistema (operador)

1. Obtém do administrador: **URL do painel**, **email**, **password**.
2. Abre no **navegador atualizado** (Chrome, Firefox ou Edge).
3. Faz login. Se não tiveres utilizador, pede a um **admin** para te criar em **Equipa** / gestão de utilizadores.

### Eu instalo ou mantenho o servidor

Segue o **[README](../README.md)** na raiz do repositório: Docker (ou equivalente), ficheiro `.env`, `make setup` / `make dev` ou `make start`, **migrações** da base de dados e criação do primeiro administrador. Isso é documentação de **infraestrutura**, não de operação diária.

---

## Papéis (roles)

| Papel | Em geral pode |
|--------|----------------|
| **operator** | Operação diária: crawlers, catálogo, canais, disparos, automações (conforme permissões da instância). |
| **admin** | Acima + convidar equipa, integrações sensíveis, **Danger zone** (operações destrutivas em dados operacionais). |

---

## Conceitos essenciais

| Conceito | Significado |
|----------|-------------|
| **Crawler / termo de busca** | Palavras-chave + origens (ex.: Mercado Livre, Amazon). O sistema varre periodicamente e traz resultados. |
| **Catálogo** | Produtos normalizados (nome, preço, histórico). É daqui que escolhes o que promover. |
| **Canal** | Perfil de audiência (categorias, marcas, faixas de preço, pesos). Ajuda a filtrar o que faz sentido para cada público. |
| **Grupo** | Chat de destino no WhatsApp ou Telegram. Um canal pode ligar-se a vários grupos. |
| **Disparo** | Mensagem enviada (manual ou automática). Pode estar sujeita a aprovação. |

Fluxo mental:

```text
Crawler → Catálogo → (regras / automação) → Canal + Grupos → Mensagem enviada
```

---

## Caminho sugerido na primeira vez

1. **Contas conectadas** — Liga WhatsApp (QR) e/ou Telegram até o estado indicar sessão ativa. Sem conta não há grupos nem envio.
2. **Crawlers** — Cria pelo menos um termo ativo e espera um ciclo de varredura (ou verifica **Logs**).
3. **Catálogo** — Confirma que existem produtos. Se estiver vazio, volta ao passo 2.
4. **Automações → Canais** — Cria ou edita um canal; em **Grupos**, importa grupos da conta e associa ao canal.
5. **Compor disparo** — Envia um **teste** a um grupo pequeno.
6. Só depois aumenta escala: **Automações**, **Jonfrey** (IA), anúncios — com limites conservadores (threshold, cooldown).

---

## Áreas principais do menu (resumo)

| Área | Uso |
|------|-----|
| **Dashboard** | Visão geral e alertas rápidos. |
| **Contas conectadas** | WhatsApp / Telegram. |
| **Crawlers** | Termos de busca e intervalos. |
| **Catálogo** | Produtos e revisão de ofertas. |
| **Compor disparo** | Montar e enviar mensagens (agora ou agendado). |
| **Automações** | Auto-match, filas, por canal, Jonfrey. |
| **Grupos** | Importar e vincular a canais. |
| **Logs** | Erros, filas, jobs — **primeiro sítio** quando algo falha. |
| **Configurações** | Preferências, LLM, integrações, **Danger zone** (admin). |
| **Manual** | Índice de tutoriais curtos + manual operacional. |

---

## Disparos manuais e afiliados

- Em **Compor disparo** escolhes produtos, texto e destinos.
- Para links de marketplace com comissão, configura **Afiliados** (IDs/tags conforme a documentação da tua instância).
- Atalho de busca no catálogo: **⌘K** / **Ctrl+K** (quando disponível na UI).

---

## Automações

- **Visão geral**: filas e histórico recente.
- **Por canal**: limites, threshold, cooldown.
- **Jonfrey**: fluxos assistidos por IA (se ativos).
- Aprovações pendentes costumam aparecer na **barra superior** e nas telas de automação.

---

## Taxonomia, match e curadoria (resumo)

- **Taxonomia**: categorias e padrões para classificação consistente.
- **Match**: avalia correspondência entre produtos.
- **Curadoria**: revisão humana antes de enviar, quando o fluxo exige.

---

## Configurações e Danger zone

Em **Configurações** (separações variam por versão):

- Preferências de UI, LLM, integrações.

**Danger zone** (apenas **admin**):

- Executa um **soft wipe** operacional (arquiva grupos, desativa canais, inativa catálogo conforme implementação atual).
- É **obrigatório** digitar **exactamente** a frase de confirmação mostrada no ecrã — a validação é feita **no servidor**; espaços a mais ou menos falham.
- Opcionalmente podes pedir para **reaplicar seeds** (taxonomia e/ou crawlers e canais de exemplo), útil após uma limpeza.

---

## API técnica

Integrações externas podem usar a documentação OpenAPI do backend (normalmente **`/api/swagger`** no host da API admin). Uso normal do painel **não exige** isto.

---

## Mais ajuda dentro da app

- **Manual** no menu lateral → tutorial **Quickstarter** e outros tópicos por rota.
- Ícone **❓** na barra → mesmo manual **contextualizado** para a página onde estás.

---

## Documentação do repositório

| Ficheiro | Conteúdo |
|----------|----------|
| [README.md](../README.md) | Instalação, variáveis `.env`, comandos `make`, pipeline técnico. |
| [frontend/README.md](../frontend/README.md) | Build do frontend, lint, tipos Swagger. |
| [CLAUDE.md](../CLAUDE.md) | Visão de arquitetura para desenvolvimento. |

Versão deste ficheiro: alinhada ao manual operacional em `frontend/src/content/operationalManual.tsx`. Em caso de divergência, o texto **na aplicação** pode evoluir mais rápido — reporta ao maintainer para sincronizar este `.md`.
