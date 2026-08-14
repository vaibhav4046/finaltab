-- Single-use, service-only journal for the temporary FINALTab V3 narration
-- operator. The fixed operation can reserve one provider attempt, retain the
-- successful MP3 for a transport-safe replay, and can never return to a
-- retryable state. No browser-authenticated role can read or write this table.

create table public.finaltab_v3_narration_generations (
  operation_id text primary key
    check (operation_id = 'finaltab-v3-elevenlabs-george-20260812'),
  actor_subject_hash text not null
    check (actor_subject_hash ~ '^[0-9a-f]{64}$'),
  script_sha256 text not null
    check (script_sha256 = '3361c9d84fa42ddeffd5c4eaf1b5e37b5db0494f9f72b404f2e9e4b550119a11'),
  voice_id text not null
    check (voice_id = 'JBFqnCBsd6RMkjVDRZzb'),
  model_id text not null
    check (model_id = 'eleven_multilingual_v2'),
  output_format text not null
    check (output_format = 'mp3_44100_128'),
  state text not null
    check (state in ('reserved', 'completed', 'failed')),
  audio bytea,
  audio_sha256 text,
  audio_bytes integer,
  content_type text,
  provider_request_id text,
  failure_code text,
  provider_http_status integer,
  quota_checked_at timestamptz not null,
  remaining_included_characters integer not null
    check (remaining_included_characters >= 1320),
  reserved_at timestamptz not null default pg_catalog.clock_timestamp(),
  completed_at timestamptz,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  expires_at timestamptz not null
    default '2026-08-12 08:00:00+00'::timestamptz
    check (expires_at = '2026-08-12 08:00:00+00'::timestamptz),
  check (provider_request_id is null or provider_request_id ~ '^[A-Za-z0-9._:-]{1,200}$'),
  check (failure_code is null or failure_code ~ '^[a-z0-9_]{1,80}$'),
  check (provider_http_status is null or provider_http_status between 100 and 599),
  check (
    (state = 'reserved'
      and audio is null
      and audio_sha256 is null
      and audio_bytes is null
      and content_type is null
      and failure_code is null
      and provider_http_status is null
      and completed_at is null)
    or
    (state = 'completed'
      and audio is not null
      and audio_sha256 ~ '^[0-9a-f]{64}$'
      and audio_bytes = pg_catalog.octet_length(audio)
      and audio_bytes between 10000 and 4194304
      and content_type = 'audio/mpeg'
      and failure_code is null
      and provider_http_status between 200 and 299
      and completed_at is not null)
    or
    (state = 'failed'
      and audio is null
      and audio_sha256 is null
      and audio_bytes is null
      and content_type is null
      and failure_code is not null
      and (provider_http_status is null or provider_http_status between 400 and 599)
      and completed_at is null)
  )
);

alter table public.finaltab_v3_narration_generations enable row level security;

-- The SECURITY DEFINER functions below are the only access path. Keeping the
-- service role off the table itself prevents accidental ad-hoc Data API reads.
revoke all on table public.finaltab_v3_narration_generations
  from public, anon, authenticated, service_role;

create or replace function public.read_finaltab_v3_narration_generation(
  expected_actor_hash text,
  expected_script_sha256 text
)
returns table (
  acquired boolean,
  operation_id text,
  actor_subject_hash text,
  script_sha256 text,
  state text,
  audio bytea,
  audio_sha256 text,
  audio_bytes integer,
  content_type text,
  provider_request_id text,
  failure_code text,
  provider_http_status integer,
  quota_checked_at timestamptz,
  remaining_included_characters integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  journal public.finaltab_v3_narration_generations%rowtype;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise insufficient_privilege using message = 'service role required';
  end if;
  if expected_actor_hash is null or expected_actor_hash !~ '^[0-9a-f]{64}$'
    or expected_script_sha256 is distinct from '3361c9d84fa42ddeffd5c4eaf1b5e37b5db0494f9f72b404f2e9e4b550119a11'
  then
    raise invalid_parameter_value using message = 'invalid narration operation binding';
  end if;
  if pg_catalog.clock_timestamp() >= '2026-08-12 08:00:00+00'::timestamptz then
    raise check_violation using message = 'narration operator expired';
  end if;

  select candidate.* into journal
  from public.finaltab_v3_narration_generations as candidate
  where candidate.operation_id = 'finaltab-v3-elevenlabs-george-20260812';

  if found and (
    journal.actor_subject_hash is distinct from expected_actor_hash
    or journal.script_sha256 is distinct from expected_script_sha256
  ) then
    raise insufficient_privilege using message = 'narration operation binding mismatch';
  end if;
  if found then
    return query select
      false,
      journal.operation_id,
      journal.actor_subject_hash,
      journal.script_sha256,
      journal.state,
      journal.audio,
      journal.audio_sha256,
      journal.audio_bytes,
      journal.content_type,
      journal.provider_request_id,
      journal.failure_code,
      journal.provider_http_status,
      journal.quota_checked_at,
      journal.remaining_included_characters,
      journal.expires_at;
  end if;
end;
$$;

create or replace function public.reserve_finaltab_v3_narration_generation(
  expected_actor_hash text,
  expected_script_sha256 text,
  expected_quota_checked_at timestamptz,
  expected_remaining_included_characters integer
)
returns table (
  acquired boolean,
  operation_id text,
  actor_subject_hash text,
  script_sha256 text,
  state text,
  audio bytea,
  audio_sha256 text,
  audio_bytes integer,
  content_type text,
  provider_request_id text,
  failure_code text,
  provider_http_status integer,
  quota_checked_at timestamptz,
  remaining_included_characters integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  journal public.finaltab_v3_narration_generations%rowtype;
  did_acquire boolean := false;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise insufficient_privilege using message = 'service role required';
  end if;
  if expected_actor_hash is null or expected_actor_hash !~ '^[0-9a-f]{64}$'
    or expected_script_sha256 is distinct from '3361c9d84fa42ddeffd5c4eaf1b5e37b5db0494f9f72b404f2e9e4b550119a11'
  then
    raise invalid_parameter_value using message = 'invalid narration operation binding';
  end if;
  if pg_catalog.clock_timestamp() >= '2026-08-12 08:00:00+00'::timestamptz then
    raise check_violation using message = 'narration operator expired';
  end if;
  if expected_quota_checked_at is null
    or expected_quota_checked_at < pg_catalog.clock_timestamp() - interval '2 minutes'
    or expected_quota_checked_at > pg_catalog.clock_timestamp() + interval '10 seconds'
    or expected_remaining_included_characters is null
    or expected_remaining_included_characters < 1320
  then
    raise invalid_parameter_value using message = 'invalid narration quota preflight';
  end if;

  insert into public.finaltab_v3_narration_generations (
    operation_id,
    actor_subject_hash,
    script_sha256,
    voice_id,
    model_id,
    output_format,
    state,
    quota_checked_at,
    remaining_included_characters
  ) values (
    'finaltab-v3-elevenlabs-george-20260812',
    expected_actor_hash,
    expected_script_sha256,
    'JBFqnCBsd6RMkjVDRZzb',
    'eleven_multilingual_v2',
    'mp3_44100_128',
    'reserved',
    expected_quota_checked_at,
    expected_remaining_included_characters
  )
  on conflict (operation_id) do nothing
  returning * into journal;
  did_acquire := found;

  if not did_acquire then
    select candidate.* into journal
    from public.finaltab_v3_narration_generations as candidate
    where candidate.operation_id = 'finaltab-v3-elevenlabs-george-20260812'
    for update;
  end if;
  if not found then
    raise no_data_found using message = 'narration operation unavailable';
  end if;
  if journal.actor_subject_hash is distinct from expected_actor_hash
    or journal.script_sha256 is distinct from expected_script_sha256
  then
    raise insufficient_privilege using message = 'narration operation binding mismatch';
  end if;

  return query select
    did_acquire,
    journal.operation_id,
    journal.actor_subject_hash,
    journal.script_sha256,
    journal.state,
    journal.audio,
    journal.audio_sha256,
    journal.audio_bytes,
    journal.content_type,
    journal.provider_request_id,
    journal.failure_code,
    journal.provider_http_status,
    journal.quota_checked_at,
    journal.remaining_included_characters,
    journal.expires_at;
end;
$$;

create or replace function public.complete_finaltab_v3_narration_generation(
  expected_actor_hash text,
  expected_script_sha256 text,
  generated_audio bytea,
  generated_audio_sha256 text,
  generated_audio_bytes integer,
  safe_provider_request_id text default null
)
returns table (
  acquired boolean,
  operation_id text,
  actor_subject_hash text,
  script_sha256 text,
  state text,
  audio bytea,
  audio_sha256 text,
  audio_bytes integer,
  content_type text,
  provider_request_id text,
  failure_code text,
  provider_http_status integer,
  quota_checked_at timestamptz,
  remaining_included_characters integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  journal public.finaltab_v3_narration_generations%rowtype;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise insufficient_privilege using message = 'service role required';
  end if;
  if expected_actor_hash is null or expected_actor_hash !~ '^[0-9a-f]{64}$'
    or expected_script_sha256 is distinct from '3361c9d84fa42ddeffd5c4eaf1b5e37b5db0494f9f72b404f2e9e4b550119a11'
    or generated_audio is null
    or generated_audio_sha256 is null
    or generated_audio_sha256 !~ '^[0-9a-f]{64}$'
    or generated_audio_bytes is null
    or generated_audio_bytes is distinct from pg_catalog.octet_length(generated_audio)
    or generated_audio_bytes not between 10000 and 4194304
    or (safe_provider_request_id is not null and safe_provider_request_id !~ '^[A-Za-z0-9._:-]{1,200}$')
  then
    raise invalid_parameter_value using message = 'invalid bounded narration artifact';
  end if;

  update public.finaltab_v3_narration_generations as candidate
  set state = 'completed',
      audio = generated_audio,
      audio_sha256 = generated_audio_sha256,
      audio_bytes = generated_audio_bytes,
      content_type = 'audio/mpeg',
      provider_request_id = safe_provider_request_id,
      provider_http_status = 200,
      completed_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
  where candidate.operation_id = 'finaltab-v3-elevenlabs-george-20260812'
    and candidate.actor_subject_hash = expected_actor_hash
    and candidate.script_sha256 = expected_script_sha256
    and candidate.state = 'reserved'
  returning candidate.* into journal;

  if not found then
    select candidate.* into journal
    from public.finaltab_v3_narration_generations as candidate
    where candidate.operation_id = 'finaltab-v3-elevenlabs-george-20260812'
    for update;
    if not found
      or journal.actor_subject_hash is distinct from expected_actor_hash
      or journal.script_sha256 is distinct from expected_script_sha256
      or journal.state is distinct from 'completed'
      or journal.audio_sha256 is distinct from generated_audio_sha256
      or journal.audio_bytes is distinct from generated_audio_bytes
    then
      raise check_violation using message = 'narration completion transition rejected';
    end if;
  end if;

  return query select
    false,
    journal.operation_id,
    journal.actor_subject_hash,
    journal.script_sha256,
    journal.state,
    journal.audio,
    journal.audio_sha256,
    journal.audio_bytes,
    journal.content_type,
    journal.provider_request_id,
    journal.failure_code,
    journal.provider_http_status,
    journal.quota_checked_at,
    journal.remaining_included_characters,
    journal.expires_at;
end;
$$;

create or replace function public.fail_finaltab_v3_narration_generation(
  expected_actor_hash text,
  expected_script_sha256 text,
  safe_failure_code text,
  safe_provider_http_status integer default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  transitioned boolean;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise insufficient_privilege using message = 'service role required';
  end if;
  if expected_actor_hash is null or expected_actor_hash !~ '^[0-9a-f]{64}$'
    or expected_script_sha256 is distinct from '3361c9d84fa42ddeffd5c4eaf1b5e37b5db0494f9f72b404f2e9e4b550119a11'
    or safe_failure_code is null
    or safe_failure_code !~ '^[a-z0-9_]{1,80}$'
    or (safe_provider_http_status is not null and safe_provider_http_status not between 400 and 599)
  then
    raise invalid_parameter_value using message = 'invalid narration failure record';
  end if;

  update public.finaltab_v3_narration_generations as candidate
  set state = 'failed',
      failure_code = safe_failure_code,
      provider_http_status = safe_provider_http_status,
      updated_at = pg_catalog.clock_timestamp()
  where candidate.operation_id = 'finaltab-v3-elevenlabs-george-20260812'
    and candidate.actor_subject_hash = expected_actor_hash
    and candidate.script_sha256 = expected_script_sha256
    and candidate.state = 'reserved';
  transitioned := found;

  if not transitioned and not exists (
    select 1
    from public.finaltab_v3_narration_generations as candidate
    where candidate.operation_id = 'finaltab-v3-elevenlabs-george-20260812'
      and candidate.actor_subject_hash = expected_actor_hash
      and candidate.script_sha256 = expected_script_sha256
      and candidate.state = 'failed'
      and candidate.failure_code = safe_failure_code
      and candidate.provider_http_status is not distinct from safe_provider_http_status
  ) then
    raise check_violation using message = 'narration failure transition rejected';
  end if;
  return transitioned;
end;
$$;

revoke all on function public.read_finaltab_v3_narration_generation(text, text)
  from public, anon, authenticated;
revoke all on function public.reserve_finaltab_v3_narration_generation(text, text, timestamptz, integer)
  from public, anon, authenticated;
revoke all on function public.complete_finaltab_v3_narration_generation(text, text, bytea, text, integer, text)
  from public, anon, authenticated;
revoke all on function public.fail_finaltab_v3_narration_generation(text, text, text, integer)
  from public, anon, authenticated;

grant execute on function public.read_finaltab_v3_narration_generation(text, text)
  to service_role;
grant execute on function public.reserve_finaltab_v3_narration_generation(text, text, timestamptz, integer)
  to service_role;
grant execute on function public.complete_finaltab_v3_narration_generation(text, text, bytea, text, integer, text)
  to service_role;
grant execute on function public.fail_finaltab_v3_narration_generation(text, text, text, integer)
  to service_role;
