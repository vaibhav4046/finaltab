-- A plpgsql function's OUT parameters are variables, and PostgreSQL resolves the
-- columns named in an ON CONFLICT inference clause against those variables as
-- well as against the target table. Where the two names coincide the statement
-- fails at run time with SQLSTATE 42702, "column reference ... is ambiguous",
-- and only on the path that actually reaches the INSERT.
--
-- Two functions shipped with that collision:
--
--   public.accept_tab_invite            out tab_id       vs tab_members(tab_id, user_id)
--   public.reserve_..._narration_...    out operation_id vs finaltab_v3_narration_generations(operation_id)
--
-- The first is reached by POST /api/invites/join on every successful
-- acceptance, so joining a tab by invite could not succeed. The second sits
-- behind an operator window that has since closed, so it is latent there.
--
-- Naming the constraint instead of the columns removes the ambiguity without
-- changing which index is inferred, and without renaming an OUT parameter that
-- PostgREST publishes as a response field. Both bodies below are otherwise
-- byte-identical to the definitions they replace.

create or replace function public.accept_tab_invite(token_digest text)
returns table(tab_id uuid, participant_id uuid, tab_title text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target public.participants%rowtype;
  title_value text;
begin
  if caller is null then raise exception 'authentication required'; end if;
  if token_digest !~ '^[0-9a-f]{64}$' then raise exception 'invalid invite digest'; end if;

  select p.* into target
  from public.participants p
  where p.invite_token_hash = token_digest
    and p.invite_status = 'invited'
    and p.invite_expires_at > now()
  for update;
  if not found then raise exception 'invite invalid or expired'; end if;
  if exists (select 1 from public.participants p where p.tab_id = target.tab_id and p.user_id = caller) then
    raise exception 'user is already a participant in this tab';
  end if;

  update public.participants
  set user_id = caller, invite_status = 'joined', invite_token_hash = null, invite_expires_at = null
  where id = target.id;

  insert into public.tab_members(tab_id, user_id, role)
  values (target.tab_id, caller, 'member')
  on conflict on constraint tab_members_pkey do update set role = case
    when public.tab_members.role = 'owner' then 'owner' else 'member' end;

  select t.title into title_value from public.tabs t where t.id = target.tab_id;
  insert into public.audit_events(tab_id, actor_id, action, metadata)
  values (target.tab_id, caller, 'invite.joined', jsonb_build_object('participant_id', target.id));

  return query select target.tab_id, target.id, title_value;
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
  on conflict on constraint finaltab_v3_narration_generations_pkey do nothing
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
