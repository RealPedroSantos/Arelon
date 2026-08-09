create or replace function public.newsmeter_live_snapshot()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare result jsonb;
begin
  with active as (
    select
      c.id as channel_id, c.canonical_key, c.name as channel_name, c.logo_url,
      s.program_id, p.title as program_title,
      count(distinct s.anonymous_device_id)::integer as active_viewers,
      coalesce(avg(s.valid_watch_seconds),0) as average_watch_time
    from public.channels c
    left join public.audience_sessions s on s.channel_id = c.id
      and s.ended_at is null
      and s.started_at <= now() - interval '30 seconds'
      and s.last_heartbeat_at >= now() - interval '45 seconds'
      and not s.is_test_session
    left join public.programs p on p.id = s.program_id
    where c.is_active and c.category in ('news','international-news')
    group by c.id, c.canonical_key, c.name, c.logo_url, s.program_id, p.title
  ), channel_active as (
    select channel_id, canonical_key, channel_name, logo_url,
      max(program_id::text)::uuid as program_id,
      max(program_title) as program_title,
      sum(active_viewers)::integer as active_viewers,
      max(average_watch_time) as average_watch_time
    from active group by channel_id, canonical_key, channel_name, logo_url
  ), totals as (
    select coalesce(sum(active_viewers),0)::numeric as total from channel_active
  ), ranked as (
    select
      row_number() over (order by ca.active_viewers desc, ca.channel_name)::integer as position,
      ca.*,
      case when t.total = 0 then 0 else round(ca.active_viewers::numeric / t.total * 100, 4) end as share,
      case when eligible.total = 0 then 0 else round(ca.active_viewers::numeric / eligible.total * 100, 4) end as internal_rating,
      coalesce((
        select case when old.active_viewers = 0 then case when ca.active_viewers > 0 then 100 else 0 end
          else round((ca.active_viewers - old.active_viewers)::numeric / old.active_viewers * 100, 2) end
        from public.audience_minute_aggregates old
        where old.channel_id = ca.channel_id and old.minute_timestamp <= date_trunc('minute', now() - interval '5 minutes')
        order by old.minute_timestamp desc limit 1
      ),0) as variation_5m,
      coalesce((select sh.status from public.stream_health sh where sh.channel_id = ca.channel_id order by sh.bucket_timestamp desc limit 1),'unknown') as stream_state,
      ca.program_id is not null as epg_available
    from channel_active ca cross join totals t
    cross join lateral (
      select count(distinct e.anonymous_device_id)::numeric as total
      from public.audience_events e
      where e.event_timestamp >= now() - interval '5 minutes' and not e.is_test_event
    ) eligible
  ), summary as (
    select jsonb_build_object(
      'active_viewers_now', coalesce((select sum(active_viewers) from ranked),0),
      'total_news_viewers', coalesce((select sum(active_viewers) from ranked),0),
      'leader', (select channel_name from ranked order by position limit 1),
      'leader_share', coalesce((select share from ranked order by position limit 1),0),
      'day_peak', coalesce((select max(total_minute) from (
        select minute_timestamp, sum(active_viewers) total_minute from public.audience_minute_aggregates
        where minute_timestamp >= date_trunc('day', now()) group by minute_timestamp
      ) peaks),0),
      'sessions_today', (select count(*) from public.audience_sessions where started_at >= date_trunc('day', now()) and not is_test_session),
      'generated_at', now()
    ) data
  ), trend as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'minute_timestamp', a.minute_timestamp,
      'channel_id', a.channel_id,
      'channel_name', c.name,
      'active_viewers', a.active_viewers,
      'share', a.share
    ) order by a.minute_timestamp), '[]'::jsonb) data
    from public.audience_minute_aggregates a join public.channels c on c.id = a.channel_id
    where a.minute_timestamp >= now() - interval '60 minutes'
  ), platforms as (
    select coalesce(jsonb_agg(jsonb_build_object('label', platform, 'value', viewers) order by viewers desc), '[]'::jsonb) data
    from (
      select coalesce(platform,'unknown') platform, count(distinct anonymous_device_id)::integer viewers
      from public.audience_sessions
      where started_at >= now() - interval '24 hours' and not is_test_session
      group by platform
    ) x
  ), versions as (
    select coalesce(jsonb_agg(jsonb_build_object('label', app_version, 'value', viewers) order by viewers desc), '[]'::jsonb) data
    from (
      select coalesce(app_version,'unknown') app_version, count(distinct anonymous_device_id)::integer viewers
      from public.audience_sessions
      where started_at >= now() - interval '24 hours' and not is_test_session
      group by app_version
    ) x
  )
  select jsonb_build_object(
    'summary', (select data from summary),
    'ranking', coalesce((select jsonb_agg(to_jsonb(r) order by position) from ranked r), '[]'::jsonb),
    'trend', (select data from trend),
    'platforms', (select data from platforms),
    'versions', (select data from versions)
  ) into result;
  return result;
end;
$$;

create or replace function public.newsmeter_transition_matrix(from_timestamp timestamptz)
returns table (
  from_channel_id uuid,
  from_channel_name text,
  to_channel_id uuid,
  to_channel_name text,
  transition_count bigint
)
language sql
stable
set search_path = public
as $$
  select t.from_channel_id, f.name, t.to_channel_id, d.name, count(*)
  from public.channel_transitions t
  join public.channels f on f.id = t.from_channel_id
  join public.channels d on d.id = t.to_channel_id
  where t.transitioned_at >= from_timestamp and not t.is_test_transition
  group by t.from_channel_id, f.name, t.to_channel_id, d.name
  order by count(*) desc;
$$;

create or replace function public.newsmeter_technical_health(from_timestamp timestamptz)
returns table (
  channel_id uuid,
  channel_name text,
  attempts bigint,
  starts bigint,
  startup_failures bigint,
  first_frame_ms numeric,
  buffering_count bigint,
  buffering_seconds numeric,
  error_rate numeric,
  stream_drops bigint,
  sessions_ended_by_error bigint,
  health_index numeric,
  status text
)
language sql
stable
set search_path = public
as $$
  with event_metrics as (
    select e.channel_id,
      count(*) filter (where e.event_type = 'playback_requested')::bigint attempts,
      count(*) filter (where e.event_type = 'playback_started')::bigint starts,
      count(*) filter (where e.event_type = 'playback_buffering')::bigint buffering_count,
      coalesce(sum(e.buffering_duration) filter (where e.event_type = 'playback_recovered'),0)::numeric buffering_seconds
    from public.audience_events e
    where e.event_timestamp >= from_timestamp and not e.is_test_event and e.channel_id is not null
    group by e.channel_id
  ), error_metrics as (
    select pe.channel_id,
      count(*)::bigint playback_errors,
      count(*) filter (where pe.is_startup_failure)::bigint startup_failures
    from public.playback_errors pe
    where pe.occurred_at >= from_timestamp and not pe.is_test_error and pe.channel_id is not null
    group by pe.channel_id
  ), session_metrics as (
    select s.channel_id,
      coalesce(avg(s.first_frame_ms),0)::numeric first_frame_ms,
      count(*) filter (where s.end_reason in ('playback_failed','heartbeat_timeout'))::bigint stream_drops,
      count(*) filter (where s.end_reason = 'playback_failed')::bigint sessions_ended_by_error
    from public.audience_sessions s
    where s.started_at >= from_timestamp and not s.is_test_session and s.channel_id is not null
    group by s.channel_id
  ), metrics as (
    select c.id channel_id, c.name channel_name,
      coalesce(ev.attempts,0)::bigint attempts,
      coalesce(ev.starts,0)::bigint starts,
      coalesce(er.startup_failures,0)::bigint startup_failures,
      coalesce(se.first_frame_ms,0)::numeric first_frame_ms,
      coalesce(ev.buffering_count,0)::bigint buffering_count,
      coalesce(ev.buffering_seconds,0)::numeric buffering_seconds,
      coalesce(er.playback_errors,0)::bigint playback_errors,
      coalesce(se.stream_drops,0)::bigint stream_drops,
      coalesce(se.sessions_ended_by_error,0)::bigint sessions_ended_by_error
    from public.channels c
    left join event_metrics ev on ev.channel_id = c.id
    left join error_metrics er on er.channel_id = c.id
    left join session_metrics se on se.channel_id = c.id
    where c.is_active and c.category in ('news','international-news')
  ), scored as (
    select m.*,
      case when attempts = 0 then 0 else round(playback_errors::numeric / attempts * 100,2) end error_rate,
      greatest(0, least(100,
        100
        - case when attempts = 0 then 0 else startup_failures::numeric / attempts * 30 end
        - case when attempts = 0 then 0 else playback_errors::numeric / attempts * 25 end
        - least(25, buffering_seconds / greatest(starts,1) / 60 * 25)
        - least(10, first_frame_ms / 10000 * 10)
        - case when starts = 0 then 0 else stream_drops::numeric / starts * 10 end
      )) health_index
    from metrics m
  )
  select s.channel_id, s.channel_name, s.attempts, s.starts, s.startup_failures, s.first_frame_ms,
    s.buffering_count, s.buffering_seconds, s.error_rate, s.stream_drops, s.sessions_ended_by_error,
    round(s.health_index,2),
    case when s.attempts = 0 then 'unknown' when s.health_index < 40 then 'unavailable' when s.health_index < 75 then 'buffering_high' else 'normal' end
  from scored s order by s.health_index asc, s.channel_name;
$$;

create or replace function public.newsmeter_validate_channel_mapping(target_channel_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  target public.channels%rowtype;
  issues text[] := '{}'::text[];
  stream_count integer;
  incompatible_count integer;
begin
  select * into target from public.channels where id = target_channel_id;
  if not found then return jsonb_build_object('valid', false, 'issues', array['Canal não encontrado.']); end if;

  select count(*) into stream_count from public.streams where channel_id = target.id and is_active;
  select count(*) into incompatible_count from public.streams
    where channel_id = target.id and is_active and (
      (declared_country is not null and declared_country <> target.country) or
      (declared_language is not null and declared_language <> target.language)
    );

  if target.stream_id is null and stream_count = 0 then issues := array_append(issues, 'Nenhum stream foi mapeado.'); end if;
  if target.epg_channel_id is null then issues := array_append(issues, 'EPG não foi mapeado.'); end if;
  if incompatible_count > 0 then issues := array_append(issues, 'Há stream com país ou idioma incompatível com o canal.'); end if;
  if exists (
    select 1 from public.channels other
    where other.id <> target.id and (
      (target.stream_id is not null and other.stream_id = target.stream_id) or
      (target.epg_source_id is not null and target.epg_channel_id is not null and other.epg_source_id = target.epg_source_id and other.epg_channel_id = target.epg_channel_id)
    )
  ) then issues := array_append(issues, 'Stream ou EPG também está associado a outro canal.'); end if;

  update public.channels set
    mapping_status = case when cardinality(issues) = 0 then 'valid' else 'invalid' end,
    mapping_checked_at = now()
  where id = target.id;

  return jsonb_build_object('valid', cardinality(issues) = 0, 'issues', to_jsonb(issues));
end;
$$;

create or replace function public.newsmeter_reprocess_programs(from_timestamp timestamptz, to_timestamp timestamptz)
returns integer
language plpgsql
set search_path = public
as $$
declare affected integer;
begin
  update public.audience_sessions s set program_id = public.newsmeter_resolve_program(s.channel_id, s.started_at)
  where s.started_at >= from_timestamp and s.started_at < to_timestamp and s.program_id is null and s.channel_id is not null;
  get diagnostics affected = row_count;
  update public.audience_events e set program_id = public.newsmeter_resolve_program(e.channel_id, e.event_timestamp)
  where e.event_timestamp >= from_timestamp and e.event_timestamp < to_timestamp and e.program_id is null and e.channel_id is not null;
  return affected;
end;
$$;

create or replace function public.newsmeter_delete_device(target_anonymous_device_id text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare event_count bigint; session_count bigint;
begin
  select count(*) into event_count from public.audience_events where anonymous_device_id = target_anonymous_device_id;
  select count(*) into session_count from public.audience_sessions where anonymous_device_id = target_anonymous_device_id;
  delete from public.channel_transitions where anonymous_device_id = target_anonymous_device_id;
  delete from public.playback_errors where anonymous_device_id = target_anonymous_device_id;
  delete from public.audience_events where anonymous_device_id = target_anonymous_device_id;
  delete from public.audience_sessions where anonymous_device_id = target_anonymous_device_id;
  delete from public.excluded_devices where anonymous_device_id = target_anonymous_device_id;
  return jsonb_build_object('events_deleted', event_count, 'sessions_deleted', session_count);
end;
$$;

create or replace function public.newsmeter_apply_retention()
returns jsonb
language plpgsql
set search_path = public
as $$
declare raw_days integer := 30; session_days integer := 90; raw_deleted bigint; sessions_deleted bigint;
begin
  select coalesce((value #>> '{}')::integer,30) into raw_days from public.audience_settings where key = 'raw_event_retention_days';
  select coalesce((value #>> '{}')::integer,90) into session_days from public.audience_settings where key = 'session_retention_days';
  delete from public.audience_events where event_timestamp < now() - make_interval(days => raw_days);
  get diagnostics raw_deleted = row_count;
  delete from public.audience_sessions where ended_at < now() - make_interval(days => session_days);
  get diagnostics sessions_deleted = row_count;
  return jsonb_build_object('events_deleted',raw_deleted,'sessions_deleted',sessions_deleted);
end;
$$;

create or replace function public.newsmeter_simulate(viewers integer default 40, duration_minutes integer default 10)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  channel_ids uuid[];
  i integer;
  selected uuid;
  session_key text;
  start_at timestamptz;
begin
  select array_agg(id order by canonical_key) into channel_ids from public.channels where category = 'news' and is_active;
  if coalesce(array_length(channel_ids,1),0) = 0 then raise exception 'Nenhum canal ativo para simulação'; end if;
  viewers := greatest(1, least(viewers,500));
  duration_minutes := greatest(1, least(duration_minutes,120));
  for i in 1..viewers loop
    selected := channel_ids[1 + floor(random() * array_length(channel_ids,1))::integer];
    session_key := 'simulation-' || gen_random_uuid()::text;
    start_at := now() - make_interval(mins => floor(random() * duration_minutes)::integer);
    insert into public.audience_sessions (
      id, anonymous_device_id, channel_id, started_at, last_heartbeat_at, valid_watch_seconds,
      platform, app_version, is_test_session
    ) values (
      session_key, encode(digest('sim-' || i::text || clock_timestamp()::text,'sha256'),'hex'), selected,
      start_at, now(), greatest(30, extract(epoch from now() - start_at)::integer),
      case when i % 3 = 0 then 'samsung-tizen' when i % 3 = 1 then 'apple-tv' else 'web' end,
      'simulation', true
    );
  end loop;
  return jsonb_build_object('sessions_created',viewers,'is_test',true);
end;
$$;

-- RLS: as tabelas ficam inacessíveis diretamente ao cliente. A API usa service_role.
do $$
declare target text;
begin
  foreach target in array array[
    'epg_sources','channels','streams','programs','excluded_devices','audience_events',
    'audience_sessions','audience_minute_aggregates','audience_hourly_aggregates',
    'channel_transitions','playback_errors','stream_health','admin_users','audit_logs','audience_settings'
  ] loop
    execute format('alter table public.%I enable row level security', target);
    execute format('revoke all on table public.%I from anon, authenticated', target);
    execute format('grant select, insert, update, delete on table public.%I to service_role', target);
  end loop;
end $$;

revoke all on function public.newsmeter_ingest_event(jsonb) from public, anon, authenticated;
revoke all on function public.newsmeter_live_snapshot() from public, anon, authenticated;
revoke all on function public.newsmeter_transition_matrix(timestamptz) from public, anon, authenticated;
revoke all on function public.newsmeter_technical_health(timestamptz) from public, anon, authenticated;
revoke all on function public.newsmeter_validate_channel_mapping(uuid) from public, anon, authenticated;
revoke all on function public.newsmeter_simulate(integer,integer) from public, anon, authenticated;
grant usage, select on sequence public.channel_transitions_id_seq to service_role;
grant usage, select on sequence public.playback_errors_id_seq to service_role;
grant usage, select on sequence public.audit_logs_id_seq to service_role;

grant execute on function public.newsmeter_ingest_event(jsonb) to service_role;
grant execute on function public.newsmeter_live_snapshot() to service_role;
grant execute on function public.newsmeter_transition_matrix(timestamptz) to service_role;
grant execute on function public.newsmeter_technical_health(timestamptz) to service_role;
grant execute on function public.newsmeter_validate_channel_mapping(uuid) to service_role;
grant execute on function public.newsmeter_simulate(integer,integer) to service_role;
grant execute on function public.newsmeter_expire_sessions() to service_role;
grant execute on function public.newsmeter_aggregate_minute(timestamptz) to service_role;
grant execute on function public.newsmeter_aggregate_hour(timestamptz) to service_role;
grant execute on function public.newsmeter_reprocess_programs(timestamptz,timestamptz) to service_role;
grant execute on function public.newsmeter_delete_device(text) to service_role;
grant execute on function public.newsmeter_apply_retention() to service_role;

-- Agenda os jobs quando pg_cron estiver disponível. Em instalações sem pg_cron,
-- os mesmos comandos podem ser chamados pelo agendador da plataforma.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('newsmeter-expire-sessions', '* * * * *', 'select public.newsmeter_expire_sessions()');
    perform cron.schedule('newsmeter-minute-aggregate', '* * * * *', 'select public.newsmeter_aggregate_minute()');
    perform cron.schedule('newsmeter-hour-aggregate', '5 * * * *', 'select public.newsmeter_aggregate_hour()');
    perform cron.schedule('newsmeter-retention', '25 3 * * *', 'select public.newsmeter_apply_retention()');
  end if;
exception when others then
  raise notice 'pg_cron não configurado: %', sqlerrm;
end $$;
