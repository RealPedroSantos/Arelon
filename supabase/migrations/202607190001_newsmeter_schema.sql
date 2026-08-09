-- NewsMeter Brasil
-- Medição interna e anônima de utilização do aplicativo. Não representa a
-- audiência total da televisão brasileira.

create extension if not exists pgcrypto;

create or replace function public.newsmeter_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.epg_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  source_type text not null default 'xmltv',
  source_url text,
  timezone text not null default 'America/Sao_Paulo',
  is_authorized boolean not null default false,
  is_active boolean not null default true,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique check (canonical_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  country char(2) not null default 'BR',
  language text not null default 'pt-BR',
  category text not null default 'news',
  logo_url text,
  stream_id text unique,
  epg_channel_id text,
  epg_source_id uuid references public.epg_sources(id) on delete set null,
  source_provider text,
  is_active boolean not null default true,
  mapping_status text not null default 'unmapped' check (mapping_status in ('unmapped','valid','invalid','warning')),
  mapping_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (epg_source_id, epg_channel_id)
);

create table if not exists public.streams (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  external_stream_id text not null unique,
  source_provider text,
  stream_url text,
  cdn text,
  declared_country char(2),
  declared_language text,
  quality_label text,
  resolution_width integer,
  resolution_height integer,
  is_authorized boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  epg_program_id text not null,
  title text not null,
  description text,
  category text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  image_url text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time),
  unique (channel_id, epg_program_id, start_time)
);

create table if not exists public.excluded_devices (
  anonymous_device_id text primary key,
  reason text not null,
  exclusion_type text not null default 'test' check (exclusion_type in ('test','internal','automated','fraud','privacy_request')),
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.audience_events (
  event_id text primary key,
  event_type text not null check (event_type in (
    'app_opened','player_opened','playback_requested','playback_started','playback_paused',
    'playback_resumed','playback_buffering','playback_recovered','heartbeat','channel_changed',
    'playback_stopped','playback_failed','app_backgrounded','app_closed','session_expired'
  )),
  session_id text not null,
  anonymous_device_id text not null,
  channel_id uuid references public.channels(id) on delete set null,
  program_id uuid references public.programs(id) on delete set null,
  stream_id text,
  event_timestamp timestamptz not null,
  received_at timestamptz not null default now(),
  playback_position numeric(14,3),
  player_state text,
  app_version text,
  platform text,
  country char(2),
  state text,
  network_type text,
  error_code text,
  buffering_duration numeric(14,3),
  previous_channel_id uuid references public.channels(id) on delete set null,
  is_late_event boolean not null default false,
  ingest_delay_seconds integer not null default 0,
  is_test_event boolean not null default false,
  accepted_policy_version text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.audience_sessions (
  id text primary key,
  anonymous_device_id text not null,
  channel_id uuid references public.channels(id) on delete set null,
  program_id uuid references public.programs(id) on delete set null,
  stream_id text,
  started_at timestamptz not null,
  ended_at timestamptz,
  last_heartbeat_at timestamptz,
  valid_watch_seconds integer not null default 0 check (valid_watch_seconds >= 0),
  buffering_seconds numeric(14,3) not null default 0 check (buffering_seconds >= 0),
  pause_seconds numeric(14,3) not null default 0 check (pause_seconds >= 0),
  buffering_started_at timestamptz,
  pause_started_at timestamptz,
  first_frame_ms integer,
  end_reason text,
  previous_channel_id uuid references public.channels(id) on delete set null,
  next_channel_id uuid references public.channels(id) on delete set null,
  platform text,
  app_version text,
  country char(2),
  state text,
  network_type text,
  quality_label text,
  resolution text,
  cdn text,
  is_test_session boolean not null default false,
  anomaly_flags text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

create table if not exists public.audience_minute_aggregates (
  minute_timestamp timestamptz not null,
  channel_id uuid not null references public.channels(id) on delete cascade,
  program_id uuid references public.programs(id) on delete set null,
  active_viewers integer not null default 0,
  unique_viewers integer not null default 0,
  valid_watch_seconds bigint not null default 0,
  sessions_started integer not null default 0,
  sessions_ended integer not null default 0,
  channel_entries integer not null default 0,
  channel_exits integer not null default 0,
  average_watch_time numeric(14,3) not null default 0,
  buffering_seconds numeric(14,3) not null default 0,
  playback_errors integer not null default 0,
  share numeric(9,4) not null default 0,
  internal_rating numeric(9,4) not null default 0,
  peak_concurrent integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (minute_timestamp, channel_id)
);

create table if not exists public.audience_hourly_aggregates (
  hour_timestamp timestamptz not null,
  channel_id uuid not null references public.channels(id) on delete cascade,
  average_minute_audience numeric(14,3) not null default 0,
  peak_concurrent integer not null default 0,
  unique_viewers integer not null default 0,
  valid_watch_seconds bigint not null default 0,
  sessions_started integer not null default 0,
  sessions_ended integer not null default 0,
  average_watch_time numeric(14,3) not null default 0,
  buffering_seconds numeric(14,3) not null default 0,
  playback_errors integer not null default 0,
  average_share numeric(9,4) not null default 0,
  average_internal_rating numeric(9,4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (hour_timestamp, channel_id)
);

create table if not exists public.channel_transitions (
  id bigint generated always as identity primary key,
  anonymous_device_id text not null,
  from_session_id text references public.audience_sessions(id) on delete set null,
  to_session_id text references public.audience_sessions(id) on delete set null,
  from_channel_id uuid not null references public.channels(id) on delete cascade,
  to_channel_id uuid not null references public.channels(id) on delete cascade,
  transitioned_at timestamptz not null,
  seconds_between integer not null,
  is_test_transition boolean not null default false,
  created_at timestamptz not null default now(),
  check (from_channel_id <> to_channel_id),
  check (seconds_between between 0 and 300),
  unique (anonymous_device_id, from_session_id, to_session_id)
);

create table if not exists public.playback_errors (
  id bigint generated always as identity primary key,
  event_id text unique references public.audience_events(event_id) on delete cascade,
  session_id text,
  anonymous_device_id text not null,
  channel_id uuid references public.channels(id) on delete set null,
  stream_id text,
  error_code text,
  player_state text,
  platform text,
  app_version text,
  occurred_at timestamptz not null,
  is_startup_failure boolean not null default false,
  is_test_error boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.stream_health (
  bucket_timestamp timestamptz not null,
  channel_id uuid not null references public.channels(id) on delete cascade,
  stream_id text,
  attempts integer not null default 0,
  starts integer not null default 0,
  startup_failures integer not null default 0,
  average_first_frame_ms numeric(14,3) not null default 0,
  buffering_count integer not null default 0,
  buffering_seconds numeric(14,3) not null default 0,
  playback_errors integer not null default 0,
  stream_drops integer not null default 0,
  sessions_ended_by_error integer not null default 0,
  health_index numeric(6,3) not null default 100,
  status text not null default 'normal' check (status in ('normal','buffering_high','unavailable','unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (bucket_timestamp, channel_id)
);

create table if not exists public.admin_users (
  user_id uuid primary key,
  role text not null default 'viewer' check (role in ('viewer','analyst','manager','admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  admin_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  request_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.audience_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create index if not exists audience_events_timestamp_idx on public.audience_events (event_timestamp desc);
create index if not exists audience_events_channel_timestamp_idx on public.audience_events (channel_id, event_timestamp desc);
create index if not exists audience_events_device_timestamp_idx on public.audience_events (anonymous_device_id, event_timestamp desc);
create index if not exists audience_events_session_timestamp_idx on public.audience_events (session_id, event_timestamp);
create index if not exists audience_events_program_timestamp_idx on public.audience_events (program_id, event_timestamp desc);
create index if not exists audience_events_type_timestamp_idx on public.audience_events (event_type, event_timestamp desc);
create index if not exists audience_events_brin_timestamp_idx on public.audience_events using brin (event_timestamp) with (pages_per_range = 64);
create index if not exists audience_sessions_started_idx on public.audience_sessions (started_at desc);
create index if not exists audience_sessions_ended_idx on public.audience_sessions (ended_at desc);
create index if not exists audience_sessions_live_idx on public.audience_sessions (channel_id, last_heartbeat_at desc) where ended_at is null and is_test_session = false;
create index if not exists audience_sessions_device_idx on public.audience_sessions (anonymous_device_id, started_at desc);
create index if not exists audience_sessions_program_idx on public.audience_sessions (program_id, started_at desc);
create index if not exists programs_schedule_idx on public.programs (channel_id, start_time, end_time);
create index if not exists transitions_time_idx on public.channel_transitions (transitioned_at desc);
create index if not exists transitions_matrix_idx on public.channel_transitions (from_channel_id, to_channel_id, transitioned_at desc);
create index if not exists playback_errors_time_idx on public.playback_errors (occurred_at desc);
create index if not exists playback_errors_channel_idx on public.playback_errors (channel_id, occurred_at desc);
create index if not exists minute_aggregates_channel_idx on public.audience_minute_aggregates (channel_id, minute_timestamp desc);
create index if not exists hourly_aggregates_channel_idx on public.audience_hourly_aggregates (channel_id, hour_timestamp desc);

do $$
declare target text;
begin
  foreach target in array array['epg_sources','channels','streams','programs','audience_sessions','audience_minute_aggregates','audience_hourly_aggregates','stream_health','admin_users']
  loop
    execute format('drop trigger if exists %I_touch_updated_at on public.%I', target, target);
    execute format('create trigger %I_touch_updated_at before update on public.%I for each row execute function public.newsmeter_touch_updated_at()', target, target);
  end loop;
end $$;

insert into public.audience_settings (key, value, description) values
  ('raw_event_retention_days', '30', 'Retenção dos eventos brutos em dias.'),
  ('session_retention_days', '90', 'Retenção das sessões detalhadas em dias.'),
  ('heartbeat_interval_seconds', '15', 'Intervalo esperado entre heartbeats.'),
  ('active_heartbeat_timeout_seconds', '45', 'Tempo sem heartbeat para expirar uma sessão.'),
  ('minimum_valid_watch_seconds', '30', 'Tempo mínimo para contar espectador ativo.'),
  ('transition_window_seconds', '300', 'Janela máxima para caracterizar troca de canal.'),
  ('stream_health_weights', '{"startup_failure":30,"error_rate":25,"buffering_ratio":25,"first_frame":10,"drop_rate":10}', 'Pesos configuráveis do índice de saúde de 0 a 100.')
on conflict (key) do nothing;

-- Registros iniciais editáveis, sem URLs de stream.
insert into public.channels (canonical_key, name, country, language, category, is_active, mapping_status) values
  ('news-globonews', 'GloboNews', 'BR', 'pt-BR', 'news', true, 'unmapped'),
  ('news-cnn-brasil', 'CNN Brasil', 'BR', 'pt-BR', 'news', true, 'unmapped'),
  ('news-bandnews', 'BandNews TV', 'BR', 'pt-BR', 'news', true, 'unmapped'),
  ('news-jovem-pan-news', 'Jovem Pan News', 'BR', 'pt-BR', 'news', true, 'unmapped'),
  ('news-record-news', 'Record News', 'BR', 'pt-BR', 'news', true, 'unmapped'),
  ('news-times-brasil', 'Times Brasil CNBC', 'BR', 'pt-BR', 'news', true, 'unmapped'),
  ('news-cnn-international', 'CNN International', 'US', 'en', 'international-news', false, 'unmapped')
on conflict (canonical_key) do update set
  name = excluded.name,
  country = excluded.country,
  language = excluded.language,
  category = excluded.category;
