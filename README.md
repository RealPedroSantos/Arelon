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

4. (Opcional) para subir apenas a API de configuração compartilhada separadamente:

```bash
npm run config:api
```

5. Para build Samsung TV (`file://`) compartilhar o mesmo Master usado no navegador, use o endpoint HTTP absoluto do deploy web:

```bash
VITE_TV_SHARED_CONFIG_ENDPOINT=http://SEU_IP:8080/api/admin/shared-config
```

O script `./deploy-tv.sh` prefere automaticamente `http://SEU_IP:8080/api/admin/shared-config` quando o deploy web está rodando.

## Scripts

- `npm run dev`: sobe ambiente local (frontend + API de configuração compartilhada)
- `npm run config:api`: sobe API local de configuração compartilhada do Master
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
docker compose up --build web-dev config-api
```

Produção (Nginx):

```bash
docker compose up --build --force-recreate web-prod config-api
```

Mais detalhes: `docs/DOCKER-TIZEN.md`.

## Fluxos principais

### Login usuário comum

- Acessa `/login`
- Informa apenas `username` e `password`
- Servidor ativo é aplicado automaticamente pelo sistema

### Login Admin Master

- Acessa a mesma tela de login do app
- Credenciais Master:
  - usuário: `realpedrosantos`
  - senha: `21971926448`
- Ao apertar `Pronto` no campo de senha com essas credenciais, o app abre a página Admin Master
- Admin configura servidor IPTV, ativa integração e valida conexão
- Configurações de servidor/ativo/player do Master são persistidas na API compartilhada e reaproveitadas por outros usuários/dispositivos

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
- Credenciais de usuário não persistidas em texto puro no armazenamento local (ficam apenas em memória)

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
