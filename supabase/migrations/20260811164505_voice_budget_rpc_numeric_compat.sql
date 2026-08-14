-- PostgREST decodes JSON integer parameters as bigint for RPC resolution.
-- Keep the original fixed-cap implementation intact and expose one uniquely
-- named service-only adapter so the Data API never relies on unsupported
-- overloaded function resolution.
create function public.reserve_voice_budget_service(
  expected_user uuid,
  requested_capability text,
  requested_units bigint
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
language sql
security invoker
set search_path = ''
as $$
  select *
  from public.reserve_voice_budget(
    expected_user,
    requested_capability,
    case
      when requested_units between 1 and 600 then requested_units::integer
      else null::integer
    end
  );
$$;

revoke all on function public.reserve_voice_budget_service(uuid, text, bigint)
  from public, anon, authenticated;
grant execute on function public.reserve_voice_budget_service(uuid, text, bigint)
  to service_role;
