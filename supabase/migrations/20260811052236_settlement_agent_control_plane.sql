-- Durable, bounded settlement-review control plane.
--
-- These records do not move money and cannot change application code. They
-- preserve the exact input digest, one event per deterministic review stage,
-- compact user-owned memory, and explicit terminal outcomes. Base Sepolia is
-- the only enabled chain adapter because it is the only adapter verified live.

create table public.settlement_agent_runs (
  id uuid primary key default gen_random_uuid(),
  -- Retained actor snapshot. The tab owns durable review evidence; deleting a
  -- non-owner collaborator account must not erase a shared settlement proof.
  owner_id uuid not null,
  tab_id uuid not null references public.tabs(id) on delete cascade,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  input_snapshot jsonb not null,
  chain_adapter text not null default 'base-sepolia'
    check (chain_adapter = 'base-sepolia'),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'ready', 'verified', 'blocked', 'failed', 'cancelled')),
  stage_count smallint not null default 0 check (stage_count between 0 and 4),
  model_provider text,
  model_name text,
  model_usage jsonb not null default '{}'::jsonb,
  model_cost_microusd bigint check (model_cost_microusd is null or model_cost_microusd >= 0),
  result_summary jsonb not null default '{}'::jsonb,
  terminal_code text,
  attested_at timestamptz not null,
  attestation text not null check (attestation ~ '^[0-9a-f]{64}$'),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, tab_id, input_hash),
  unique (id, owner_id, tab_id),
  check (octet_length(input_snapshot::text) <= 65536),
  check (octet_length(result_summary::text) <= 65536),
  check ((status in ('ready', 'verified', 'blocked', 'failed', 'cancelled')) = (completed_at is not null))
);

create table public.settlement_agent_events (
  id bigint generated always as identity primary key,
  run_id uuid not null,
  owner_id uuid not null,
  tab_id uuid not null,
  sequence smallint not null check (sequence between 1 and 4),
  stage text not null check (stage in (
    'extraction_validation',
    'allocation_arithmetic',
    'consent_risk',
    'proof_verification'
  )),
  status text not null check (status in ('passed', 'blocked', 'failed', 'skipped')),
  deterministic boolean not null default true,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  output_summary jsonb not null,
  model_provider text,
  model_name text,
  model_usage jsonb not null default '{}'::jsonb,
  model_cost_microusd bigint check (model_cost_microusd is null or model_cost_microusd >= 0),
  duration_ms integer not null check (duration_ms between 0 and 60000),
  attested_at timestamptz not null,
  attestation text not null check (attestation ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (run_id, sequence),
  unique (run_id, stage),
  foreign key (run_id, owner_id, tab_id)
    references public.settlement_agent_runs(id, owner_id, tab_id) on delete cascade,
  check (octet_length(output_summary::text) <= 32768)
);

create table public.settlement_agent_memory (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  tab_id uuid not null references public.tabs(id) on delete cascade,
  source_run_id uuid,
  memory_key text not null check (memory_key ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  summary jsonb not null,
  revision integer not null default 1 check (revision between 1 and 1000000),
  expires_at timestamptz not null default (now() + interval '180 days'),
  attested_at timestamptz not null,
  attestation text not null check (attestation ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, tab_id, memory_key),
  foreign key (source_run_id)
    references public.settlement_agent_runs(id) on delete set null,
  check (octet_length(summary::text) <= 8192),
  check (expires_at > created_at)
);

create index idx_agent_runs_owner_created
  on public.settlement_agent_runs(owner_id, created_at desc);
create index idx_agent_runs_tab_created
  on public.settlement_agent_runs(tab_id, created_at desc);
create index idx_agent_events_owner_run
  on public.settlement_agent_events(owner_id, run_id, sequence);
create index idx_agent_events_tab_created
  on public.settlement_agent_events(tab_id, created_at desc);
create index idx_agent_memory_owner_updated
  on public.settlement_agent_memory(owner_id, updated_at desc);
create index idx_agent_memory_tab_updated
  on public.settlement_agent_memory(tab_id, updated_at desc);
create index idx_agent_memory_expiry
  on public.settlement_agent_memory(expires_at);
create index idx_agent_memory_source_run
  on public.settlement_agent_memory(source_run_id)
  where source_run_id is not null;

create or replace function private.validate_settlement_agent_run_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id <> old.owner_id or new.tab_id <> old.tab_id or new.input_hash <> old.input_hash then
    raise exception 'agent run ownership and input identity are immutable';
  end if;
  if old.status in ('ready', 'verified', 'blocked', 'failed', 'cancelled') then
    raise exception 'terminal agent runs are immutable';
  end if;
  if old.status = 'pending' and new.status not in ('pending', 'running', 'blocked', 'failed', 'cancelled') then
    raise exception 'invalid transition from pending agent run';
  end if;
  if old.status = 'running' and new.status not in ('running', 'ready', 'verified', 'blocked', 'failed', 'cancelled') then
    raise exception 'invalid transition from running agent run';
  end if;
  if new.stage_count < old.stage_count then
    raise exception 'agent run stage count cannot decrease';
  end if;
  return new;
end;
$$;

create or replace function private.validate_settlement_agent_event()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  expected_stage text;
begin
  expected_stage := case new.sequence
    when 1 then 'extraction_validation'
    when 2 then 'allocation_arithmetic'
    when 3 then 'consent_risk'
    when 4 then 'proof_verification'
  end;
  if new.stage <> expected_stage then
    raise exception 'agent stage does not match its fixed sequence';
  end if;
  return new;
end;
$$;

create or replace function private.validate_settlement_agent_memory_source()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.source_run_id is not null and not exists (
    select 1 from public.settlement_agent_runs r
    where r.id = new.source_run_id
      and r.owner_id = new.owner_id
      and r.tab_id = new.tab_id
  ) then
    raise exception 'memory source run must belong to the same owner and tab';
  end if;
  return new;
end;
$$;

create or replace function private.user_can_edit_agent_tab(actor_id uuid, target_tab uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select actor_id is not null and exists (
    select 1
    from public.tabs t
    left join public.tab_members m
      on m.tab_id = t.id and m.user_id = actor_id
    where t.id = target_tab
      and (t.owner_id = actor_id or m.role in ('owner', 'member'))
  );
$$;

-- All evidence mutation enters through these narrow RPCs. The underlying
-- tables are read-only to authenticated clients. RPCs enforce ownership,
-- domain invariants and ordering; the app server additionally HMAC-attests
-- every envelope. Read paths hide any row whose HMAC does not verify, because
-- database callers cannot be trusted merely for reaching an RPC.
create or replace function public.begin_settlement_agent_run(
  requested_run uuid,
  target_tab uuid,
  expected_owner uuid,
  request_hash text,
  input_record jsonb,
  server_attested_at timestamptz,
  server_attestation text
)
returns setof public.settlement_agent_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := expected_owner;
  created public.settlement_agent_runs%rowtype;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'service role required'; end if;
  if caller is null then raise exception 'expected owner is required'; end if;
  if requested_run is null then raise exception 'run id is required'; end if;
  if not private.user_can_edit_agent_tab(caller, target_tab) then raise exception 'tab editor access required'; end if;
  if request_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid run input digest'; end if;
  if server_attestation is null or server_attested_at is null
     or server_attestation !~ '^[0-9a-f]{64}$'
     or server_attested_at < now() - interval '5 minutes'
     or server_attested_at > now() + interval '5 minutes' then
    raise exception 'invalid or stale server attestation envelope';
  end if;
  if input_record is null or jsonb_typeof(input_record) <> 'object'
     or octet_length(input_record::text) > 65536 then
    raise exception 'agent run input must be a bounded JSON object';
  end if;

  select r.* into created
  from public.settlement_agent_runs r
  where r.owner_id = caller and r.tab_id = target_tab and r.input_hash = request_hash
  for update;
  if found then
    -- Completed evidence is safely reusable. A live run receives a bounded
    -- two-minute lease (the application wall clock is under 30 seconds), so
    -- concurrent identical requests dedupe without duplicating model spend.
    if created.status in ('ready', 'verified', 'blocked')
       or (
         created.status in ('pending', 'running')
         and created.updated_at >= now() - interval '2 minutes'
       ) then
      return next created;
      return;
    end if;

    -- A crashed pending/running attempt must not poison this exact input for
    -- eternity. Failed/cancelled attempts are retryable immediately; an active
    -- attempt is replaceable only after its lease expires. Cascades remove any
    -- partial stage rows before the fresh, server-attested run is inserted.
    delete from public.settlement_agent_runs where id = created.id;
  end if;

  insert into public.settlement_agent_runs(
    id, owner_id, tab_id, input_hash, input_snapshot, status, attested_at, attestation
  )
  values (
    requested_run, caller, target_tab, request_hash, input_record, 'pending', server_attested_at, server_attestation
  )
  on conflict (owner_id, tab_id, input_hash) do nothing
  returning * into created;

  if not found then
    select r.* into created
    from public.settlement_agent_runs r
    where r.owner_id = caller and r.tab_id = target_tab and r.input_hash = request_hash;
    return next created;
    return;
  end if;

  update public.settlement_agent_runs
  set status = 'running', started_at = now()
  where id = created.id
  returning * into created;
  return next created;
end;
$$;

create or replace function public.record_settlement_agent_stage(
  target_run uuid,
  expected_owner uuid,
  target_sequence smallint,
  target_stage text,
  target_status text,
  stage_input_hash text,
  stage_output jsonb,
  provider_name text default null,
  provider_model text default null,
  provider_usage jsonb default '{}'::jsonb,
  provider_cost_microusd bigint default null,
  elapsed_ms integer default 0,
  server_attested_at timestamptz default null,
  server_attestation text default null
)
returns setof public.settlement_agent_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := expected_owner;
  run_record public.settlement_agent_runs%rowtype;
  created public.settlement_agent_events%rowtype;
  expected_stage text;
  receipt_id_text text;
  allocation_id_text text;
  proof_settlement_id text;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'service role required'; end if;
  if caller is null then raise exception 'expected owner is required'; end if;
  select r.* into run_record
  from public.settlement_agent_runs r
  where r.id = target_run and r.owner_id = caller
  for update;
  if not found or not private.user_can_edit_agent_tab(caller, run_record.tab_id) then
    raise exception 'owned editable agent run required';
  end if;
  if run_record.status <> 'running' then raise exception 'agent run is not running'; end if;
  if target_sequence <> run_record.stage_count + 1 then raise exception 'agent stages must be recorded in order'; end if;
  expected_stage := case target_sequence
    when 1 then 'extraction_validation'
    when 2 then 'allocation_arithmetic'
    when 3 then 'consent_risk'
    when 4 then 'proof_verification'
  end;
  if target_stage is distinct from expected_stage then raise exception 'unexpected agent stage'; end if;
  if target_status not in ('passed', 'blocked', 'failed', 'skipped') then raise exception 'invalid stage status'; end if;
  if stage_input_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid stage input digest'; end if;
  if server_attestation is null or server_attested_at is null
     or server_attestation !~ '^[0-9a-f]{64}$'
     or server_attested_at < now() - interval '5 minutes'
     or server_attested_at > now() + interval '5 minutes' then
    raise exception 'invalid or stale server attestation envelope';
  end if;
  if stage_output is null or jsonb_typeof(stage_output) <> 'object'
     or octet_length(stage_output::text) > 32768 then
    raise exception 'stage output must be a bounded JSON object';
  end if;
  if elapsed_ms < 0 or elapsed_ms > 60000 then raise exception 'stage duration is out of bounds'; end if;
  if provider_cost_microusd is not null and provider_cost_microusd < 0 then raise exception 'invalid model cost'; end if;
  if target_sequence <> 2 and (provider_name is not null or provider_model is not null
      or provider_usage <> '{}'::jsonb or provider_cost_microusd is not null) then
    raise exception 'model metadata is only valid on the allocation stage';
  end if;

  -- A passed stage must point at the durable domain record it reviewed.
  if target_sequence = 1 and target_status = 'passed' then
    receipt_id_text := stage_output ->> 'receiptId';
    if coalesce(stage_output ->> 'arithmeticIssueCount', '') <> '0'
       or not exists (
         select 1 from public.receipts r
         where r.id::text = receipt_id_text
           and r.tab_id = run_record.tab_id
           and r.confirmed_by = caller
           and r.confirmed_at is not null
       ) then
      raise exception 'passed extraction stage requires a confirmed, arithmetic-clean receipt record';
    end if;
  elsif target_sequence = 2 and target_status = 'passed' then
    allocation_id_text := stage_output ->> 'allocationId';
    if coalesce(stage_output ->> 'conservation', '') <> 'true'
       or not exists (
         select 1 from public.allocations a
         where a.id::text = allocation_id_text and a.tab_id = run_record.tab_id
       ) then
      raise exception 'passed allocation stage requires a durable conserved allocation';
    end if;
  elsif target_sequence = 3 and target_status = 'passed' then
    if coalesce(stage_output ->> 'chainAdapter', '') <> 'base-sepolia'
       or coalesce(stage_output ->> 'currency', '') <> 'USD'
       or coalesce(stage_output ->> 'missingWalletCount', '') <> '0'
       or coalesce(stage_output ->> 'debitsEqualPayouts', '') <> 'true' then
      raise exception 'passed consent stage requires the proven Base Sepolia/USD risk invariants';
    end if;
  elsif target_sequence = 4 and target_status = 'passed' then
    proof_settlement_id := stage_output ->> 'settlementRecordId';
    if coalesce(stage_output ->> 'independentVerified', '') <> 'true'
       or not exists (
         select 1
         from public.settlements s
         join public.ledgers l on l.id = s.ledger_id
         where s.id::text = proof_settlement_id
           and l.tab_id = run_record.tab_id
           and s.status = 'verified_settled'
           and s.chain_id = 84532
           and s.keeperhub_execution_id is not null
           and jsonb_typeof(s.receipts) = 'array'
           and jsonb_array_length(s.receipts) > 0
       ) then
      raise exception 'passed proof stage requires a durable verified Base Sepolia settlement';
    end if;
  end if;

  insert into public.settlement_agent_events(
    run_id, owner_id, tab_id, sequence, stage, status, deterministic,
    input_hash, output_summary, model_provider, model_name, model_usage,
    model_cost_microusd, duration_ms, attested_at, attestation
  ) values (
    run_record.id, caller, run_record.tab_id, target_sequence, target_stage, target_status, true,
    stage_input_hash, stage_output, provider_name, provider_model, provider_usage,
    provider_cost_microusd, elapsed_ms, server_attested_at, server_attestation
  ) returning * into created;

  update public.settlement_agent_runs
  set stage_count = target_sequence,
      model_provider = coalesce(provider_name, model_provider),
      model_name = coalesce(provider_model, model_name),
      model_usage = case when provider_usage = '{}'::jsonb then model_usage else provider_usage end,
      model_cost_microusd = coalesce(provider_cost_microusd, model_cost_microusd)
  where id = run_record.id;
  return next created;
end;
$$;

create or replace function public.finish_settlement_agent_run(
  target_run uuid,
  expected_owner uuid,
  requested_terminal_status text,
  terminal_result jsonb,
  requested_terminal_code text default null,
  server_attested_at timestamptz default null,
  server_attestation text default null
)
returns setof public.settlement_agent_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := expected_owner;
  run_record public.settlement_agent_runs%rowtype;
  derived_status text;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'service role required'; end if;
  if caller is null then raise exception 'expected owner is required'; end if;
  select r.* into run_record
  from public.settlement_agent_runs r
  where r.id = target_run and r.owner_id = caller
  for update;
  if not found or not private.user_can_edit_agent_tab(caller, run_record.tab_id) then
    raise exception 'owned editable agent run required';
  end if;
  if run_record.status <> 'running' or run_record.stage_count <> 4 then
    raise exception 'all four bounded stages must be recorded before completion';
  end if;
  if terminal_result is null or jsonb_typeof(terminal_result) <> 'object'
     or octet_length(terminal_result::text) > 65536 then
    raise exception 'terminal result must be a bounded JSON object';
  end if;
  if server_attestation is null or server_attested_at is null
     or server_attestation !~ '^[0-9a-f]{64}$'
     or server_attested_at < now() - interval '5 minutes'
     or server_attested_at > now() + interval '5 minutes' then
    raise exception 'invalid or stale server attestation envelope';
  end if;

  if exists (select 1 from public.settlement_agent_events e where e.run_id = target_run and e.status = 'failed') then
    derived_status := 'failed';
  elsif exists (select 1 from public.settlement_agent_events e where e.run_id = target_run and e.status = 'blocked') then
    derived_status := 'blocked';
  elsif (select e.status from public.settlement_agent_events e where e.run_id = target_run and e.sequence = 4) = 'passed'
        and 3 = (select count(*) from public.settlement_agent_events e where e.run_id = target_run and e.sequence <= 3 and e.status = 'passed') then
    derived_status := 'verified';
  elsif (select e.status from public.settlement_agent_events e where e.run_id = target_run and e.sequence = 4) = 'skipped'
        and 3 = (select count(*) from public.settlement_agent_events e where e.run_id = target_run and e.sequence <= 3 and e.status = 'passed') then
    derived_status := 'ready';
  else
    derived_status := 'blocked';
  end if;
  if requested_terminal_status is distinct from derived_status then
    raise exception 'terminal status does not match recorded stage evidence';
  end if;

  update public.settlement_agent_runs
  set status = derived_status,
      result_summary = terminal_result,
      terminal_code = requested_terminal_code,
      attested_at = server_attested_at,
      attestation = server_attestation,
      completed_at = now()
  where id = target_run
  returning * into run_record;
  return next run_record;
end;
$$;

create or replace function public.remember_settlement_agent_run(
  target_run uuid,
  expected_owner uuid,
  target_memory_key text,
  memory_hash text,
  memory_summary jsonb,
  retain_until timestamptz,
  requested_revision integer,
  server_attested_at timestamptz,
  server_attestation text
)
returns setof public.settlement_agent_memory
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := expected_owner;
  run_record public.settlement_agent_runs%rowtype;
  remembered public.settlement_agent_memory%rowtype;
  prior_revision integer;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'service role required'; end if;
  if caller is null then raise exception 'expected owner is required'; end if;
  select r.* into run_record from public.settlement_agent_runs r
  where r.id = target_run and r.owner_id = caller;
  if not found or not private.user_can_edit_agent_tab(caller, run_record.tab_id) then raise exception 'owned editable run required'; end if;
  if run_record.status not in ('ready', 'verified', 'blocked', 'failed') then raise exception 'only terminal runs can be remembered'; end if;
  if target_memory_key !~ '^[a-z0-9][a-z0-9._-]{0,79}$' then raise exception 'invalid memory key'; end if;
  if memory_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid memory digest'; end if;
  if server_attestation is null or server_attested_at is null
     or server_attestation !~ '^[0-9a-f]{64}$'
     or server_attested_at < now() - interval '5 minutes'
     or server_attested_at > now() + interval '5 minutes' then
    raise exception 'invalid or stale server attestation envelope';
  end if;
  if memory_summary is null or jsonb_typeof(memory_summary) <> 'object'
     or octet_length(memory_summary::text) > 8192 then raise exception 'memory must be a compact JSON object'; end if;
  if retain_until <= now() or retain_until > now() + interval '180 days' then
    raise exception 'memory retention must be between now and 180 days';
  end if;

  select m.revision into prior_revision
  from public.settlement_agent_memory m
  where m.owner_id = caller
    and m.tab_id = run_record.tab_id
    and m.memory_key = target_memory_key
  for update;
  if found and requested_revision <> prior_revision + 1 then
    raise exception 'memory revision conflict';
  elsif not found and requested_revision <> 1 then
    raise exception 'new memory must start at revision one';
  end if;

  insert into public.settlement_agent_memory(
    owner_id, tab_id, source_run_id, memory_key, content_hash, summary, revision,
    expires_at, attested_at, attestation
  ) values (
    caller, run_record.tab_id, run_record.id, target_memory_key, memory_hash, memory_summary, requested_revision, retain_until,
    server_attested_at, server_attestation
  )
  on conflict (owner_id, tab_id, memory_key) do update
  set source_run_id = excluded.source_run_id,
      content_hash = excluded.content_hash,
      summary = excluded.summary,
      revision = excluded.revision,
      expires_at = excluded.expires_at,
      attested_at = excluded.attested_at,
      attestation = excluded.attestation
  where public.settlement_agent_memory.revision = excluded.revision - 1
  returning * into remembered;
  if remembered.id is null then raise exception 'memory revision conflict'; end if;
  return next remembered;
end;
$$;

create or replace function private.audit_settlement_agent_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_role text := (select auth.role());
  row_owner uuid := case when tg_op = 'DELETE' then old.owner_id else new.owner_id end;
  row_tab uuid := case when tg_op = 'DELETE' then old.tab_id else new.tab_id end;
  action_name text;
  event_metadata jsonb;
begin
  -- FK cascades and auth-admin erasure can execute with no end-user JWT, or
  -- while the parent tab is already being removed. They must never be blocked
  -- by a best-effort child audit insert. A direct owner DELETE remains depth
  -- one and is recorded below.
  if tg_op = 'DELETE' and (pg_trigger_depth() > 1 or (caller is null and caller_role is distinct from 'service_role')) then
    return old;
  end if;
  if caller is null and caller_role = 'service_role' then
    caller := row_owner;
  end if;
  if caller is null or caller <> row_owner then
    raise exception 'authenticated owner required for agent audit event';
  end if;

  action_name := case when tg_op = 'DELETE'
    then 'agent.record.deleted'
    else 'agent.attestation.received'
  end;
  -- Do not copy status/stage/model claims into the shared audit feed. A direct
  -- RPC caller can supply an invalid HMAC; only the app verifier may interpret
  -- the underlying record as evidence.
  event_metadata := jsonb_build_object(
    'record_type', tg_table_name,
    'record_id', case when tg_op = 'DELETE' then old.id::text else new.id::text end,
    'operation', lower(tg_op),
    'provenance', 'requires_server_attestation'
  );

  insert into public.audit_events(tab_id, actor_id, action, metadata)
  values (row_tab, caller, action_name, event_metadata);
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.delete_expired_settlement_agent_memory()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  removed_count integer := 0;
begin
  if caller is null then raise exception 'authentication required'; end if;

  -- Bound every opportunistic request. Repeated signed-in reads eventually
  -- drain the owner's expired rows without an unbounded table scan or cron.
  with expired as (
    select m.id
    from public.settlement_agent_memory m
    where m.owner_id = caller and m.expires_at <= now()
    order by m.expires_at asc
    limit 100
    for update skip locked
  ), deleted as (
    delete from public.settlement_agent_memory m
    using expired e
    where m.id = e.id and m.owner_id = caller
    returning m.id
  )
  select count(*)::integer into removed_count from deleted;
  return removed_count;
end;
$$;

revoke all on function private.validate_settlement_agent_run_transition() from public, anon, authenticated;
revoke all on function private.validate_settlement_agent_event() from public, anon, authenticated;
revoke all on function private.validate_settlement_agent_memory_source() from public, anon, authenticated;
revoke all on function private.audit_settlement_agent_change() from public, anon, authenticated;
revoke all on function private.user_can_edit_agent_tab(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.begin_settlement_agent_run(uuid, uuid, uuid, text, jsonb, timestamptz, text) from public, anon, authenticated;
revoke all on function public.record_settlement_agent_stage(uuid, uuid, smallint, text, text, text, jsonb, text, text, jsonb, bigint, integer, timestamptz, text) from public, anon, authenticated;
revoke all on function public.finish_settlement_agent_run(uuid, uuid, text, jsonb, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.remember_settlement_agent_run(uuid, uuid, text, text, jsonb, timestamptz, integer, timestamptz, text) from public, anon, authenticated;
revoke all on function public.delete_expired_settlement_agent_memory() from public, anon;
grant execute on function public.begin_settlement_agent_run(uuid, uuid, uuid, text, jsonb, timestamptz, text) to service_role;
grant execute on function public.record_settlement_agent_stage(uuid, uuid, smallint, text, text, text, jsonb, text, text, jsonb, bigint, integer, timestamptz, text) to service_role;
grant execute on function public.finish_settlement_agent_run(uuid, uuid, text, jsonb, text, timestamptz, text) to service_role;
grant execute on function public.remember_settlement_agent_run(uuid, uuid, text, text, jsonb, timestamptz, integer, timestamptz, text) to service_role;
grant execute on function public.delete_expired_settlement_agent_memory() to authenticated;

drop trigger if exists set_agent_runs_updated_at on public.settlement_agent_runs;
create trigger set_agent_runs_updated_at before update on public.settlement_agent_runs
for each row execute function public.set_updated_at();
drop trigger if exists set_agent_memory_updated_at on public.settlement_agent_memory;
create trigger set_agent_memory_updated_at before update on public.settlement_agent_memory
for each row execute function public.set_updated_at();
drop trigger if exists validate_agent_run_transition on public.settlement_agent_runs;
create trigger validate_agent_run_transition before update on public.settlement_agent_runs
for each row execute function private.validate_settlement_agent_run_transition();
drop trigger if exists validate_agent_event on public.settlement_agent_events;
create trigger validate_agent_event before insert on public.settlement_agent_events
for each row execute function private.validate_settlement_agent_event();
drop trigger if exists validate_agent_memory_source on public.settlement_agent_memory;
create trigger validate_agent_memory_source before insert or update on public.settlement_agent_memory
for each row execute function private.validate_settlement_agent_memory_source();
drop trigger if exists audit_agent_runs on public.settlement_agent_runs;
create trigger audit_agent_runs after insert or update or delete on public.settlement_agent_runs
for each row execute function private.audit_settlement_agent_change();
drop trigger if exists audit_agent_events on public.settlement_agent_events;
create trigger audit_agent_events after insert on public.settlement_agent_events
for each row execute function private.audit_settlement_agent_change();
drop trigger if exists audit_agent_memory on public.settlement_agent_memory;
create trigger audit_agent_memory after insert or update or delete on public.settlement_agent_memory
for each row execute function private.audit_settlement_agent_change();

alter table public.settlement_agent_runs enable row level security;
alter table public.settlement_agent_events enable row level security;
alter table public.settlement_agent_memory enable row level security;

create policy agent_runs_select_owner on public.settlement_agent_runs for select to authenticated
  using (owner_id = (select auth.uid()) and private.is_tab_member(tab_id));
create policy agent_events_select_owner on public.settlement_agent_events for select to authenticated
  using (owner_id = (select auth.uid()) and private.is_tab_member(tab_id));

create policy agent_memory_select_owner on public.settlement_agent_memory for select to authenticated
  using (
    owner_id = (select auth.uid())
    and private.is_tab_member(tab_id)
    and expires_at > now()
  );
create policy agent_memory_delete_owner on public.settlement_agent_memory for delete to authenticated
  using (owner_id = (select auth.uid()) and private.can_edit_tab(tab_id));

revoke all on public.settlement_agent_runs, public.settlement_agent_events,
  public.settlement_agent_memory from public, anon, authenticated;
revoke all on sequence public.settlement_agent_events_id_seq from public, anon, authenticated;
grant select on public.settlement_agent_runs to authenticated;
grant select on public.settlement_agent_events to authenticated;
grant select, delete on public.settlement_agent_memory to authenticated;
