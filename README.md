# Arelon (Web + Samsung Tizen Ready)

Aplicação IPTV web em React + TypeScript com foco em navegação por controle remoto, suporte a TV ao vivo, Filmes, Séries, Infantil, Minha Lista, Multi-View e área administrativa Master para configuração de servidor IPTV.

## Stack

- React + TypeScript + Vite
- Zustand (estado global)
- React Router
- HLS.js + DASH.js
- Vitest + Testing Library
- ESLint + Prettier

## Requisitos

- Node.js 20+
- npm 10+

## Configuração

1. Copie variáveis de ambiente:

```bash
cp .env.example .env
```

2. Instale dependências:

```bash
npm install
```

3. Execute em desenvolvimento:

```bash
npm run dev
```

Isso sobe o frontend, a API de configuração compartilhada e o proxy Xtream. O frontend chama `/api/xtream` no mesmo endereço em que foi aberto, então uma TV na rede não tenta acessar `localhost` nela mesma.

4. (Opcional) para subir apenas a API de configuração compartilhada separadamente:

```bash
npm run config:api
```

5. (Opcional) para subir o proxy Xtream local:

```bash
npm run arelon:api
```

6. Para build Samsung TV (`file://`) compartilhar o mesmo Master usado no navegador, use o endpoint HTTP absoluto do deploy web:

```bash
VITE_TV_SHARED_CONFIG_ENDPOINT=http://SEU_IP:8080/api/admin/shared-config
```

O script `./deploy-tv.sh` prefere automaticamente `http://SEU_IP:8080/api/admin/shared-config` quando o deploy web está rodando.

## Scripts

- `npm run dev`: sobe ambiente local (frontend + API de configuração compartilhada + proxy Xtream)
- `npm run config:api`: sobe API local de configuração compartilhada do Master
- `npm run arelon:api`: sobe o proxy Xtream local em `ARELON_API_PORT` (padrao `8789`)
- `npm run build`: valida TypeScript e build de produção
- `npm run deploy:tv-live`: faz deploy live com hot-reload na TV física de testes
- `npm run package:tizen-hosted`: gera pacote `.wgt` leve (Hosted App) para a loja Samsung
- `npm run docker:dev`: sobe app no Docker para desenvolvimento
- `npm run docker:prod`: sobe build de produção no Docker
- `npm run lint`: valida lint
- `npm run test`: executa testes unitários/integrados
- `npm run test:coverage`: cobertura

## Rodar com Docker

Desenvolvimento (Vite):

```bash
docker compose up --build web-dev config-api arelon-api
```

Produção (Nginx):

```bash
docker compose up --build --force-recreate web-prod config-api arelon-api
```

Mais detalhes: `docs/DOCKER-TIZEN.md`.

## Fluxos principais

### Login usuário comum

- Acessa `/login`
- Informa apenas `username` e `password`
- Servidor ativo é aplicado automaticamente pelo sistema

### Login Admin Master

- Acessa a mesma tela de login do app
- Credenciais Master devem ser configuradas por ambiente:
  - `VITE_MASTER_USERNAME`
  - `VITE_MASTER_PASSWORD`
- Ao apertar `Pronto` no campo de senha com essas credenciais, o app abre a página Admin Master
- Admin configura servidor IPTV, ativa integração e valida conexão
- Configurações de servidor/ativo/player do Master são persistidas na API compartilhada e reaproveitadas por outros usuários/dispositivos

### Proxy Xtream

- O frontend React/Tizen chama somente a API Arelon para login, categorias, listas, EPG e detalhes.
- Em modo local/TV, `VITE_ARELON_API_BASE_URL=.` faz a TV chamar `/api/xtream` no mesmo host do app; o Vite/Nginx repassa para o proxy Node.
- Em produção hosted, use `VITE_ARELON_API_BASE_URLS` para informar uma lista separada por vírgula, por exemplo `.,https://api.arelon.com.br`.
- A API Arelon chama os servidores Xtream HTTP permitidos, aplica cache em memoria com TTL (`XTREAM_CACHE_TTL_SECONDS`) e pagina listas com `page`, `limit`, `categoryId` e `search`.
- Streams HTTP podem continuar sendo tocados diretamente no app Samsung Tizen quando o WebView aceitar. Em navegador HTTPS, o player mostra aviso tecnico quando o browser bloquear o stream por mixed content.

## Configuração de servidor (Admin)

Campos suportados:

- Nome
- Base URL
- Tipo: `Xtream`, `M3U/M3U8`, `Manifest`
- Playlist URL opcional (M3U) com placeholders `{username}` e `{password}`
- Manifestos opcionais no formato:
  - `Título|https://url/stream.m3u8|live`
  - múltiplos por vírgula ou quebra de linha
- Limite de streams para Multi-View por servidor

## Observações de segurança

- Senhas/tokens mascarados em logs
- Rotas admin protegidas por sessão master
- Validação de URL de playback (somente HTTP/HTTPS)
- Credenciais IPTV de usuário não são persistidas em `localStorage`; ficam apenas em memória durante a sessão
- O cache local do Master não grava senha de conta de teste IPTV

## Observações para Samsung Tizen

- Multi-View usa fallback de capacidade (limite configurável + limite conservador para Tizen)
- Player usa HTML5 + HLS.js + DASH.js com tratamento de erros
- Navegação por setas/enter/back implementada com foco espacial
- Teclas remotas Samsung registradas via `tizen.tvinputdevice` quando disponível
- `config.xml` Tizen pronto em `tizen/config.xml`
- Em app empacotado Tizen (`file://`), o app usa `HashRouter` automaticamente para abrir igual na TV e mantém `BrowserRouter` no site
- `vetraio-runtime-config.json` é mantido como arquivo técnico de compatibilidade e permite que o pacote Tizen use o mesmo endpoint compartilhado do deploy web

## Estrutura

Veja `docs/TECHNICAL_PLAN.md` para arquitetura completa por camadas e decisões técnicas.
