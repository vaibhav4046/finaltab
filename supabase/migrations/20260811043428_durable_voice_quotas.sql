-- Durable, per-user quota windows for paid voice-provider routes.
--
-- The browser never receives a database write grant. Authenticated callers can
-- only consume their own fixed one-minute bucket through the SECURITY DEFINER
-- function below; the function derives identity from auth.uid(), fixes the
-- limits server-side, and reveals no other user's usage.
create table public.voice_quota_windows (
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null check (capability in ('transcription', 'readback')),
  window_start timestamptz not null,
  request_count integer not null check (request_count >= 1),
  primary key (user_id, capability, window_start)
);

alter table public.voice_quota_windows enable row level security;

-- Deliberately no table policies: direct reads and writes fail closed. The
-- narrow RPC is the sole authenticated surface.
revoke all on table public.voice_quota_windows from public, anon, authenticated;

create or replace function public.consume_voice_quota(requested_capability text)
returns table (
  allowed boolean,
  remaining integer,
  resets_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  current_time timestamptz := clock_timestamp();
  current_window timestamptz := date_trunc('minute', current_time);
  request_limit integer;
  observed_count integer;
begin
  if caller_id is null then
    raise insufficient_privilege using message = 'authentication required';
  end if;

  request_limit := case requested_capability
    when 'transcription' then 8
    when 'readback' then 20
    else null
  end;

  if request_limit is null then
    raise invalid_parameter_value using message = 'unsupported voice capability';
  end if;

  insert into public.voice_quota_windows as quota (
    user_id,
    capability,
    window_start,
    request_count
  ) values (
    caller_id,
    requested_capability,
    current_window,
    1
  )
  on conflict (user_id, capability, window_start)
  do update set request_count = least(quota.request_count + 1, request_limit + 1)
  returning request_count into observed_count;

  -- Bound storage without a privileged scheduler. Each user removes only
  -- their own stale windows as part of a successful quota check.
  delete from public.voice_quota_windows
  where user_id = caller_id
    and window_start < current_window - interval '10 minutes';

  return query select
    observed_count <= request_limit,
    greatest(request_limit - observed_count, 0),
    current_window + interval '1 minute';
end;
$$;

revoke all on function public.consume_voice_quota(text) from public, anon;
grant execute on function public.consume_voice_quota(text) to authenticated;
