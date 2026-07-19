create or replace function public.newsmeter_resolve_channel(target_channel_id uuid, target_stream_id text)
returns uuid
language sql
stable
set search_path = public
as $$
  with resolved as (
    select
      (select c.id from public.channels c where c.id = target_channel_id and c.is_active limit 1) as explicit_channel_id,
      coalesce(
        (select c.id from public.channels c where c.stream_id = target_stream_id and c.is_active limit 1),
        (select s.channel_id from public.streams s join public.channels c on c.id = s.channel_id
          where s.external_stream_id = target_stream_id and s.is_active and c.is_active limit 1)
      ) as stream_channel_id
  )
  select case
    when explicit_channel_id is not null and stream_channel_id is not null and explicit_channel_id <> stream_channel_id then null
    else coalesce(explicit_channel_id, stream_channel_id)
  end
  from resolved;
$$;

create or replace function public.newsmeter_resolve_program(target_channel_id uuid, target_timestamp timestamptz)
returns uuid
language sql
stable
set search_path = public
as $$
  select p.id
  from public.programs p
  where p.channel_id = target_channel_id
    and p.start_time <= target_timestamp
    and p.end_time > target_timestamp
  order by p.start_time desc
  limit 1;
$$;

create or replace function public.newsmeter_ingest_event(payload jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  event_identifier text := payload->>'event_id';
  event_kind text := payload->>'event_type';
  target_session_id text := payload->>'session_id';
  device_id text := payload->>'anonymous_device_id';
  target_stream_id text := nullif(payload->>'stream_id', '');
  target_channel_id uuid;
  target_program_id uuid;
  event_time timestamptz := (payload->>'timestamp')::timestamptz;
  excluded boolean := false;
  duplicate_event boolean := false;
  previous_id uuid;
  previous_session record;
  affected integer;
begin
  if event_identifier is null or event_kind is null or target_session_id is null or device_id is null then
    raise exception 'Evento incompleto';
  end if;

  target_channel_id := public.newsmeter_resolve_channel(nullif(payload->>'channel_id','')::uuid, target_stream_id);
  target_program_id := coalesce(nullif(payload->>'program_id','')::uuid, public.newsmeter_resolve_program(target_channel_id, event_time));

  select exists (
    select 1 from public.excluded_devices e
    where e.anonymous_device_id = device_id and (e.expires_at is null or e.expires_at > now())
  ) into excluded;

  insert into public.audience_events (
    event_id, event_type, session_id, anonymous_device_id, channel_id, program_id, stream_id,
    event_timestamp, playback_position, player_state, app_version, platform, country, state,
    network_type, error_code, buffering_duration, previous_channel_id, is_late_event,
    ingest_delay_seconds, is_test_event, accepted_policy_version, metadata
  ) values (
    event_identifier, event_kind, target_session_id, device_id, target_channel_id, target_program_id, target_stream_id,
    event_time, nullif(payload->>'playback_position','')::numeric, payload->>'player_state', payload->>'app_version',
    payload->>'platform', nullif(payload->>'country','')::char(2), payload->>'state', payload->>'network_type',
    payload->>'error_code', nullif(payload->>'buffering_duration','')::numeric,
    nullif(payload->>'previous_channel_id','')::uuid, coalesce((payload->>'is_late_event')::boolean, false),
    coalesce((payload->>'ingest_delay_seconds')::integer, 0), excluded,
    payload->>'accepted_policy_version', coalesce(payload->'metadata', '{}'::jsonb)
  ) on conflict (event_id) do nothing;

  get diagnostics affected = row_count;
  duplicate_event := affected = 0;
  if duplicate_event then
    return jsonb_build_object('accepted', true, 'duplicate', true, 'reason', 'event_id já processado');
  end if;

  if event_kind = 'playback_started' and target_channel_id is null then
    return jsonb_build_object(
      'accepted', false,
      'duplicate', false,
      'reason', 'stream não mapeado ou incompatível com o channel_id informado'
    );
  end if;

  if event_kind = 'playback_failed' then
    insert into public.playback_errors (
      event_id, session_id, anonymous_device_id, channel_id, stream_id, error_code,
      player_state, platform, app_version, occurred_at, is_startup_failure, is_test_error, metadata
    ) values (
      event_identifier, target_session_id, device_id, target_channel_id, target_stream_id, payload->>'error_code',
      payload->>'player_state', payload->>'platform', payload->>'app_version', event_time,
      not exists (select 1 from public.audience_events e where e.session_id = target_session_id and e.event_type = 'playback_started'),
      excluded, coalesce(payload->'metadata', '{}'::jsonb)
    ) on conflict (event_id) do nothing;
  end if;

  if event_kind = 'playback_started' then
    update public.audience_sessions s
      set ended_at = event_time,
          end_reason = 'overlap_replaced',
          anomaly_flags = array_append(s.anomaly_flags, 'overlapping_session')
    where s.anonymous_device_id = device_id
      and s.ended_at is null
      and s.id <> target_session_id;

    previous_id := public.newsmeter_resolve_channel(
      null,
      coalesce(payload#>>'{metadata,previous_stream_id}', payload#>>'{metadata,previous_channel_stream_id}')
    );

    insert into public.audience_sessions (
      id, anonymous_device_id, channel_id, program_id, stream_id, started_at, last_heartbeat_at,
      previous_channel_id, platform, app_version, country, state, network_type,
      first_frame_ms, resolution, cdn, is_test_session
    ) values (
      target_session_id, device_id, target_channel_id, target_program_id, target_stream_id, event_time, event_time,
      previous_id, payload->>'platform', payload->>'app_version', nullif(payload->>'country','')::char(2),
      payload->>'state', payload->>'network_type', nullif(payload#>>'{metadata,first_frame_ms}','')::integer,
      payload#>>'{metadata,resolution}', payload#>>'{metadata,assigned_server}', excluded
    ) on conflict (id) do update set
      channel_id = excluded.channel_id,
      program_id = coalesce(public.audience_sessions.program_id, excluded.program_id),
      last_heartbeat_at = greatest(public.audience_sessions.last_heartbeat_at, excluded.last_heartbeat_at),
      updated_at = now();

    select s.* into previous_session
    from public.audience_sessions s
    where s.anonymous_device_id = device_id
      and s.id <> target_session_id
      and s.channel_id is not null
      and target_channel_id is not null
      and s.channel_id <> target_channel_id
      and s.ended_at between event_time - interval '5 minutes' and event_time
      and exists (
        select 1 from public.audience_events e
        where e.anonymous_device_id = device_id
          and e.event_type = 'channel_changed'
          and e.event_timestamp between s.ended_at - interval '5 seconds' and event_time
      )
    order by s.ended_at desc
    limit 1;

    if previous_session.id is not null then
      insert into public.channel_transitions (
        anonymous_device_id, from_session_id, to_session_id, from_channel_id, to_channel_id,
        transitioned_at, seconds_between, is_test_transition
      ) values (
        device_id, previous_session.id, target_session_id, previous_session.channel_id, target_channel_id,
        event_time, greatest(0, extract(epoch from event_time - previous_session.ended_at)::integer), excluded
      ) on conflict do nothing;
      update public.audience_sessions set next_channel_id = target_channel_id where id = previous_session.id;
      update public.audience_sessions set previous_channel_id = previous_session.channel_id where id = target_session_id;
    end if;
  elsif event_kind = 'heartbeat' then
    update public.audience_sessions s set
      last_heartbeat_at = greatest(coalesce(s.last_heartbeat_at, event_time), event_time),
      valid_watch_seconds = greatest(
        s.valid_watch_seconds,
        greatest(0, extract(epoch from event_time - s.started_at)::integer - floor(s.pause_seconds + s.buffering_seconds)::integer)
      ),
      program_id = coalesce(s.program_id, target_program_id),
      updated_at = now()
    where s.id = target_session_id and s.ended_at is null;
  elsif event_kind = 'playback_paused' then
    update public.audience_sessions set pause_started_at = coalesce(pause_started_at, event_time) where id = target_session_id and ended_at is null;
  elsif event_kind = 'playback_resumed' then
    update public.audience_sessions set
      pause_seconds = pause_seconds + coalesce(extract(epoch from event_time - pause_started_at), 0),
      pause_started_at = null
    where id = target_session_id and ended_at is null;
  elsif event_kind = 'playback_buffering' then
    update public.audience_sessions set buffering_started_at = coalesce(buffering_started_at, event_time) where id = target_session_id and ended_at is null;
  elsif event_kind = 'playback_recovered' then
    update public.audience_sessions set
      buffering_seconds = buffering_seconds + coalesce(
        nullif(payload->>'buffering_duration','')::numeric,
        extract(epoch from event_time - buffering_started_at),
        0
      ),
      buffering_started_at = null
    where id = target_session_id and ended_at is null;
  elsif event_kind in ('playback_stopped','playback_failed','app_closed','app_backgrounded','session_expired') then
    update public.audience_sessions s set
      ended_at = coalesce(s.ended_at, event_time),
      valid_watch_seconds = greatest(
        s.valid_watch_seconds,
        greatest(0, extract(epoch from event_time - s.started_at)::integer - floor(s.pause_seconds + s.buffering_seconds)::integer)
      ),
      pause_seconds = s.pause_seconds + coalesce(extract(epoch from event_time - s.pause_started_at), 0),
      buffering_seconds = s.buffering_seconds + coalesce(extract(epoch from event_time - s.buffering_started_at), 0),
      pause_started_at = null,
      buffering_started_at = null,
      end_reason = coalesce(payload#>>'{metadata,end_reason}', event_kind),
      updated_at = now()
    where s.id = target_session_id and s.ended_at is null;
  end if;

  return jsonb_build_object(
    'accepted', true,
    'duplicate', false,
    'channel_id', target_channel_id,
    'program_id', target_program_id,
    'is_test', excluded
  );
end;
$$;

create or replace function public.newsmeter_expire_sessions()
returns integer
language plpgsql
set search_path = public
as $$
declare affected integer;
begin
  update public.audience_sessions s set
    ended_at = coalesce(s.last_heartbeat_at, s.started_at) + interval '45 seconds',
    end_reason = 'heartbeat_timeout',
    updated_at = now()
  where s.ended_at is null
    and coalesce(s.last_heartbeat_at, s.started_at) < now() - interval '45 seconds';
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.newsmeter_aggregate_minute(target_minute timestamptz default date_trunc('minute', now() - interval '1 minute'))
returns integer
language plpgsql
set search_path = public
as $$
declare
  minute_start timestamptz := date_trunc('minute', target_minute);
  minute_end timestamptz := date_trunc('minute', target_minute) + interval '1 minute';
  total_news numeric := 0;
  eligible_devices numeric := 0;
  affected integer := 0;
begin
  delete from public.audience_minute_aggregates where minute_timestamp = minute_start;

  select count(distinct e.anonymous_device_id)::numeric into eligible_devices
  from public.audience_events e
  where e.event_timestamp >= minute_start - interval '5 minutes'
    and e.event_timestamp < minute_end
    and not e.is_test_event;

  insert into public.audience_minute_aggregates (
    minute_timestamp, channel_id, program_id, active_viewers, unique_viewers, valid_watch_seconds,
    sessions_started, sessions_ended, channel_entries, channel_exits, average_watch_time,
    buffering_seconds, playback_errors, peak_concurrent
  )
  select
    minute_start,
    c.id,
    mode() within group (order by s.program_id) filter (where s.program_id is not null),
    count(distinct s.anonymous_device_id) filter (
      where s.started_at <= minute_end - interval '30 seconds'
        and coalesce(s.ended_at, minute_end) > minute_start
    )::integer,
    count(distinct s.anonymous_device_id)::integer,
    coalesce(sum(
      greatest(0, extract(epoch from least(coalesce(s.ended_at, minute_end), minute_end) - greatest(s.started_at, minute_start)))
      * least(
        1::numeric,
        s.valid_watch_seconds::numeric / greatest(1::numeric, extract(epoch from coalesce(s.ended_at, minute_end) - s.started_at))
      )
    ), 0)::bigint,
    count(*) filter (where s.started_at >= minute_start and s.started_at < minute_end)::integer,
    count(*) filter (where s.ended_at >= minute_start and s.ended_at < minute_end)::integer,
    count(*) filter (where s.started_at >= minute_start and s.started_at < minute_end)::integer,
    count(*) filter (where s.ended_at >= minute_start and s.ended_at < minute_end)::integer,
    coalesce(avg(s.valid_watch_seconds), 0),
    coalesce(sum(s.buffering_seconds), 0),
    (select count(*) from public.playback_errors pe where pe.channel_id = c.id and pe.occurred_at >= minute_start and pe.occurred_at < minute_end and not pe.is_test_error)::integer,
    count(distinct s.anonymous_device_id) filter (
      where s.started_at <= minute_end - interval '30 seconds'
        and coalesce(s.ended_at, minute_end) > minute_start
    )::integer
  from public.channels c
  left join public.audience_sessions s on s.channel_id = c.id
    and s.started_at < minute_end
    and coalesce(s.ended_at, minute_end) > minute_start
    and not s.is_test_session
  where c.is_active and c.category in ('news','international-news')
  group by c.id;

  select coalesce(sum(active_viewers), 0)::numeric into total_news
  from public.audience_minute_aggregates
  where minute_timestamp = minute_start;

  update public.audience_minute_aggregates a set
    share = case when total_news = 0 then 0 else round(a.active_viewers::numeric / total_news * 100, 4) end,
    internal_rating = case when eligible_devices = 0 then 0 else round(a.active_viewers::numeric / eligible_devices * 100, 4) end
  where a.minute_timestamp = minute_start;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.newsmeter_aggregate_hour(target_hour timestamptz default date_trunc('hour', now() - interval '1 hour'))
returns integer
language plpgsql
set search_path = public
as $$
declare affected integer;
begin
  insert into public.audience_hourly_aggregates (
    hour_timestamp, channel_id, average_minute_audience, peak_concurrent, unique_viewers,
    valid_watch_seconds, sessions_started, sessions_ended, average_watch_time, buffering_seconds,
    playback_errors, average_share, average_internal_rating
  )
  select
    date_trunc('hour', target_hour), channel_id, avg(active_viewers), max(peak_concurrent), max(unique_viewers),
    sum(valid_watch_seconds), sum(sessions_started), sum(sessions_ended), avg(average_watch_time),
    sum(buffering_seconds), sum(playback_errors), avg(share), avg(internal_rating)
  from public.audience_minute_aggregates
  where minute_timestamp >= date_trunc('hour', target_hour)
    and minute_timestamp < date_trunc('hour', target_hour) + interval '1 hour'
  group by channel_id
  on conflict (hour_timestamp, channel_id) do update set
    average_minute_audience = excluded.average_minute_audience,
    peak_concurrent = excluded.peak_concurrent,
    unique_viewers = excluded.unique_viewers,
    valid_watch_seconds = excluded.valid_watch_seconds,
    sessions_started = excluded.sessions_started,
    sessions_ended = excluded.sessions_ended,
    average_watch_time = excluded.average_watch_time,
    buffering_seconds = excluded.buffering_seconds,
    playback_errors = excluded.playback_errors,
    average_share = excluded.average_share,
    average_internal_rating = excluded.average_internal_rating,
    updated_at = now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;
