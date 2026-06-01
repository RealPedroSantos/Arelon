# Plano Técnico

## 1) Objetivo

Implementar uma plataforma IPTV web para Smart TV (Samsung Tizen-ready) com:

- Login de usuário comum por usuário/senha
- Configuração de servidor exclusiva de Admin Master
- Suporte de integração Xtream, M3U/M3U8 e Manifest
- Home premium TV-first + navegação por controle remoto
- Live TV, Filmes, Séries, Favoritos, Busca e Multi-View

## 2) Arquitetura

```text
src/
  app/
    config/
    providers/
    routes/
  modules/
    auth/
    admin/
    home/
    live-tv/
    movies/
    series/
    player/
    multiview/
    favorites/
    search/
  shared/
    components/
    hooks/
    services/
    types/
    utils/
    constants/
    styles/
  infrastructure/
    iptv/
      adapters/
      parsers/
      normalizers/
      clients/
      factory/
    storage/
    logging/
    player/
  tests/
```

## 3) Decisões técnicas

- `IptvContentProvider` como interface única de conteúdo
- Adapters por origem: `XtreamAdapter`, `M3UAdapter`, `ManifestAdapter`
- Parser M3U resiliente a campos ausentes
- Normalização para modelos internos tipados
- Estado global minimalista com Zustand:
  - `useAuthStore`
  - `useCatalogStore`
  - `useUserDataStore`
  - `useMultiViewStore`
- Segurança por padrão:
  - rota admin protegida
  - mascaramento de dados sensíveis em logs
  - validação de URL de playback
- Player desacoplado da origem:
  - `PlayerService` com HLS/DASH/native
- Navegação remota:
  - `useSpatialNavigation` e `useRemoteControl`

## 4) Suposições

- Em produção, o ideal é ter backend/proxy para blindar credenciais e contornar CORS.
- Sem backend, credenciais de usuário são usadas no cliente para chamadas Xtream/M3U.
- Em alguns TVs, 3-4 streams simultâneos podem degradar ou falhar: fallback aplicado.

## 5) Limitações conhecidas

- AVPlay nativo Tizen não foi integrado nesta versão web pura.
- EPG está preparado por modelo, mas depende da disponibilidade na fonte.
- Catálogos muito grandes podem exigir paginação/virtualização adicional.

## 6) Recomendação de produção

Adicionar backend BFF/proxy:

- Frontend nunca recebe senha real do provedor
- BFF gerencia token de sessão e chamadas IPTV
- BFF aplica rate-limit, cache, auditoria e política CORS
- Logs centralizados com redaction obrigatória
