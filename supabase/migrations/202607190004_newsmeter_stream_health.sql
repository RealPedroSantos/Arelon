create or replace function public.newsmeter_refresh_stream_health(
  from_timestamp timestamptz default now() - interval '15 minutes'
)
returns integer
language plpgsql
set search_path = public
as $$
declare affected integer;
begin
  insert into public.stream_health (
    bucket_timestamp, channel_id, stream_id, attempts, starts, startup_failures,
    average_first_frame_ms, buffering_count, buffering_seconds, playback_errors,
    stream_drops, sessions_ended_by_error, health_index, status
  )
  select
    date_trunc('minute', now()), h.channel_id, null, h.attempts::integer, h.starts::integer,
    h.startup_failures::integer, h.first_frame_ms, h.buffering_count::integer,
    h.buffering_seconds, round(h.error_rate / 100 * h.attempts)::integer,
    h.stream_drops::integer, h.sessions_ended_by_error::integer, h.health_index, h.status
  from public.newsmeter_technical_health(from_timestamp) h
  on conflict (bucket_timestamp, channel_id) do update set
    attempts = excluded.attempts,
    starts = excluded.starts,
    startup_failures = excluded.startup_failures,
    average_first_frame_ms = excluded.average_first_frame_ms,
    buffering_count = excluded.buffering_count,
    buffering_seconds = excluded.buffering_seconds,
    playback_errors = excluded.playback_errors,
    stream_drops = excluded.stream_drops,
    sessions_ended_by_error = excluded.sessions_ended_by_error,
    health_index = excluded.health_index,
    status = excluded.status,
    updated_at = now();

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.newsmeter_refresh_stream_health(timestamptz) from public, anon, authenticated;
grant execute on function public.newsmeter_refresh_stream_health(timestamptz) to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'newsmeter-stream-health',
      '* * * * *',
      'select public.newsmeter_refresh_stream_health()'
    );
  end if;
exception when others then
  raise notice 'pg_cron não configurado para stream health: %', sqlerrm;
end $$;
