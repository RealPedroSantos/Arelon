# NewsMeter Brasil

O NewsMeter Brasil é o módulo interno de medição de utilização dos canais de notícias dentro do Arelon. **Os indicadores não representam a audiência total da televisão brasileira** e não utilizam nome, logotipo, metodologia proprietária ou identidade visual de empresas de medição de audiência.

## Arquitetura encontrada e integração

O Arelon utiliza React 19, TypeScript, Vite, Zustand, HLS.js/DASH.js, APIs serverless na Vercel, Zod e Vitest. O player principal utiliza um elemento de vídeo compartilhado e o catálogo mantém o identificador externo do stream em `MediaItem.id`.

O módulo foi integrado sem modificar o fluxo de catálogo ou a lógica de reprodução:

```text
AppWithNewsMeter
├── App existente
├── useAudienceTelemetry
│   └── observa currentMedia + elemento de vídeo compartilhado
└── NewsMeterDashboard (somente Admin Master)

Player → POST /api/audience/events|heartbeat
       → HMAC do identificador anônimo no servidor
       → RPC newsmeter_ingest_event
       → eventos brutos + sessões + erros + transições
       → jobs por minuto/hora
       → REST/RPC histórico e audiência ao vivo
       → painel / exportações CSV, XLSX e PDF
```

## Identidade canônica

A interface, o stream e o EPG não são associados por nomes parecidos. A relação correta é:

```text
channels.id
  ↕ channels.stream_id ou streams.external_stream_id
streams.channel_id
  ↕ channels.epg_source_id + channels.epg_channel_id
programs.channel_id + start_time <= evento < end_time
```

A função `newsmeter_validate_channel_mapping(channel_id)` verifica ausência de stream, ausência de EPG, duplicação e incompatibilidade declarada de país/idioma. CNN Brasil e CNN International possuem registros canônicos distintos.

## Eventos e sessões

O cliente envia `app_opened`, `player_opened`, `playback_requested`, `playback_started`, `playback_paused`, `playback_resumed`, `playback_buffering`, `playback_recovered`, `heartbeat`, `channel_changed`, `playback_stopped`, `playback_failed`, `app_backgrounded` e `app_closed`.

O heartbeat é emitido a cada 15 segundos somente quando o vídeo está visível, reproduzindo, com dados futuros disponíveis e sem buffering. Uma sessão é considerada ativa após 30 segundos válidos e enquanto o heartbeat tiver menos de 45 segundos. Pausa e buffering são descontados do tempo válido. A sessão é encerrada por fechamento, erro definitivo, troca ou expiração.

Eventos com o mesmo `event_id` são idempotentes. O mesmo dispositivo não pode manter duas sessões abertas; uma sobreposição é encerrada e sinalizada. Dispositivos de teste ou excluídos geram `is_test_session=true` e não entram nos indicadores.

## Troca de canais

Uma transição só é registrada quando:

1. houve evento `channel_changed`;
2. a sessão anterior terminou;
3. outro canal iniciou no mesmo dispositivo anônimo;
4. o início ocorreu em até cinco minutos;
5. origem e destino são canais canônicos diferentes.

Fechamento, falha, expiração ou retorno ao menu sem início de outro canal não produzem transição.

## Fórmulas

- **Espectadores ativos:** dispositivos anônimos distintos com pelo menos 30 segundos válidos, sessão aberta e heartbeat inferior a 45 segundos.
- **Share:** `ativos do canal / ativos em canais de notícias × 100`.
- **Índice interno:** `ativos do canal / dispositivos elegíveis ativos do aplicativo × 100`.
- **Audiência média por minuto:** `segundos válidos do período / segundos do período`.
- **Pico:** maior simultaneidade no período.
- **Tempo médio:** `segundos válidos / sessões válidas`.
- **Retenção:** sessões que alcançaram 1, 5, 15, 30 e 60 minutos divididas pelas sessões válidas.
- **Abandono:** sessões encerradas antes de 60 segundos divididas pelas sessões válidas.
- **Taxa de troca:** sessões com transição confirmada divididas pelas saídas do canal.
- **Ganho líquido:** entradas menos saídas.

O índice de saúde começa em 100 e desconta penalidades configuráveis para falhas de inicialização (30), taxa de erro (25), proporção de buffering (25), primeiro frame (10) e quedas (10). Os pesos ficam em `audience_settings.stream_health_weights`.

## Banco e retenção

A migration cria:

`channels`, `streams`, `epg_sources`, `programs`, `audience_events`, `audience_sessions`, `audience_minute_aggregates`, `audience_hourly_aggregates`, `channel_transitions`, `playback_errors`, `stream_health`, `excluded_devices`, `admin_users`, `audit_logs` e `audience_settings`.

`audience_events` usa chave primária idempotente, índices compostos e índice BRIN por data para grande volume. Eventos brutos e agregados são separados, e a agregação pode ser removida e refeita por minuto.

Retenção padrão:

- eventos brutos: 30 dias;
- sessões detalhadas: 90 dias;
- agregados anônimos: configurável.

A função `newsmeter_apply_retention()` aplica os períodos. `newsmeter_delete_device()` exclui os registros vinculados a um identificador anônimo.

## Privacidade e segurança

O navegador cria um token aleatório local. O token bruto nunca é persistido no banco: a API transforma o valor em HMAC-SHA-256 usando `NEWSMETER_DEVICE_HMAC_SECRET`. Não são coletados nome, e-mail, telefone ou IP completo, e o sistema não cria perfil político ou ideológico.

Todas as tabelas têm RLS habilitado e acesso direto de `anon`/`authenticated` revogado. A API serverless usa apenas `SUPABASE_SERVICE_ROLE_KEY`, que nunca pode ser exposta em variável `VITE_*`. Consultas administrativas exigem `NEWSMETER_ADMIN_TOKEN`. O consentimento de telemetria não essencial e a versão da política são registrados no dispositivo/evento.

## Variáveis de ambiente

```bash
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=segredo-servidor
NEWSMETER_DEVICE_HMAC_SECRET=segredo-aleatorio-longo
NEWSMETER_ADMIN_TOKEN=token-administrativo-longo
NEWSMETER_ALLOW_SIMULATION=false
VITE_APP_VERSION=1.0.10
```

Não prefixe segredos com `VITE_`.

## Instalação e execução local

```bash
npm ci
supabase --version
supabase db push
npm run dev
```

Na Vercel, cadastre as variáveis para Production, Preview e Development conforme necessário. Aplique a migration no projeto Supabase destinado ao Arelon antes do primeiro evento.

## Jobs

Quando `pg_cron` está disponível, a migration agenda:

- expiração e agregação por minuto;
- agregação horária aos cinco minutos;
- retenção diária às 03:25.

Sem `pg_cron`, execute as mesmas funções via Vercel Cron ou outro agendador autorizado.

## EPG

Cadastre uma fonte autorizada em `epg_sources`, associe `channels.epg_source_id` e `channels.epg_channel_id`, e grave programas em `programs`. A resolução usa `channel_id` e intervalo de tempo; títulos nunca são usados como chave. Para EPG recebido depois, execute:

```sql
select public.newsmeter_reprocess_programs('2026-07-19 00:00:00-03', '2026-07-20 00:00:00-03');
```

## Streams

Nenhuma URL foi incluída na migration. Cadastre somente fontes autorizadas na tela administrativa ou diretamente em `streams`, mantendo `external_stream_id` igual ao identificador usado pelo catálogo/player. Marque `is_authorized=true` somente após validação de direitos.

## API

Públicos para coleta:

- `POST /api/audience/events`
- `POST /api/audience/heartbeat`

Protegidos por Bearer token:

- `GET /api/audience/live`
- `GET /api/audience/ranking`
- `GET /api/audience/channels/:channelId`
- `GET /api/audience/programs/:programId`
- `GET /api/audience/history`
- `GET /api/audience/transitions`
- `GET /api/audience/technical-health`
- `GET /api/audience/export`
- `GET|POST /api/admin/channels`
- `PATCH /api/admin/channels/:channelId`
- `POST /api/admin/channels/:channelId/validate-mapping`

O endpoint de simulação só funciona fora de produção, salvo habilitação explícita, e sempre cria sessões de teste.

## Testes e validação

```bash
npm run lint
npx tsc -b --pretty false
npm test
npm run build
```

Os testes cobrem fórmulas, início, heartbeat, expiração, pausa, buffering, troca, fechamento, reconexão, duplicidade, dois dispositivos, sobreposição, EPG presente/ausente, distinção Brasil/internacional, reprocessamento, exclusão de teste e contratos de mapeamento.

## Checklist de validação canal → stream → EPG

1. `canonical_key` é único e permanente.
2. `channels.stream_id` ou `streams.external_stream_id` coincide exatamente com `MediaItem.id`.
3. O stream possui país e idioma compatíveis.
4. O EPG está associado à mesma linha de `channels`.
5. O programa existe no intervalo do evento.
6. `newsmeter_validate_channel_mapping(id)` retorna `valid=true`.
7. Um teste real confirma que nome exibido, vídeo reproduzido e programa atual pertencem ao mesmo `channel_id`.
