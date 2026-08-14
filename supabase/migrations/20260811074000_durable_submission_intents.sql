-- Cross-channel, service-authored settlement submission journal.
--
-- Every value-moving surface (first-party UI, REST and MCP) must create the
-- same deterministic intent before calling KeeperHub. A retry after an
-- accepted-provider/failed-database dual write therefore reuses the exact same
-- KeeperHub idempotency key and can repair the durable acceptance without
-- broadcasting a second plan.

create table public.settlement_submission_intents (
  idempotency_key text primary key check (idempotency_key ~ '^[0-9a-f]{64}$'),
  principal_subject_hash text not null check (principal_subject_hash ~ '^[0-9a-f]{64}$'),
  approval_hash text not null check (approval_hash ~ '^[0-9a-f]{64}$'),
  approval_expires_at timestamptz not null,
  signed_body_hash text not null check (signed_body_hash ~ '^[0-9a-f]{64}$'),
  simulation_hash text not null check (simulation_hash ~ '^[0-9a-f]{64}$'),
  simulation_record jsonb not null check (
    jsonb_typeof(simulation_record) is not distinct from 'object'
    and pg_column_size(simulation_record) <= 65536
    and simulation_record ->> 'success' is not distinct from 'true'
    and coalesce(simulation_record ->> 'wouldRevert', 'false') = 'false'
  ),
  plan_hash text not null check (plan_hash ~* '^0x[0-9a-f]{64}$'),
  ledger_hash text not null check (ledger_hash ~* '^0x[0-9a-f]{64}$'),
  chain_id bigint not null check (chain_id = 84532),
  contract_address text not null check (contract_address ~* '^0x[0-9a-f]{40}$'),
  -- A generic REST/MCP submission has no tab. First-party submissions attach
  -- their already-HMAC-attested flow without making that flow a deletion root.
  flow_id uuid references public.settlement_flow_records(id) on delete set null,
  state text not null check (state in (
    'prepared', 'accepted', 'completed_unverified', 'verified_settled',
    'failed', 'timeout'
  )),
  execution_id text check (
    execution_id is null or
    (char_length(execution_id) between 6 and 128 and execution_id ~ '^[A-Za-z0-9_-]+$')
  ),
  execution_hash text check (execution_hash is null or execution_hash ~ '^[0-9a-f]{64}$'),
  execution_record jsonb,
  keeperhub_status_hash text check (
    keeperhub_status_hash is null or keeperhub_status_hash ~ '^[0-9a-f]{64}$'
  ),
  keeperhub_status jsonb,
  proof_hash text check (proof_hash is null or proof_hash ~ '^[0-9a-f]{64}$'),
  independent_proof jsonb,
  revision integer not null check (revision between 1 and 4),
  prepared_at timestamptz not null,
  accepted_at timestamptz,
  observed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (revision = 1 and state = 'prepared'
      and execution_id is null and execution_hash is null and execution_record is null
      and keeperhub_status_hash is null and keeperhub_status is null
      and proof_hash is null and independent_proof is null and accepted_at is null)
    or
    (revision = 2 and state = 'accepted'
      and execution_id is not null and execution_hash is not null and execution_record is not null
      and keeperhub_status_hash is null and keeperhub_status is null
      and proof_hash is null and independent_proof is null and accepted_at is not null)
    or
    (revision = 3 and state in ('completed_unverified', 'verified_settled', 'failed', 'timeout')
      and execution_id is not null and execution_hash is not null and execution_record is not null
      and keeperhub_status_hash is not null and keeperhub_status is not null
      and proof_hash is not null and independent_proof is not null
      and accepted_at is not null and observed_at is not null)
    or
    (revision = 4 and state = 'verified_settled'
      and execution_id is not null and execution_hash is not null and execution_record is not null
      and keeperhub_status_hash is not null and keeperhub_status is not null
      and proof_hash is not null and independent_proof is not null
      and accepted_at is not null and observed_at is not null)
  ),
  check (approval_expires_at > prepared_at)
);

create unique index idx_submission_intents_execution
  on public.settlement_submission_intents(execution_id)
  where execution_id is not null;
create index idx_submission_intents_flow
  on public.settlement_submission_intents(flow_id)
  where flow_id is not null;
create index idx_submission_intents_principal_created
  on public.settlement_submission_intents(principal_subject_hash, created_at desc);

create table public.settlement_submission_events (
  id bigint generated always as identity primary key,
  idempotency_key text not null references public.settlement_submission_intents(idempotency_key) on delete cascade,
  principal_subject_hash text not null check (principal_subject_hash ~ '^[0-9a-f]{64}$'),
  revision integer not null check (revision between 1 and 4),
  event_kind text not null check (event_kind in ('prepared', 'accepted', 'terminal', 'reconciled')),
  state text not null check (state in (
    'prepared', 'accepted', 'completed_unverified', 'verified_settled',
    'failed', 'timeout'
  )),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (idempotency_key, revision)
);

create index idx_submission_events_principal_created
  on public.settlement_submission_events(principal_subject_hash, created_at desc);

drop trigger if exists set_settlement_submission_intent_updated_at
  on public.settlement_submission_intents;
create trigger set_settlement_submission_intent_updated_at
before update on public.settlement_submission_intents
for each row execute function public.set_updated_at();

alter table public.settlement_submission_intents enable row level security;
alter table public.settlement_submission_events enable row level security;
revoke all on public.settlement_submission_intents, public.settlement_submission_events
  from public, anon, authenticated;

create or replace function public.read_durable_settlement_submission_retry(
  expected_principal_hash text,
  expected_idempotency_key text,
  signed_body_digest text,
  approval_digest text,
  approval_expiry timestamptz,
  expected_plan_hash text,
  expected_ledger_hash text,
  target_chain_id bigint,
  target_contract_address text,
  attached_flow uuid,
  attached_flow_actor uuid
)
returns setof public.settlement_submission_intents
language plpgsql
security definer
set search_path = ''
as $$
declare
  intent public.settlement_submission_intents%rowtype;
  flow public.settlement_flow_records%rowtype;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'service role required'; end if;
  if expected_principal_hash is null or expected_principal_hash !~ '^[0-9a-f]{64}$'
    or expected_idempotency_key is null or expected_idempotency_key !~ '^[0-9a-f]{64}$'
    or signed_body_digest is null or signed_body_digest !~ '^[0-9a-f]{64}$'
    or approval_digest is null or approval_digest !~ '^[0-9a-f]{64}$'
    or approval_expiry is null or approval_expiry <= now()
    or approval_expiry > now() + interval '16 minutes'
    or expected_plan_hash is null or expected_plan_hash !~* '^0x[0-9a-f]{64}$'
    or expected_ledger_hash is null or expected_ledger_hash !~* '^0x[0-9a-f]{64}$'
    or target_chain_id is distinct from 84532
    or target_contract_address is null or target_contract_address !~* '^0x[0-9a-f]{40}$'
  then raise exception 'invalid durable retry binding'; end if;

  if attached_flow is not null then
    if attached_flow_actor is null then raise exception 'attached flow actor is required'; end if;
    select f.* into flow from public.settlement_flow_records f
    where f.id = attached_flow for update;
    if not found or not private.user_can_edit_settlement_tab(attached_flow_actor, flow.tab_id) then
      raise exception 'FLOW_NOT_FOUND_OR_NOT_OWNED';
    end if;
    if flow.state is distinct from 'simulated'
      or flow.signed_body_hash is distinct from signed_body_digest
      or lower(flow.plan_hash) is distinct from lower(expected_plan_hash)
      or lower(flow.ledger_hash) is distinct from lower(expected_ledger_hash)
      or flow.chain_id is distinct from target_chain_id
      or lower(flow.contract_address) is distinct from lower(target_contract_address)
    then raise exception 'FLOW_SUBMISSION_BINDING_MISMATCH'; end if;
  elsif attached_flow_actor is not null then
    raise exception 'flow actor without attached flow';
  end if;

  select i.* into intent from public.settlement_submission_intents i
  where i.idempotency_key = expected_idempotency_key for update;
  if not found then return; end if;
  if intent.principal_subject_hash is distinct from expected_principal_hash
    or intent.signed_body_hash is distinct from signed_body_digest
    or lower(intent.plan_hash) is distinct from lower(expected_plan_hash)
    or lower(intent.ledger_hash) is distinct from lower(expected_ledger_hash)
    or intent.chain_id is distinct from target_chain_id
    or lower(intent.contract_address) is distinct from lower(target_contract_address)
    or (intent.flow_id is not null and intent.flow_id is distinct from attached_flow)
  then raise exception 'SUBMISSION_INTENT_CONFLICT'; end if;

  -- A fresh, separately verified human approval may renew an unresolved exact
  -- prepared intent. It cannot alter the frozen plan or an accepted execution.
  if intent.state = 'prepared' and (
    intent.approval_hash is distinct from approval_digest
    or intent.approval_expires_at is distinct from approval_expiry
  ) then
    update public.settlement_submission_intents
    set approval_hash = approval_digest, approval_expires_at = approval_expiry
    where idempotency_key = expected_idempotency_key
    returning * into intent;
  end if;
  if attached_flow is not null and intent.flow_id is null then
    update public.settlement_submission_intents
    set flow_id = attached_flow
    where idempotency_key = expected_idempotency_key
    returning * into intent;
  end if;
  return next intent;
end;
$$;

create or replace function public.prepare_durable_settlement_submission(
  expected_principal_hash text,
  expected_idempotency_key text,
  signed_body_digest text,
  approval_digest text,
  approval_expiry timestamptz,
  simulation_digest text,
  successful_simulation_record jsonb,
  expected_plan_hash text,
  expected_ledger_hash text,
  target_chain_id bigint,
  target_contract_address text,
  attached_flow uuid,
  attached_flow_actor uuid,
  prepared_timestamp timestamptz,
  event_payload_hash text
)
returns setof public.settlement_submission_intents
language plpgsql
security definer
set search_path = ''
as $$
declare
  intent public.settlement_submission_intents%rowtype;
  flow public.settlement_flow_records%rowtype;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service role required';
  end if;
  if expected_principal_hash is null or expected_principal_hash !~ '^[0-9a-f]{64}$'
    or expected_idempotency_key is null or expected_idempotency_key !~ '^[0-9a-f]{64}$'
    or signed_body_digest is null or signed_body_digest !~ '^[0-9a-f]{64}$'
    or approval_digest is null or approval_digest !~ '^[0-9a-f]{64}$'
    or approval_expiry is null or approval_expiry <= now()
    or approval_expiry > now() + interval '16 minutes'
    or simulation_digest is null or simulation_digest !~ '^[0-9a-f]{64}$'
    or expected_plan_hash is null or expected_plan_hash !~* '^0x[0-9a-f]{64}$'
    or expected_ledger_hash is null or expected_ledger_hash !~* '^0x[0-9a-f]{64}$'
    or target_contract_address is null or target_contract_address !~* '^0x[0-9a-f]{40}$'
    or event_payload_hash is null or event_payload_hash !~ '^[0-9a-f]{64}$'
  then raise exception 'invalid durable submission binding'; end if;
  if target_chain_id is distinct from 84532 then
    raise exception 'only the Base Sepolia adapter is enabled';
  end if;
  if prepared_timestamp is null
    or prepared_timestamp < now() - interval '5 minutes'
    or prepared_timestamp > now() + interval '1 minute'
  then raise exception 'submission intent timestamp outside freshness window'; end if;
  if jsonb_typeof(successful_simulation_record) is distinct from 'object'
  then raise exception 'only a successful bounded exact simulation may be prepared'; end if;
  if pg_column_size(successful_simulation_record) > 65536
    or successful_simulation_record ->> 'success' is distinct from 'true'
    or coalesce(successful_simulation_record ->> 'wouldRevert', 'false') is distinct from 'false'
  then raise exception 'only a successful bounded exact simulation may be prepared'; end if;

  if attached_flow is not null then
    if attached_flow_actor is null then raise exception 'attached flow actor is required'; end if;
    select f.* into flow
    from public.settlement_flow_records f
    where f.id = attached_flow
    for update;
    if not found or not private.user_can_edit_settlement_tab(attached_flow_actor, flow.tab_id) then
      raise exception 'FLOW_NOT_FOUND_OR_NOT_OWNED';
    end if;
    if flow.state is distinct from 'simulated'
      or flow.signed_body_hash is distinct from signed_body_digest
      or lower(flow.plan_hash) is distinct from lower(expected_plan_hash)
      or lower(flow.ledger_hash) is distinct from lower(expected_ledger_hash)
      or flow.chain_id is distinct from target_chain_id
      or lower(flow.contract_address) is distinct from lower(target_contract_address)
    then raise exception 'FLOW_SUBMISSION_BINDING_MISMATCH'; end if;
  elsif attached_flow_actor is not null then
    raise exception 'flow actor without attached flow';
  end if;

  insert into public.settlement_submission_intents(
    idempotency_key, principal_subject_hash, approval_hash, approval_expires_at,
    signed_body_hash, simulation_hash,
    simulation_record, plan_hash, ledger_hash, chain_id, contract_address,
    flow_id, state, revision, prepared_at
  ) values (
    expected_idempotency_key, expected_principal_hash, approval_digest,
    approval_expiry, signed_body_digest,
    simulation_digest, successful_simulation_record, lower(expected_plan_hash),
    lower(expected_ledger_hash), target_chain_id, lower(target_contract_address),
    attached_flow, 'prepared', 1, prepared_timestamp
  ) on conflict (idempotency_key) do nothing;

  select i.* into intent
  from public.settlement_submission_intents i
  where i.idempotency_key = expected_idempotency_key
  for update;
  if not found then raise exception 'SUBMISSION_INTENT_NOT_FOUND'; end if;
  if intent.principal_subject_hash is distinct from expected_principal_hash
    or intent.signed_body_hash is distinct from signed_body_digest
    or intent.simulation_hash is distinct from simulation_digest
    or intent.simulation_record is distinct from successful_simulation_record
    or lower(intent.plan_hash) is distinct from lower(expected_plan_hash)
    or lower(intent.ledger_hash) is distinct from lower(expected_ledger_hash)
    or intent.chain_id is distinct from target_chain_id
    or lower(intent.contract_address) is distinct from lower(target_contract_address)
    or (intent.flow_id is not null and intent.flow_id is distinct from attached_flow)
  then raise exception 'SUBMISSION_INTENT_CONFLICT'; end if;

  if attached_flow is not null and intent.flow_id is null then
    update public.settlement_submission_intents
    set flow_id = attached_flow
    where idempotency_key = expected_idempotency_key
    returning * into intent;
  end if;
  if intent.state = 'prepared' and (
    intent.approval_hash is distinct from approval_digest
    or intent.approval_expires_at is distinct from approval_expiry
  ) then
    update public.settlement_submission_intents
    set approval_hash = approval_digest, approval_expires_at = approval_expiry
    where idempotency_key = expected_idempotency_key
    returning * into intent;
  end if;
  if intent.revision = 1 and not exists (
    select 1 from public.settlement_submission_events e
    where e.idempotency_key = expected_idempotency_key and e.revision = 1
  ) then
    insert into public.settlement_submission_events(
      idempotency_key, principal_subject_hash, revision, event_kind, state, payload_hash
    ) values (
      expected_idempotency_key, expected_principal_hash, 1, 'prepared', 'prepared', event_payload_hash
    );
  end if;
  return next intent;
end;
$$;

create or replace function public.record_durable_settlement_acceptance(
  expected_principal_hash text,
  expected_idempotency_key text,
  signed_body_digest text,
  accepted_execution_id text,
  accepted_execution_record jsonb,
  execution_digest text,
  accepted_timestamp timestamptz,
  event_payload_hash text
)
returns setof public.settlement_submission_intents
language plpgsql
security definer
set search_path = ''
as $$
declare
  intent public.settlement_submission_intents%rowtype;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'service role required'; end if;
  if expected_principal_hash is null or expected_principal_hash !~ '^[0-9a-f]{64}$'
    or expected_idempotency_key is null or expected_idempotency_key !~ '^[0-9a-f]{64}$'
    or signed_body_digest is null or signed_body_digest !~ '^[0-9a-f]{64}$'
    or accepted_execution_id is null or accepted_execution_id !~ '^[A-Za-z0-9_-]{6,128}$'
    or execution_digest is null or execution_digest !~ '^[0-9a-f]{64}$'
    or event_payload_hash is null or event_payload_hash !~ '^[0-9a-f]{64}$'
  then raise exception 'invalid durable acceptance binding'; end if;
  if accepted_timestamp is null
    or accepted_timestamp < now() - interval '5 minutes'
    or accepted_timestamp > now() + interval '1 minute'
  then raise exception 'submission acceptance timestamp outside freshness window'; end if;
  if jsonb_typeof(accepted_execution_record) is distinct from 'object'
  then raise exception 'invalid or unbounded execution response'; end if;
  if pg_column_size(accepted_execution_record) > 65536
    or accepted_execution_record ->> 'executionId' is distinct from accepted_execution_id
  then raise exception 'invalid or unbounded execution response'; end if;

  select i.* into intent
  from public.settlement_submission_intents i
  where i.idempotency_key = expected_idempotency_key
  for update;
  if not found then raise exception 'SUBMISSION_INTENT_NOT_PREPARED'; end if;
  if intent.principal_subject_hash is distinct from expected_principal_hash
    or intent.signed_body_hash is distinct from signed_body_digest
  then raise exception 'SUBMISSION_ACCEPTANCE_CONFLICT'; end if;
  if intent.state <> 'prepared' then
    if intent.execution_id is distinct from accepted_execution_id
      or intent.execution_hash is distinct from execution_digest
      or intent.execution_record is distinct from accepted_execution_record
    then raise exception 'SUBMISSION_ACCEPTANCE_CONFLICT'; end if;
    return next intent;
    return;
  end if;
  if intent.revision <> 1 then raise exception 'SUBMISSION_ACCEPTANCE_TRANSITION_REJECTED'; end if;

  update public.settlement_submission_intents
  set state = 'accepted', execution_id = accepted_execution_id,
      execution_hash = execution_digest, execution_record = accepted_execution_record,
      revision = 2, accepted_at = accepted_timestamp
  where idempotency_key = expected_idempotency_key
  returning * into intent;
  insert into public.settlement_submission_events(
    idempotency_key, principal_subject_hash, revision, event_kind, state, payload_hash
  ) values (
    expected_idempotency_key, expected_principal_hash, 2, 'accepted', 'accepted', event_payload_hash
  );
  return next intent;
end;
$$;

create or replace function public.assert_durable_settlement_observation_access(
  accepted_execution_id text,
  expected_principal_hash text,
  capability_authorized boolean,
  expected_plan_hash text,
  expected_ledger_hash text,
  target_chain_id bigint,
  target_contract_address text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  intent public.settlement_submission_intents%rowtype;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'service role required'; end if;
  if accepted_execution_id is null or accepted_execution_id !~ '^[A-Za-z0-9_-]{6,128}$'
    or (expected_principal_hash is null and capability_authorized is distinct from true)
    or (expected_principal_hash is not null and expected_principal_hash !~ '^[0-9a-f]{64}$')
    or expected_plan_hash is null or expected_plan_hash !~* '^0x[0-9a-f]{64}$'
    or expected_ledger_hash is null or expected_ledger_hash !~* '^0x[0-9a-f]{64}$'
    or target_chain_id is distinct from 84532
    or target_contract_address is null or target_contract_address !~* '^0x[0-9a-f]{40}$'
  then raise exception 'invalid durable observation authority'; end if;
  select i.* into intent
  from public.settlement_submission_intents i
  where i.execution_id = accepted_execution_id;
  if not found then raise exception 'SUBMISSION_ACCEPTANCE_NOT_FOUND'; end if;
  if (expected_principal_hash is not null and intent.principal_subject_hash is distinct from expected_principal_hash)
    or lower(intent.plan_hash) is distinct from lower(expected_plan_hash)
    or lower(intent.ledger_hash) is distinct from lower(expected_ledger_hash)
    or intent.chain_id is distinct from target_chain_id
    or lower(intent.contract_address) is distinct from lower(target_contract_address)
  then raise exception 'SUBMISSION_OBSERVATION_ACCESS_REJECTED'; end if;
  return true;
end;
$$;

create or replace function public.record_durable_settlement_observation(
  accepted_execution_id text,
  expected_principal_hash text,
  capability_authorized boolean,
  expected_plan_hash text,
  expected_ledger_hash text,
  target_chain_id bigint,
  target_contract_address text,
  target_state text,
  observed_status_record jsonb,
  keeperhub_status_digest text,
  independent_proof_record jsonb,
  proof_digest text,
  observed_timestamp timestamptz,
  event_payload_hash text
)
returns setof public.settlement_submission_intents
language plpgsql
security definer
set search_path = ''
as $$
declare
  intent public.settlement_submission_intents%rowtype;
  next_revision integer;
  next_event text;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'service role required'; end if;
  if accepted_execution_id is null or accepted_execution_id !~ '^[A-Za-z0-9_-]{6,128}$'
    or (expected_principal_hash is null and capability_authorized is distinct from true)
    or (expected_principal_hash is not null and expected_principal_hash !~ '^[0-9a-f]{64}$')
    or expected_plan_hash is null or expected_plan_hash !~* '^0x[0-9a-f]{64}$'
    or expected_ledger_hash is null or expected_ledger_hash !~* '^0x[0-9a-f]{64}$'
    or target_contract_address is null or target_contract_address !~* '^0x[0-9a-f]{40}$'
    or target_state is null or target_state not in ('completed_unverified', 'verified_settled', 'failed', 'timeout')
    or keeperhub_status_digest is null or keeperhub_status_digest !~ '^[0-9a-f]{64}$'
    or proof_digest is null or proof_digest !~ '^[0-9a-f]{64}$'
    or event_payload_hash is null or event_payload_hash !~ '^[0-9a-f]{64}$'
  then raise exception 'invalid durable observation binding'; end if;
  if target_chain_id is distinct from 84532 then raise exception 'only the Base Sepolia adapter is enabled'; end if;
  if observed_timestamp is null
    or observed_timestamp < now() - interval '5 minutes'
    or observed_timestamp > now() + interval '1 minute'
  then raise exception 'submission observation timestamp outside freshness window'; end if;
  if jsonb_typeof(observed_status_record) is distinct from 'object'
    or jsonb_typeof(independent_proof_record) is distinct from 'object'
  then raise exception 'SUBMISSION_PROOF_BINDING_MISMATCH'; end if;
  if pg_column_size(observed_status_record) > 196608
    or pg_column_size(independent_proof_record) > 196608
  then raise exception 'submission observation exceeds bounded storage'; end if;
  if jsonb_typeof(independent_proof_record -> 'receiptHashes') is distinct from 'array'
  then raise exception 'SUBMISSION_PROOF_BINDING_MISMATCH'; end if;

  select i.* into intent
  from public.settlement_submission_intents i
  where i.execution_id = accepted_execution_id
  for update;
  if not found then raise exception 'SUBMISSION_ACCEPTANCE_NOT_FOUND'; end if;
  if (expected_principal_hash is not null and intent.principal_subject_hash is distinct from expected_principal_hash)
    or lower(intent.plan_hash) is distinct from lower(expected_plan_hash)
    or lower(intent.ledger_hash) is distinct from lower(expected_ledger_hash)
    or intent.chain_id is distinct from target_chain_id
    or lower(intent.contract_address) is distinct from lower(target_contract_address)
    or observed_status_record ->> 'executionId' is distinct from intent.execution_id
    or independent_proof_record ->> 'executionId' is distinct from intent.execution_id
    or lower(independent_proof_record ->> 'settlementId') is distinct from lower(intent.plan_hash)
    or lower(independent_proof_record ->> 'ledgerHash') is distinct from lower(intent.ledger_hash)
    or lower(independent_proof_record ->> 'contractAddress') is distinct from lower(intent.contract_address)
    or independent_proof_record ->> 'chainId' is distinct from intent.chain_id::text
  then raise exception 'SUBMISSION_PROOF_BINDING_MISMATCH'; end if;

  if target_state = 'verified_settled' then
    if jsonb_typeof(observed_status_record -> 'receipts') is distinct from 'array'
    then raise exception 'VERIFIED_SUBMISSION_REQUIRES_EXACT_CHAIN_PROOF'; end if;
    if jsonb_array_length(observed_status_record -> 'receipts') < 1
      or jsonb_array_length(observed_status_record -> 'receipts') > 20
      or jsonb_array_length(independent_proof_record -> 'receiptHashes')
         <> jsonb_array_length(observed_status_record -> 'receipts')
      or observed_status_record ->> 'status' is distinct from 'completed'
      or independent_proof_record ->> 'verified' is distinct from 'true'
      or independent_proof_record #>> '{independent,verified}' is distinct from 'true'
      or exists (
        select 1
        from jsonb_array_elements(observed_status_record -> 'receipts') receipt
        where jsonb_typeof(receipt) is distinct from 'object'
          or receipt ->> 'verified' is distinct from 'true'
          or receipt ->> 'receiptStatus' is distinct from 'success'
          or coalesce(receipt ->> 'hash', '') !~* '^0x[0-9a-f]{64}$'
          or receipt ->> 'chainId' is distinct from intent.chain_id::text
          or not (independent_proof_record -> 'receiptHashes' ? lower(coalesce(receipt ->> 'hash', '')))
      )
    then raise exception 'VERIFIED_SUBMISSION_REQUIRES_EXACT_CHAIN_PROOF'; end if;
  elsif target_state = 'failed' then
    if coalesce(observed_status_record ->> 'status', '') not in ('failed', 'cancelled', 'completed')
    then raise exception 'FAILED_SUBMISSION_REQUIRES_PROVIDER_FAILURE'; end if;
    if observed_status_record ->> 'status' = 'completed' then
      if jsonb_typeof(observed_status_record -> 'receipts') is distinct from 'array'
      then raise exception 'FAILED_SUBMISSION_REQUIRES_PROVIDER_FAILURE'; end if;
      if jsonb_array_length(observed_status_record -> 'receipts') < 1
        or jsonb_array_length(observed_status_record -> 'receipts') > 20
        or exists (
          select 1 from jsonb_array_elements(observed_status_record -> 'receipts') receipt
          where jsonb_typeof(receipt) is distinct from 'object'
            or coalesce(receipt ->> 'hash', '') !~* '^0x[0-9a-f]{64}$'
            or receipt ->> 'chainId' is distinct from intent.chain_id::text
            or receipt ->> 'verified' is distinct from 'true'
            or receipt ->> 'receiptStatus' is null
        )
        or not exists (
          select 1 from jsonb_array_elements(observed_status_record -> 'receipts') receipt
          where receipt ->> 'receiptStatus' in ('reverted', 'safe_inner_failure')
        )
      then raise exception 'FAILED_SUBMISSION_REQUIRES_PROVIDER_FAILURE'; end if;
    end if;
  elsif target_state = 'completed_unverified' then
    if observed_status_record ->> 'status' is distinct from 'completed'
    then raise exception 'UNVERIFIED_SUBMISSION_REQUIRES_COMPLETED_STATUS'; end if;
  else
    if jsonb_typeof(observed_status_record -> 'receipts') is distinct from 'array'
    then raise exception 'TIMEOUT_SUBMISSION_REQUIRES_TIMEOUT_RECEIPT'; end if;
    if not exists (
      select 1 from jsonb_array_elements(observed_status_record -> 'receipts') receipt
      where jsonb_typeof(receipt) = 'object'
        and receipt ->> 'receiptStatus' in ('timeout', 'not_found')
    ) then raise exception 'TIMEOUT_SUBMISSION_REQUIRES_TIMEOUT_RECEIPT'; end if;
  end if;

  if intent.state = 'verified_settled' then
    return next intent;
    return;
  end if;
  if intent.state in ('completed_unverified', 'timeout') and target_state = 'verified_settled' then
    next_revision := 4;
    next_event := 'reconciled';
  elsif intent.state = 'accepted' then
    next_revision := 3;
    next_event := 'terminal';
  elsif intent.state = target_state then
    return next intent;
    return;
  else
    raise exception 'SUBMISSION_OBSERVATION_TRANSITION_REJECTED';
  end if;

  update public.settlement_submission_intents
  set state = target_state, keeperhub_status = observed_status_record,
      keeperhub_status_hash = keeperhub_status_digest,
      independent_proof = independent_proof_record, proof_hash = proof_digest,
      revision = next_revision, observed_at = observed_timestamp
  where idempotency_key = intent.idempotency_key
  returning * into intent;
  insert into public.settlement_submission_events(
    idempotency_key, principal_subject_hash, revision, event_kind, state, payload_hash
  ) values (
    intent.idempotency_key, intent.principal_subject_hash, next_revision,
    next_event, target_state, event_payload_hash
  );
  return next intent;
end;
$$;

revoke all on function public.read_durable_settlement_submission_retry(
  text, text, text, text, timestamptz, text, text, bigint, text, uuid, uuid
) from public, anon, authenticated;
revoke all on function public.prepare_durable_settlement_submission(
  text, text, text, text, timestamptz, text, jsonb, text, text, bigint, text, uuid, uuid, timestamptz, text
) from public, anon, authenticated;
revoke all on function public.record_durable_settlement_acceptance(
  text, text, text, text, jsonb, text, timestamptz, text
) from public, anon, authenticated;
revoke all on function public.assert_durable_settlement_observation_access(
  text, text, boolean, text, text, bigint, text
) from public, anon, authenticated;
revoke all on function public.record_durable_settlement_observation(
  text, text, boolean, text, text, bigint, text, text, jsonb, text, jsonb, text, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.read_durable_settlement_submission_retry(
  text, text, text, text, timestamptz, text, text, bigint, text, uuid, uuid
) to service_role;
grant execute on function public.prepare_durable_settlement_submission(
  text, text, text, text, timestamptz, text, jsonb, text, text, bigint, text, uuid, uuid, timestamptz, text
) to service_role;
grant execute on function public.record_durable_settlement_acceptance(
  text, text, text, text, jsonb, text, timestamptz, text
) to service_role;
grant execute on function public.assert_durable_settlement_observation_access(
  text, text, boolean, text, text, bigint, text
) to service_role;
grant execute on function public.record_durable_settlement_observation(
  text, text, boolean, text, text, bigint, text, text, jsonb, text, jsonb, text, timestamptz, text
) to service_role;
