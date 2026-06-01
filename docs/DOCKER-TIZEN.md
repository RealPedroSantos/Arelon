# Docker e Empacotamento Samsung Tizen

## 1) Rodar no navegador via Docker (dev)

```bash
docker compose up --build web-dev
```

Acesse: `http://localhost:5175`

## 2) Rodar build de produção via Docker

```bash
docker compose up --build --force-recreate web-prod
```

Acesse: `http://localhost:8080`

## 3) Gerar app no formato Samsung Tizen (.wgt)

```bash
npm run package:tizen
```

Para o app Samsung empacotado (`file://`) compartilhar o mesmo Master usado pelo navegador, gere com o endpoint absoluto do deploy web:

```bash
VITE_TV_SHARED_CONFIG_ENDPOINT=http://SEU_IP:8080/api/admin/shared-config npm run package:tizen
```

Se usar o script direto para instalar na TV, ele faz essa escolha automaticamente:

```bash
docker compose up -d --build web-prod config-api
./deploy-tv.sh
```

Arquivos gerados:

- `build/tizen-app/` (conteúdo da app pronto para widget)
- `build/packages/vetraio-iptv-unsigned.wgt`
- `build/tizen-app/vetraio-runtime-config.json` (endpoint compartilhado usado pelo pacote Tizen)

## 4) Instalação na TV Samsung

1. Assinar o `.wgt` com certificado Samsung TV no Tizen Studio.
2. Ativar modo desenvolvedor na TV.
3. Emparelhar com `sdb`.
4. Instalar pacote:

```bash
sdb install build/packages/<seu-arquivo-assinado>.wgt
```

## 5) Observações importantes

- O pacote gerado neste fluxo é `unsigned` (não assinado).
- TVs Samsung exigem assinatura válida para instalação.
- O `config.xml` da app está em `tizen/config.xml`.
