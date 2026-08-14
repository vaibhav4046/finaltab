-- Atomic paid-voice spend reservations.
--
-- Limits are deliberately fixed in trusted SQL. An authenticated caller may
-- choose only a supported capability and, for readback, the exact text-unit
-- count. It cannot raise a limit, shorten the AssemblyAI reservation, release
-- an active lease, or write any counter directly.

create table public.voice_user_budget_windows (
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null check (capability in ('transcription', 'readback')),
  window_kind text not null check (window_kind in ('day', 'month')),
  window_start timestamptz not null,
  reserved_units bigint not null default 0 check (reserved_units >= 0),
  primary key (user_id, capability, window_kind, window_start)
);

create table public.voice_project_budget_windows (
  capability text not null check (capability in ('transcription', 'readback')),
  window_kind text not null check (window_kind in ('day', 'month')),
  window_start timestamptz not null,
  reserved_units bigint not null default 0 check (reserved_units >= 0),
  primary key (capability, window_kind, window_start)
);

create table public.voice_spend_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null check (capability in ('transcription', 'readback')),
  reserved_units integer not null check (reserved_units > 0),
  unit text not null check (unit in ('seconds', 'characters')),
  reserved_at timestamptz not null default clock_timestamp(),
  lease_expires_at timestamptz,
  check (
    (
      capability = 'transcription'
      and unit = 'seconds'
      and reserved_units = 180
      and lease_expires_at is not null
      and lease_expires_at > reserved_at
    )
    or
    (
      capability = 'readback'
      and unit = 'characters'
      and reserved_units between 1 and 600
      and lease_expires_at is null
    )
  )
);

create index voice_spend_reservations_active_user_idx
  on public.voice_spend_reservations (user_id, lease_expires_at)
  where capability = 'transcription' and lease_expires_at is not null;

-- Full leading index covers the auth.users foreign key for cascades and the
-- database advisor; the partial lease index alone is not sufficient.
create index voice_spend_reservations_user_idx
  on public.voice_spend_reservations (user_id);

create index voice_spend_reservations_retention_idx
  on public.voice_spend_reservations (reserved_at);

alter table public.voice_user_budget_windows enable row level security;
alter table public.voice_project_budget_windows enable row level security;
alter table public.voice_spend_reservations enable row level security;

-- Deliberately no policies: the authenticated RPC below is the only surface.
revoke all on table public.voice_user_budget_windows from public, anon, authenticated;
revoke all on table public.voice_project_budget_windows from public, anon, authenticated;
revoke all on table public.voice_spend_reservations from public, anon, authenticated;

-- Compatibility gate: the legacy request-count RPC remains callable until the
-- immutable candidate using reserve_voice_budget has passed its live probes.
-- The post-promotion cutover migration revokes it, avoiding a window where the
-- currently served release loses voice before its replacement is ready.

drop function if exists public.reserve_voice_budget(text, integer);
create or replace function public.reserve_voice_budget(
  expected_user uuid,
  requested_capability text,
  requested_units integer
)
returns table (
  allowed boolean,
  reason text,
  remaining integer,
  resets_at timestamptz,
  retry_at timestamptz,
  reservation_id uuid,
  reserved_units integer,
  unit text,
  user_daily_remaining integer,
  user_monthly_remaining integer,
  project_daily_remaining integer,
  project_monthly_remaining integer,
  concurrency_remaining integer,
  daily_resets_at timestamptz,
  monthly_resets_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := expected_user;
  current_time timestamptz := pg_catalog.clock_timestamp();
  utc_time timestamp without time zone;
  minute_start timestamptz;
  day_start timestamptz;
  month_start timestamptz;
  minute_reset timestamptz;
  day_reset timestamptz;
  month_reset timestamptz;
  request_limit integer;
  observed_requests integer;
  unit_kind text;
  user_daily_limit integer;
  user_monthly_limit integer;
  project_daily_limit integer;
  project_monthly_limit integer;
  user_day_used bigint;
  user_month_used bigint;
  project_day_used bigint;
  project_month_used bigint;
  user_active_sessions integer := 0;
  project_active_sessions integer := 0;
  user_concurrency_limit constant integer := 1;
  project_concurrency_limit constant integer := 4;
  token_redemption_seconds constant integer := 60;
  session_seconds constant integer := 180;
  user_active_lease_until timestamptz;
  project_active_lease_until timestamptz;
  decision_reason text := 'reserved';
  decision_allowed boolean := true;
  decision_retry_at timestamptz;
  created_reservation uuid;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise insufficient_privilege using message = 'trusted server role required';
  end if;
  if caller_id is null then
    raise invalid_parameter_value using message = 'expected user is required';
  end if;

  -- These are hard ceilings, not caller-selected configuration. Transcription
  -- always reserves the provider token's full 180-second session allowance.
  case requested_capability
    when 'transcription' then
      if requested_units is distinct from session_seconds then
        raise invalid_parameter_value using message = 'transcription must reserve exactly 180 seconds';
      end if;
      request_limit := 8;
      unit_kind := 'seconds';
      user_daily_limit := 720;
      user_monthly_limit := 3600;
      project_daily_limit := 3600;
      project_monthly_limit := 18000;
    when 'readback' then
      if requested_units is null or requested_units < 1 or requested_units > 600 then
        raise invalid_parameter_value using message = 'readback must reserve between 1 and 600 characters';
      end if;
      request_limit := 20;
      unit_kind := 'characters';
      user_daily_limit := 2400;
      user_monthly_limit := 12000;
      project_daily_limit := 12000;
      project_monthly_limit := 60000;
    else
      raise invalid_parameter_value using message = 'unsupported voice capability';
  end case;

  utc_time := pg_catalog.timezone('UTC', current_time);
  minute_start := pg_catalog.timezone('UTC', pg_catalog.date_trunc('minute', utc_time));
  day_start := pg_catalog.timezone('UTC', pg_catalog.date_trunc('day', utc_time));
  month_start := pg_catalog.timezone('UTC', pg_catalog.date_trunc('month', utc_time));
  minute_reset := pg_catalog.timezone(
    'UTC',
    pg_catalog.date_trunc('minute', utc_time) + interval '1 minute'
  );
  day_reset := pg_catalog.timezone(
    'UTC',
    pg_catalog.date_trunc('day', utc_time) + interval '1 day'
  );
  month_reset := pg_catalog.timezone(
    'UTC',
    pg_catalog.date_trunc('month', utc_time) + interval '1 month'
  );

  -- Preserve the existing durable per-minute request guard. Denied attempts
  -- count against it, preventing a hot loop at any longer budget boundary.
  insert into public.voice_quota_windows as quota (
    user_id,
    capability,
    window_start,
    request_count
  ) values (
    caller_id,
    requested_capability,
    minute_start,
    1
  )
  on conflict (user_id, capability, window_start)
  do update set request_count = least(quota.request_count + 1, request_limit + 1)
  returning request_count into observed_requests;

  delete from public.voice_quota_windows
  where user_id = caller_id
    and window_start < minute_start - interval '10 minutes';

  -- A fixed lock order serializes every project/user counter check. Each
  -- no-op conflict update acquires the row lock before any cap is evaluated.
  insert into public.voice_project_budget_windows as budget (
    capability, window_kind, window_start, reserved_units
  ) values (requested_capability, 'day', day_start, 0)
  on conflict (capability, window_kind, window_start)
  do update set reserved_units = budget.reserved_units
  returning budget.reserved_units into project_day_used;

  insert into public.voice_project_budget_windows as budget (
    capability, window_kind, window_start, reserved_units
  ) values (requested_capability, 'month', month_start, 0)
  on conflict (capability, window_kind, window_start)
  do update set reserved_units = budget.reserved_units
  returning budget.reserved_units into project_month_used;

  insert into public.voice_user_budget_windows as budget (
    user_id, capability, window_kind, window_start, reserved_units
  ) values (caller_id, requested_capability, 'day', day_start, 0)
  on conflict (user_id, capability, window_kind, window_start)
  do update set reserved_units = budget.reserved_units
  returning budget.reserved_units into user_day_used;

  insert into public.voice_user_budget_windows as budget (
    user_id, capability, window_kind, window_start, reserved_units
  ) values (caller_id, requested_capability, 'month', month_start, 0)
  on conflict (user_id, capability, window_kind, window_start)
  do update set reserved_units = budget.reserved_units
  returning budget.reserved_units into user_month_used;

  -- Keep counters bounded without a privileged scheduler. Current windows are
  -- already locked above; only stale daily/monthly rows are removed.
  delete from public.voice_user_budget_windows
  where user_id = caller_id
    and (
      (window_kind = 'day' and window_start < day_start - interval '35 days')
      or (window_kind = 'month' and window_start < month_start - interval '14 months')
    );
  delete from public.voice_project_budget_windows
  where (window_kind = 'day' and window_start < day_start - interval '35 days')
    or (window_kind = 'month' and window_start < month_start - interval '14 months');

  -- Reservations are immutable to authenticated callers. A lease covers both
  -- the 60-second token redemption window and the full 180-second stream, so
  -- a caller cannot mint overlapping sessions by closing a browser early.
  delete from public.voice_spend_reservations
  where reserved_at < current_time - interval '35 days'
    and (lease_expires_at is null or lease_expires_at <= current_time);

  if requested_capability = 'transcription' then
    -- The calendar budget rows normally serialize transcription calls. This
    -- transaction-scoped global guard also covers the exact UTC month boundary,
    -- where two calls could otherwise lock different monthly rows while an
    -- earlier 240-second lease is still active.
    perform pg_catalog.pg_advisory_xact_lock(845320180240::bigint);

    select
      (pg_catalog.count(*) filter (where reservation.user_id = caller_id))::integer,
      (pg_catalog.count(*))::integer,
      pg_catalog.min(reservation.lease_expires_at) filter (where reservation.user_id = caller_id),
      pg_catalog.min(reservation.lease_expires_at)
    into
      user_active_sessions,
      project_active_sessions,
      user_active_lease_until,
      project_active_lease_until
    from public.voice_spend_reservations as reservation
    where reservation.capability = 'transcription'
      and reservation.lease_expires_at > current_time;
  end if;

  if observed_requests > request_limit then
    decision_allowed := false;
    decision_reason := 'minute_limit';
    decision_retry_at := minute_reset;
  elsif user_day_used + requested_units > user_daily_limit then
    decision_allowed := false;
    decision_reason := 'user_daily_budget';
    decision_retry_at := day_reset;
  elsif user_month_used + requested_units > user_monthly_limit then
    decision_allowed := false;
    decision_reason := 'user_monthly_budget';
    decision_retry_at := month_reset;
  elsif project_day_used + requested_units > project_daily_limit then
    decision_allowed := false;
    decision_reason := 'project_daily_budget';
    decision_retry_at := day_reset;
  elsif project_month_used + requested_units > project_monthly_limit then
    decision_allowed := false;
    decision_reason := 'project_monthly_budget';
    decision_retry_at := month_reset;
  elsif requested_capability = 'transcription' and user_active_sessions >= user_concurrency_limit then
    decision_allowed := false;
    decision_reason := 'user_concurrency';
    decision_retry_at := coalesce(user_active_lease_until, current_time + interval '4 minutes');
  elsif requested_capability = 'transcription' and project_active_sessions >= project_concurrency_limit then
    decision_allowed := false;
    decision_reason := 'project_concurrency';
    decision_retry_at := coalesce(project_active_lease_until, current_time + interval '4 minutes');
  end if;

  if decision_allowed then
    update public.voice_project_budget_windows as budget
      set reserved_units = budget.reserved_units + requested_units
      where budget.capability = requested_capability
        and budget.window_kind = 'day'
        and budget.window_start = day_start;
    update public.voice_project_budget_windows as budget
      set reserved_units = budget.reserved_units + requested_units
      where budget.capability = requested_capability
        and budget.window_kind = 'month'
        and budget.window_start = month_start;
    update public.voice_user_budget_windows as budget
      set reserved_units = budget.reserved_units + requested_units
      where budget.user_id = caller_id
        and budget.capability = requested_capability
        and budget.window_kind = 'day'
        and budget.window_start = day_start;
    update public.voice_user_budget_windows as budget
      set reserved_units = budget.reserved_units + requested_units
      where budget.user_id = caller_id
        and budget.capability = requested_capability
        and budget.window_kind = 'month'
        and budget.window_start = month_start;

    user_day_used := user_day_used + requested_units;
    user_month_used := user_month_used + requested_units;
    project_day_used := project_day_used + requested_units;
    project_month_used := project_month_used + requested_units;

    insert into public.voice_spend_reservations (
      user_id,
      capability,
      reserved_units,
      unit,
      reserved_at,
      lease_expires_at
    ) values (
      caller_id,
      requested_capability,
      requested_units,
      unit_kind,
      current_time,
      case
        when requested_capability = 'transcription'
          then current_time + pg_catalog.make_interval(secs => token_redemption_seconds + session_seconds)
        else null
      end
    )
    returning id into created_reservation;
  end if;

  return query select
    decision_allowed,
    decision_reason,
    greatest(request_limit - observed_requests, 0),
    minute_reset,
    coalesce(decision_retry_at, minute_reset),
    created_reservation,
    case when decision_allowed then requested_units else 0 end,
    unit_kind,
    greatest(user_daily_limit - user_day_used, 0)::integer,
    greatest(user_monthly_limit - user_month_used, 0)::integer,
    greatest(project_daily_limit - project_day_used, 0)::integer,
    greatest(project_monthly_limit - project_month_used, 0)::integer,
    case
      when requested_capability = 'transcription' then
        greatest(
          least(
            user_concurrency_limit - user_active_sessions - case when decision_allowed then 1 else 0 end,
            project_concurrency_limit - project_active_sessions - case when decision_allowed then 1 else 0 end
          ),
          0
        )
      else null
    end,
    day_reset,
    month_reset;
end;
$$;

revoke all on function public.reserve_voice_budget(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_voice_budget(uuid, text, integer) to service_role;
