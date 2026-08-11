-- Durable first-party settlement state machine.
--
-- Browser sessions cannot write money/proof truth tables directly. The narrow
-- RPCs below validate tenant ownership, durable agent evidence, exact relational
-- bindings, bounded payloads and monotonic revisions. Their envelopes are HMAC
-- attested by the app server; first-party reads reject any direct-RPC row whose
-- attestation does not verify.

create table public.settlement_flow_records (
  id uuid primary key,
  -- Retained actor snapshot; lifecycle ownership is the tab, not the account.
  created_by uuid not null,
  tab_id uuid not null references public.tabs(id) on delete cascade,
  -- The live run pointer may disappear during account/data lifecycle cleanup.
  -- The immutable snapshot/id/hash below keeps shared financial proof intact.
  agent_run_id uuid unique references public.settlement_agent_runs(id) on delete set null,
  agent_run_id_snapshot uuid not null unique,
  agent_run_snapshot jsonb not null check (
    jsonb_typeof(agent_run_snapshot) is not distinct from 'object'
    and pg_column_size(agent_run_snapshot) <= 131072
  ),
  agent_run_hash text not null check (agent_run_hash ~ '^[0-9a-f]{64}$'),
  receipt_id uuid not null references public.receipts(id)
    on delete no action deferrable initially deferred,
  allocation_id uuid not null references public.allocations(id)
    on delete no action deferrable initially deferred,
  ledger_id uuid not null unique references public.ledgers(id)
    on delete no action deferrable initially deferred,
  settlement_record_id uuid not null unique references public.settlements(id)
    on delete no action deferrable initially deferred,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  canonical_hash text not null check (canonical_hash ~ '^[0-9a-f]{64}$'),
  transfer_hash text not null check (transfer_hash ~ '^[0-9a-f]{64}$'),
  ledger_hash text not null check (ledger_hash ~* '^0x[0-9a-f]{64}$'),
  plan_hash text not null check (plan_hash ~* '^0x[0-9a-f]{64}$'),
  chain_id bigint not null check (chain_id = 84532),
  contract_address text not null check (contract_address ~* '^0x[0-9a-f]{40}$'),
  state text not null check (state in (
    'frozen', 'simulated', 'submitted', 'completed_unverified',
    'verified_settled', 'failed', 'timeout'
  )),
  signed_body_hash text check (signed_body_hash is null or signed_body_hash ~ '^[0-9a-f]{64}$'),
  simulation_hash text check (simulation_hash is null or simulation_hash ~ '^[0-9a-f]{64}$'),
  execution_id text check (
    execution_id is null or
    (char_length(execution_id) between 6 and 128 and execution_id ~ '^[A-Za-z0-9_-]+$')
  ),
  execution_hash text check (execution_hash is null or execution_hash ~ '^[0-9a-f]{64}$'),
  execution_result jsonb,
  keeperhub_status_hash text check (keeperhub_status_hash is null or keeperhub_status_hash ~ '^[0-9a-f]{64}$'),
  keeperhub_status jsonb,
  proof_hash text check (proof_hash is null or proof_hash ~ '^[0-9a-f]{64}$'),
  independent_proof jsonb,
  revision integer not null check (revision between 1 and 5),
  attested_at timestamptz not null,
  attestation text not null check (attestation ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, tab_id, agent_run_id_snapshot),
  check (
    (revision = 1 and state = 'frozen'
      and signed_body_hash is null and simulation_hash is null
      and execution_id is null and execution_hash is null and execution_result is null
      and keeperhub_status_hash is null and keeperhub_status is null
      and proof_hash is null and independent_proof is null)
    or
    (revision = 2 and state = 'simulated'
      and signed_body_hash is not null and simulation_hash is not null
      and execution_id is null and execution_hash is null and execution_result is null
      and keeperhub_status_hash is null and keeperhub_status is null
      and proof_hash is null and independent_proof is null)
    or
    (revision = 3 and state = 'submitted'
      and signed_body_hash is not null and simulation_hash is not null
      and execution_id is not null and execution_hash is not null
      and jsonb_typeof(execution_result) is not distinct from 'object'
      and keeperhub_status_hash is null and keeperhub_status is null
      and proof_hash is null and independent_proof is null)
    or
    (revision = 4 and state in ('completed_unverified', 'verified_settled', 'failed', 'timeout')
      and signed_body_hash is not null and simulation_hash is not null
      and execution_id is not null and execution_hash is not null
      and jsonb_typeof(execution_result) is not distinct from 'object'
      and keeperhub_status_hash is not null
      and jsonb_typeof(keeperhub_status) is not distinct from 'object'
      and proof_hash is not null
      and jsonb_typeof(independent_proof) is not distinct from 'object')
    or
    (revision = 5 and state = 'verified_settled'
      and signed_body_hash is not null and simulation_hash is not null
      and execution_id is not null and execution_hash is not null
      and jsonb_typeof(execution_result) is not distinct from 'object'
      and keeperhub_status_hash is not null
      and jsonb_typeof(keeperhub_status) is not distinct from 'object'
      and proof_hash is not null
      and jsonb_typeof(independent_proof) is not distinct from 'object')
  )
);

create table public.settlement_flow_events (
  id bigint generated always as identity primary key,
  flow_id uuid not null references public.settlement_flow_records(id) on delete cascade,
  created_by uuid not null,
  tab_id uuid not null references public.tabs(id) on delete cascade,
  revision integer not null check (revision between 1 and 5),
  event_kind text not null check (event_kind in ('frozen', 'simulated', 'submitted', 'terminal', 'reconciled')),
  state text not null check (state in (
    'frozen', 'simulated', 'submitted', 'completed_unverified',
    'verified_settled', 'failed', 'timeout'
  )),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  attested_at timestamptz not null,
  attestation text not null check (attestation ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (flow_id, revision)
);

create index idx_settlement_flows_creator_updated
  on public.settlement_flow_records(created_by, updated_at desc);
create index idx_settlement_flows_tab_updated
  on public.settlement_flow_records(tab_id, updated_at desc);
create index idx_settlement_flows_receipt on public.settlement_flow_records(receipt_id);
create index idx_settlement_flows_allocation on public.settlement_flow_records(allocation_id);
create index idx_settlement_flows_live_run on public.settlement_flow_records(agent_run_id)
  where agent_run_id is not null;
create index idx_settlement_flow_events_creator on public.settlement_flow_events(created_by, created_at desc);
create index idx_settlement_flow_events_tab on public.settlement_flow_events(tab_id, created_at desc);

drop trigger if exists set_settlement_flow_updated_at on public.settlement_flow_records;
create trigger set_settlement_flow_updated_at before update on public.settlement_flow_records
for each row execute function public.set_updated_at();

alter table public.settlement_flow_records enable row level security;
alter table public.settlement_flow_events enable row level security;

create policy settlement_flows_select_members on public.settlement_flow_records
for select to authenticated
using (
  private.is_tab_member(tab_id)
);

create policy settlement_flow_events_select_members on public.settlement_flow_events
for select to authenticated
using (
  private.is_tab_member(tab_id)
);

revoke all on public.settlement_flow_records, public.settlement_flow_events
  from public, anon, authenticated;
grant select on public.settlement_flow_records, public.settlement_flow_events to authenticated;

create or replace function private.assert_settlement_source_mutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_tab uuid;
  new_tab uuid;
begin
  -- Auth-admin deletion and a parent tab's explicit cascading delete must not
  -- be stranded by child immutability guards.
  if tg_op = 'DELETE' and ((select auth.uid()) is null or pg_trigger_depth() > 1) then
    return old;
  end if;
  if tg_op <> 'INSERT' then
    if tg_table_name = 'receipt_items' then
      select r.tab_id into old_tab from public.receipts r where r.id = old.receipt_id;
    else
      old_tab := old.tab_id;
    end if;
  end if;
  if tg_op <> 'DELETE' then
    if tg_table_name = 'receipt_items' then
      select r.tab_id into new_tab from public.receipts r where r.id = new.receipt_id;
    else
      new_tab := new.tab_id;
    end if;
  end if;

  -- Serialize draft inserts/moves against Freeze's parent-tab lock. If Freeze
  -- wins, this statement wakes and observes the new flow/non-open state. If
  -- the edit wins, Freeze locks afterward and revalidates every source row.
  perform 1
  from public.tabs t
  where t.id in (old_tab, new_tab)
  order by t.id
  for update;

  -- Check both parents on UPDATE. Otherwise a caller could move a frozen
  -- receipt/allocation to an open tab, or move an item to another receipt,
  -- and mutate the source underneath a valid attested flow.
  if exists (
    select 1 from public.tabs t
    where t.id in (old_tab, new_tab) and t.status <> 'open'
  ) or exists (
    select 1 from public.settlement_flow_records f
    where f.tab_id in (old_tab, new_tab)
  ) then
    raise exception 'SETTLEMENT_SOURCE_IMMUTABLE_AFTER_FREEZE';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function private.assert_tab_financial_binding_mutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    new.currency is distinct from old.currency
    or new.payer_participant_id is distinct from old.payer_participant_id
  ) and (
    old.status <> 'open'
    or exists (select 1 from public.settlement_flow_records f where f.tab_id = old.id)
  ) then
    raise exception 'TAB_FINANCIAL_BINDING_IMMUTABLE_AFTER_FREEZE';
  end if;
  return new;
end;
$$;

create or replace function private.user_can_edit_settlement_tab(actor_id uuid, target_tab uuid)
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

create or replace function private.prevent_financial_tab_hard_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Account-erasure/admin workflows are explicit server operations. Ordinary
  -- owners may delete an unused open tab, but settled financial history is an
  -- append-only shared record and must use the separately reviewed erasure path.
  if (select auth.role()) = 'service_role' or session_user = 'supabase_auth_admin' then return old; end if;
  if (select auth.uid()) is null then raise exception 'authenticated tab owner required'; end if;
  if old.status <> 'open'
    or exists (select 1 from public.receipts r where r.tab_id = old.id)
    or exists (select 1 from public.allocations a where a.tab_id = old.id)
    or exists (select 1 from public.ledgers l where l.tab_id = old.id)
    or exists (select 1 from public.settlement_flow_records f where f.tab_id = old.id)
  then raise exception 'TAB_FINANCIAL_HISTORY_REQUIRES_SERVICE_ERASURE'; end if;
  return old;
end;
$$;

revoke all on function private.assert_settlement_source_mutable() from public, anon, authenticated;
revoke all on function private.assert_tab_financial_binding_mutable() from public, anon, authenticated;
revoke all on function private.user_can_edit_settlement_tab(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.prevent_financial_tab_hard_delete() from public, anon, authenticated, service_role;
drop trigger if exists immutable_frozen_participants on public.participants;
create trigger immutable_frozen_participants before insert or update or delete on public.participants
for each row execute function private.assert_settlement_source_mutable();
drop trigger if exists immutable_frozen_receipts on public.receipts;
create trigger immutable_frozen_receipts before insert or update or delete on public.receipts
for each row execute function private.assert_settlement_source_mutable();
drop trigger if exists immutable_frozen_receipt_items on public.receipt_items;
create trigger immutable_frozen_receipt_items before insert or update or delete on public.receipt_items
for each row execute function private.assert_settlement_source_mutable();
drop trigger if exists immutable_frozen_allocations on public.allocations;
create trigger immutable_frozen_allocations before insert or update or delete on public.allocations
for each row execute function private.assert_settlement_source_mutable();
drop trigger if exists immutable_frozen_tab_binding on public.tabs;
create trigger immutable_frozen_tab_binding before update of currency, payer_participant_id on public.tabs
for each row execute function private.assert_tab_financial_binding_mutable();
drop trigger if exists protect_financial_tab_history on public.tabs;
create trigger protect_financial_tab_history before delete on public.tabs
for each row execute function private.prevent_financial_tab_hard_delete();

create or replace function public.freeze_reviewed_settlement_flow(
  requested_flow uuid,
  target_run uuid,
  expected_owner uuid,
  expected_input_hash text,
  expected_run_snapshot jsonb,
  expected_run_hash text,
  expected_receipt uuid,
  expected_allocation uuid,
  requested_ledger uuid,
  requested_settlement uuid,
  ledger_document jsonb,
  expected_canonical_hash text,
  expected_ledger_hash text,
  expected_plan_hash text,
  target_chain_id bigint,
  target_contract_address text,
  transfer_rows jsonb,
  expected_transfer_hash text,
  event_payload_hash text,
  server_attested_at timestamptz,
  server_attestation text,
  server_event_attestation text
)
returns setof public.settlement_flow_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := expected_owner;
  run_record public.settlement_agent_runs%rowtype;
  existing public.settlement_flow_records%rowtype;
  created public.settlement_flow_records%rowtype;
  target_tab uuid;
  target_tab_status text;
  target_tab_currency text;
  payer_id uuid;
  snapshot_attested_at timestamptz;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'service role required'; end if;
  if caller is null then raise exception 'expected owner is required'; end if;
  if requested_flow is null or target_run is null or expected_receipt is null
    or expected_allocation is null or requested_ledger is null or requested_settlement is null
  then raise exception 'required settlement flow identifier is null'; end if;
  if expected_input_hash is null or expected_input_hash !~ '^[0-9a-f]{64}$'
    or expected_run_hash is null or expected_run_hash !~ '^[0-9a-f]{64}$'
    or expected_canonical_hash is null or expected_canonical_hash !~ '^[0-9a-f]{64}$'
    or expected_transfer_hash is null or expected_transfer_hash !~ '^[0-9a-f]{64}$'
    or event_payload_hash is null or event_payload_hash !~ '^[0-9a-f]{64}$'
    or expected_ledger_hash is null or expected_ledger_hash !~* '^0x[0-9a-f]{64}$'
    or expected_plan_hash is null or expected_plan_hash !~* '^0x[0-9a-f]{64}$'
    or server_attestation is null or server_attestation !~ '^[0-9a-f]{64}$'
    or server_event_attestation is null or server_event_attestation !~ '^[0-9a-f]{64}$'
  then raise exception 'invalid settlement flow digest'; end if;
  if jsonb_typeof(expected_run_snapshot) is distinct from 'object'
    or pg_column_size(expected_run_snapshot) > 131072
  then raise exception 'invalid durable run snapshot'; end if;
  if server_attested_at is null or server_attested_at < now() - interval '5 minutes' or server_attested_at > now() + interval '1 minute' then
    raise exception 'settlement flow attestation outside freshness window';
  end if;
  if target_chain_id is distinct from 84532 or target_contract_address is null or target_contract_address !~* '^0x[0-9a-f]{40}$' then
    raise exception 'only the Base Sepolia adapter is enabled';
  end if;
  if jsonb_typeof(ledger_document) is distinct from 'object'
    or jsonb_typeof(transfer_rows) is distinct from 'array'
  then raise exception 'invalid or unbounded frozen ledger'; end if;
  if jsonb_array_length(transfer_rows) < 1
    or jsonb_array_length(transfer_rows) > 50
    or pg_column_size(ledger_document) > 196608
    or pg_column_size(transfer_rows) > 65536
  then raise exception 'invalid or unbounded frozen ledger'; end if;

  -- Establish a single lock order for the first-party graph. Read the run's
  -- tab pointer without locking it, then lock the parent tab first and re-lock
  -- the run underneath that parent. A concurrent deletion/move either wins
  -- first and fails the recheck, or waits until the frozen binding exists.
  select r.tab_id into target_tab
  from public.settlement_agent_runs r
  where r.id = target_run and r.owner_id = caller;
  if not found then raise exception 'ATTESTED_RUN_NOT_FOUND'; end if;

  select t.status, t.currency::text into target_tab_status, target_tab_currency
  from public.tabs t
  where t.id = target_tab
  for update;
  if not found or not private.user_can_edit_settlement_tab(caller, target_tab) then
    raise exception 'tab editor access required';
  end if;

  select r.* into run_record
  from public.settlement_agent_runs r
  where r.id = target_run and r.owner_id = caller and r.tab_id = target_tab
  for update;
  if not found then raise exception 'ATTESTED_RUN_NOT_FOUND'; end if;
  if run_record.status not in ('ready', 'verified') or run_record.stage_count <> 4 then
    raise exception 'ATTESTED_RUN_NOT_READY';
  end if;
  if run_record.input_hash is distinct from expected_input_hash
    or run_record.result_summary ->> 'receiptId' is distinct from expected_receipt::text
    or run_record.result_summary ->> 'allocationId' is distinct from expected_allocation::text
  then raise exception 'RUN_DURABLE_BINDING_MISMATCH'; end if;
  begin
    snapshot_attested_at := (expected_run_snapshot ->> 'attestedAt')::timestamptz;
  exception when others then
    raise exception 'RUN_SNAPSHOT_BINDING_MISMATCH';
  end;
  if expected_run_snapshot ->> 'version' is distinct from '1'
    or expected_run_snapshot ->> 'id' is distinct from run_record.id::text
    or expected_run_snapshot ->> 'ownerId' is distinct from run_record.owner_id::text
    or expected_run_snapshot ->> 'tabId' is distinct from run_record.tab_id::text
    or expected_run_snapshot ->> 'inputHash' is distinct from run_record.input_hash
    or expected_run_snapshot -> 'inputSnapshot' is distinct from run_record.input_snapshot
    or expected_run_snapshot ->> 'status' is distinct from run_record.status
    or expected_run_snapshot ->> 'stageCount' is distinct from run_record.stage_count::text
    or expected_run_snapshot -> 'resultSummary' is distinct from run_record.result_summary
    or snapshot_attested_at is distinct from run_record.attested_at
    or expected_run_snapshot ->> 'attestation' is distinct from run_record.attestation
  then raise exception 'RUN_SNAPSHOT_BINDING_MISMATCH'; end if;

  select f.* into existing
  from public.settlement_flow_records f
  where f.agent_run_id_snapshot = target_run
  for update;
  if found then
    if existing.id <> requested_flow
      or existing.created_by <> caller
      or existing.receipt_id <> expected_receipt
      or existing.allocation_id <> expected_allocation
      or existing.ledger_id <> requested_ledger
      or existing.settlement_record_id <> requested_settlement
      or existing.input_hash <> expected_input_hash
      or existing.agent_run_hash <> expected_run_hash
      or existing.agent_run_snapshot <> expected_run_snapshot
      or existing.canonical_hash <> expected_canonical_hash
      or lower(existing.ledger_hash) <> lower(expected_ledger_hash)
      or lower(existing.plan_hash) <> lower(expected_plan_hash)
      or existing.chain_id <> target_chain_id
      or lower(existing.contract_address) <> lower(target_contract_address)
      or existing.transfer_hash <> expected_transfer_hash
    then raise exception 'FLOW_FREEZE_MISMATCH'; end if;
    return next existing;
    return;
  end if;

  if target_tab_status <> 'open' or target_tab_currency <> 'USD' then
    raise exception 'FLOW_REQUIRES_OPEN_USD_TAB';
  end if;

  begin
    payer_id := (run_record.input_snapshot ->> 'payerParticipantId')::uuid;
  exception when others then
    raise exception 'RUN_PAYER_BINDING_INVALID';
  end;
  if payer_id::text is distinct from run_record.result_summary ->> 'payerParticipantId' then
    raise exception 'RUN_PAYER_BINDING_MISMATCH';
  end if;

  -- Lock every source row in deterministic table/id order before validating
  -- the HMAC-bound snapshot. These locks close the server-read/RPC-write gap.
  perform 1 from public.receipts r
  where r.id = expected_receipt and r.tab_id = target_tab
  for update;
  if not found then raise exception 'RUN_RECEIPT_BINDING_MISMATCH'; end if;
  perform 1 from public.allocations a
  where a.id = expected_allocation and a.tab_id = target_tab
  for update;
  if not found then raise exception 'RUN_ALLOCATION_BINDING_MISMATCH'; end if;
  perform 1 from public.participants p
  where p.tab_id = target_tab
  order by p.id
  for update;
  perform 1 from public.receipt_items i
  where i.receipt_id = expected_receipt
  order by i.id
  for update;

  if not exists (
    select 1 from public.receipts r
    where r.id = expected_receipt and r.tab_id = target_tab
      and r.confirmed_by = caller and r.confirmed_at is not null
      and r.raw_extraction = run_record.input_snapshot -> 'receipt'
  ) then raise exception 'RUN_RECEIPT_BINDING_MISMATCH'; end if;
  if not exists (
    select 1 from public.allocations a
    where a.id = expected_allocation
      and a.tab_id = target_tab
      and a.instruction = run_record.input_snapshot ->> 'instruction'
      and a.model_proposal = jsonb_set(
        run_record.input_snapshot -> 'existingProposal',
        '{payerId}',
        to_jsonb(payer_id::text),
        true
      )
  ) then raise exception 'RUN_ALLOCATION_BINDING_MISMATCH'; end if;
  if jsonb_typeof(run_record.input_snapshot #> '{receipt,items}') is distinct from 'array'
  then raise exception 'RUN_RECEIPT_ITEMS_BINDING_MISMATCH'; end if;
  if jsonb_array_length(run_record.input_snapshot #> '{receipt,items}') < 1
    or jsonb_array_length(run_record.input_snapshot #> '{receipt,items}') > 100
    or (select count(*) from public.receipt_items i where i.receipt_id = expected_receipt)
       <> jsonb_array_length(run_record.input_snapshot #> '{receipt,items}')
    or exists (
      select 1
      from jsonb_array_elements(run_record.input_snapshot #> '{receipt,items}')
        with ordinality expected(item, position)
      left join public.receipt_items i
        on i.receipt_id = expected_receipt and i.position = expected.position - 1
      where i.id is null
        or i.label is distinct from expected.item ->> 'description'
        or i.quantity::text is distinct from expected.item ->> 'quantity'
        or coalesce(expected.item ->> 'lineTotal', '') !~ '^[0-9]+([.][0-9]{1,2})?$'
        or i.amount_minor is distinct from (((expected.item ->> 'lineTotal')::numeric * 100)::bigint)
    )
  then raise exception 'RUN_RECEIPT_ITEMS_BINDING_MISMATCH'; end if;
  if jsonb_typeof(run_record.input_snapshot -> 'participants') is distinct from 'array'
    or jsonb_typeof(ledger_document -> 'participants') is distinct from 'array'
  then raise exception 'RUN_PARTICIPANT_BINDING_MISMATCH'; end if;
  if jsonb_array_length(run_record.input_snapshot -> 'participants') < 2
    or jsonb_array_length(run_record.input_snapshot -> 'participants') > 32
    or jsonb_array_length(ledger_document -> 'participants')
       <> jsonb_array_length(run_record.input_snapshot -> 'participants')
    or (select count(*) from public.participants p where p.tab_id = target_tab)
       <> jsonb_array_length(run_record.input_snapshot -> 'participants')
    or exists (
      select 1
      from public.participants p
      left join jsonb_to_recordset(run_record.input_snapshot -> 'participants')
        as reviewed(id text, name text, "walletAddress" text)
        on reviewed.id = p.id::text
      left join jsonb_to_recordset(ledger_document -> 'participants')
        as frozen(id text, address text, "displayName" text)
        on frozen.id = p.id::text
      where p.tab_id = target_tab
        and (
          p.wallet_address is null
          or reviewed.id is null
          or frozen.id is null
          or reviewed.name is distinct from p.display_name
          or lower(reviewed."walletAddress") is distinct from lower(p.wallet_address)
          or frozen."displayName" is distinct from p.display_name
          or lower(frozen.address) is distinct from lower(p.wallet_address)
        )
    )
    or (select count(distinct lower(p.wallet_address)) from public.participants p where p.tab_id = target_tab)
       <> (select count(*) from public.participants p where p.tab_id = target_tab)
  then raise exception 'RUN_PARTICIPANT_BINDING_MISMATCH'; end if;
  if not exists (
    select 1 from public.participants p
    where p.id = payer_id and p.tab_id = target_tab
  ) then raise exception 'RUN_PAYER_NOT_IN_TAB'; end if;
  if jsonb_typeof(ledger_document -> 'receiptIds') is distinct from 'array'
    or jsonb_typeof(ledger_document -> 'transfers') is distinct from 'array'
  then raise exception 'LEDGER_DOCUMENT_BINDING_MISMATCH'; end if;
  if ledger_document ->> 'chainId' is distinct from '84532'
    or ledger_document ->> 'version' is distinct from '1'
    or lower(ledger_document ->> 'token') is distinct from '0x036cbd53842c5426634e7929541ec2318f3dcf7e'
    or jsonb_array_length(ledger_document -> 'receiptIds') is distinct from 1
    or ledger_document #>> '{receiptIds,0}' is distinct from expected_receipt::text
    or jsonb_array_length(ledger_document -> 'transfers') <> jsonb_array_length(transfer_rows)
  then raise exception 'LEDGER_DOCUMENT_BINDING_MISMATCH'; end if;
  if exists (
    select 1
    from jsonb_to_recordset(transfer_rows) as x(
      "debtorParticipantId" text,
      "creditorParticipantId" text,
      "usdcMinor" text
    )
    left join public.participants debtor
      on debtor.id::text = x."debtorParticipantId" and debtor.tab_id = run_record.tab_id
    left join public.participants creditor
      on creditor.id::text = x."creditorParticipantId" and creditor.tab_id = run_record.tab_id
    where coalesce(x."debtorParticipantId", '') !~* '^[0-9a-f-]{36}$'
      or coalesce(x."creditorParticipantId", '') !~* '^[0-9a-f-]{36}$'
      or coalesce(x."usdcMinor", '') !~ '^[1-9][0-9]{0,24}$'
      or debtor.id is null or creditor.id is null or debtor.id = creditor.id
  ) then raise exception 'TRANSFER_PARTICIPANT_BINDING_MISMATCH'; end if;
  if exists (
    select 1
    from jsonb_array_elements(transfer_rows) with ordinality as x(transfer, position)
    join public.participants debtor
      on debtor.id::text = (x.transfer ->> 'debtorParticipantId') and debtor.tab_id = target_tab
    join public.participants creditor
      on creditor.id::text = (x.transfer ->> 'creditorParticipantId') and creditor.tab_id = target_tab
    left join jsonb_array_elements(ledger_document -> 'transfers')
      with ordinality frozen(transfer, position)
      on frozen.position = x.position
    where frozen.transfer is null
      or lower(frozen.transfer ->> 'from') is distinct from lower(debtor.wallet_address)
      or lower(frozen.transfer ->> 'to') is distinct from lower(creditor.wallet_address)
      or (frozen.transfer ->> 'value') is distinct from (x.transfer ->> 'usdcMinor')
  ) then raise exception 'LEDGER_TRANSFER_BINDING_MISMATCH'; end if;

  insert into public.ledgers(
    id, tab_id, canonical_json, ledger_hash, plan_hash, chain_id, contract_address
  ) values (
    requested_ledger, run_record.tab_id, ledger_document, lower(expected_ledger_hash),
    lower(expected_plan_hash), target_chain_id, lower(target_contract_address)
  );

  insert into public.transfers(
    ledger_id, debtor_participant_id, creditor_participant_id, usdc_minor
  )
  select requested_ledger, x."debtorParticipantId"::uuid,
         x."creditorParticipantId"::uuid, x."usdcMinor"::bigint
  from jsonb_to_recordset(transfer_rows) as x(
    "debtorParticipantId" text,
    "creditorParticipantId" text,
    "usdcMinor" text
  );

  insert into public.settlements(
    id, ledger_id, settlement_id, chain_id, contract_address, status
  ) values (
    requested_settlement, requested_ledger, lower(expected_plan_hash),
    target_chain_id, lower(target_contract_address), 'draft'
  );

  update public.tabs
  set payer_participant_id = payer_id, status = 'frozen'
  where id = run_record.tab_id;

  insert into public.settlement_flow_records(
    id, created_by, tab_id, agent_run_id, agent_run_id_snapshot,
    agent_run_snapshot, agent_run_hash, receipt_id, allocation_id,
    ledger_id, settlement_record_id, input_hash, canonical_hash, transfer_hash,
    ledger_hash, plan_hash, chain_id, contract_address, state, revision,
    attested_at, attestation
  ) values (
    requested_flow, caller, run_record.tab_id, target_run, target_run,
    expected_run_snapshot, expected_run_hash, expected_receipt,
    expected_allocation, requested_ledger, requested_settlement,
    expected_input_hash, expected_canonical_hash, expected_transfer_hash,
    lower(expected_ledger_hash), lower(expected_plan_hash), target_chain_id,
    lower(target_contract_address), 'frozen', 1, server_attested_at,
    server_attestation
  ) returning * into created;

  insert into public.settlement_flow_events(
    flow_id, created_by, tab_id, revision, event_kind, state, payload_hash,
    attested_at, attestation
  ) values (
    created.id, caller, created.tab_id, 1, 'frozen', 'frozen',
    event_payload_hash, server_attested_at, server_event_attestation
  );
  insert into public.audit_events(tab_id, settlement_id, actor_id, action, metadata)
  values (
    created.tab_id, created.settlement_record_id, caller,
    'settlement.flow.attestation_received',
    jsonb_build_object('flow_id', created.id, 'revision', 1, 'requires_server_attestation', true)
  );
  return next created;
end;
$$;

create or replace function public.record_reviewed_settlement_simulation(
  target_flow uuid,
  expected_owner uuid,
  expected_revision integer,
  signed_body_digest text,
  simulation_digest text,
  signed_approvals jsonb,
  simulation_record jsonb,
  event_payload_hash text,
  server_attested_at timestamptz,
  server_attestation text,
  server_event_attestation text
)
returns setof public.settlement_flow_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := expected_owner;
  flow public.settlement_flow_records%rowtype;
  affected_count integer;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'service role required'; end if;
  if caller is null then raise exception 'expected owner is required'; end if;
  if target_flow is null or expected_revision is null then raise exception 'required simulation transition argument is null'; end if;
  if signed_body_digest is null or signed_body_digest !~ '^[0-9a-f]{64}$'
    or simulation_digest is null or simulation_digest !~ '^[0-9a-f]{64}$'
    or event_payload_hash is null or event_payload_hash !~ '^[0-9a-f]{64}$'
    or server_attestation is null or server_attestation !~ '^[0-9a-f]{64}$'
    or server_event_attestation is null or server_event_attestation !~ '^[0-9a-f]{64}$'
  then raise exception 'invalid simulation digest'; end if;
  if server_attested_at is null or server_attested_at < now() - interval '5 minutes' or server_attested_at > now() + interval '1 minute' then
    raise exception 'settlement flow attestation outside freshness window';
  end if;
  if jsonb_typeof(signed_approvals) is distinct from 'array'
  then raise exception 'only a successful bounded exact simulation may be recorded'; end if;
  if jsonb_array_length(signed_approvals) < 1
    or jsonb_array_length(signed_approvals) > 50
    or pg_column_size(signed_approvals) > 196608
  then raise exception 'only a successful bounded exact simulation may be recorded'; end if;
  if jsonb_typeof(simulation_record) is distinct from 'object'
  then raise exception 'only a successful bounded exact simulation may be recorded'; end if;
  if pg_column_size(simulation_record) > 65536
    or simulation_record ->> 'success' is distinct from 'true'
    or coalesce(simulation_record ->> 'wouldRevert', 'false') is distinct from 'false'
  then raise exception 'only a successful bounded exact simulation may be recorded'; end if;

  select f.* into flow from public.settlement_flow_records f
  where f.id = target_flow
  for update;
  if not found or not private.user_can_edit_settlement_tab(caller, flow.tab_id) then raise exception 'FLOW_NOT_FOUND_OR_NOT_OWNED'; end if;
  if flow.state in ('simulated', 'submitted', 'completed_unverified', 'verified_settled', 'failed', 'timeout') then
    if flow.signed_body_hash <> signed_body_digest or flow.simulation_hash <> simulation_digest then
      raise exception 'FLOW_SIMULATION_MISMATCH';
    end if;
    return next flow;
    return;
  end if;
  if flow.state <> 'frozen' or expected_revision <> flow.revision + 1 then
    raise exception 'FLOW_SIMULATION_TRANSITION_REJECTED';
  end if;
  perform 1
  from public.settlement_approvals a
  where a.ledger_id = flow.ledger_id
  for update;
  if exists (
    select 1
    from public.settlement_approvals a
    where a.ledger_id = flow.ledger_id and a.status in ('rejected', 'revoked', 'expired')
  ) then raise exception 'FLOW_APPROVAL_ALREADY_REJECTED'; end if;
  if (select count(*) from jsonb_to_recordset(signed_approvals) as x(
      "participantId" text, "walletAddress" text, "debitMinor" text,
      "consentSignature" text, "usdcAuthorization" jsonb, "expiresAt" timestamptz
    )) <> (
      select count(distinct t.debtor_participant_id)
      from public.transfers t where t.ledger_id = flow.ledger_id
    )
  then raise exception 'FLOW_APPROVAL_COUNT_MISMATCH'; end if;
  if exists (
    with expected as (
      select t.debtor_participant_id, sum(t.usdc_minor)::text as debit_minor
      from public.transfers t where t.ledger_id = flow.ledger_id
      group by t.debtor_participant_id
    ), supplied as (
      select x."participantId"::uuid as participant_id,
             lower(x."walletAddress") as wallet_address,
             x."debitMinor" as debit_minor,
             x."consentSignature" as consent_signature,
             x."usdcAuthorization" as usdc_authorization,
             x."expiresAt" as expires_at
      from jsonb_to_recordset(signed_approvals) as x(
        "participantId" text, "walletAddress" text, "debitMinor" text,
        "consentSignature" text, "usdcAuthorization" jsonb, "expiresAt" timestamptz
      )
    )
    select 1
    from expected e
    join public.participants p on p.id = e.debtor_participant_id and p.tab_id = flow.tab_id
    left join supplied s on s.participant_id = e.debtor_participant_id
    where s.participant_id is null
      or p.wallet_address is null
      or s.wallet_address <> lower(p.wallet_address)
      or s.debit_minor <> e.debit_minor
      or coalesce(s.consent_signature, '') !~* '^0x[0-9a-f]{130}$'
      or jsonb_typeof(s.usdc_authorization) is distinct from 'object'
      or pg_column_size(s.usdc_authorization) > 8192
      or s.expires_at is null
      or s.expires_at <= now()
  ) then raise exception 'FLOW_APPROVAL_LEDGER_MISMATCH'; end if;

  insert into public.settlement_approvals(
    ledger_id, participant_id, user_id, wallet_address, plan_hash,
    debit_minor, consent_signature, usdc_authorization, status,
    expires_at, signed_at
  )
  select flow.ledger_id, x."participantId"::uuid, p.user_id,
         lower(x."walletAddress"), flow.plan_hash, x."debitMinor"::bigint,
         x."consentSignature", x."usdcAuthorization", 'signed',
         x."expiresAt", server_attested_at
  from jsonb_to_recordset(signed_approvals) as x(
    "participantId" text, "walletAddress" text, "debitMinor" text,
    "consentSignature" text, "usdcAuthorization" jsonb, "expiresAt" timestamptz
  )
  join public.participants p on p.id = x."participantId"::uuid and p.tab_id = flow.tab_id
  on conflict (ledger_id, participant_id) do update
  set wallet_address = excluded.wallet_address,
      plan_hash = excluded.plan_hash,
      debit_minor = excluded.debit_minor,
      consent_signature = excluded.consent_signature,
      usdc_authorization = excluded.usdc_authorization,
      status = 'signed', expires_at = excluded.expires_at,
      signed_at = excluded.signed_at
  where public.settlement_approvals.status in ('pending', 'signed');
  get diagnostics affected_count = row_count;
  if affected_count <> jsonb_array_length(signed_approvals) then
    raise exception 'FLOW_APPROVAL_COMMIT_CONFLICT';
  end if;

  update public.settlements
  set simulate_result = simulation_record, status = 'simulated'
  where id = flow.settlement_record_id and ledger_id = flow.ledger_id;
  update public.tabs set status = 'signing' where id = flow.tab_id;
  update public.settlement_flow_records
  set state = 'simulated', signed_body_hash = signed_body_digest,
      simulation_hash = simulation_digest, revision = expected_revision,
      attested_at = server_attested_at, attestation = server_attestation
  where id = flow.id
  returning * into flow;
  insert into public.settlement_flow_events(
    flow_id, created_by, tab_id, revision, event_kind, state, payload_hash,
    attested_at, attestation
  ) values (
    flow.id, flow.created_by, flow.tab_id, expected_revision, 'simulated', 'simulated',
    event_payload_hash, server_attested_at, server_event_attestation
  );
  insert into public.audit_events(tab_id, settlement_id, actor_id, action, metadata)
  values (
    flow.tab_id, flow.settlement_record_id, caller,
    'settlement.flow.attestation_received',
    jsonb_build_object('flow_id', flow.id, 'revision', expected_revision, 'requires_server_attestation', true)
  );
  return next flow;
end;
$$;

create or replace function public.assert_reviewed_settlement_approvals(
  target_flow uuid,
  expected_owner uuid,
  signed_body_digest text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := expected_owner;
  flow public.settlement_flow_records%rowtype;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'service role required'; end if;
  if caller is null then raise exception 'expected owner is required'; end if;
  if target_flow is null or signed_body_digest is null or signed_body_digest !~ '^[0-9a-f]{64}$' then raise exception 'invalid signed body digest'; end if;

  select f.* into flow from public.settlement_flow_records f
  where f.id = target_flow
  for update;
  if not found or not private.user_can_edit_settlement_tab(caller, flow.tab_id) then raise exception 'FLOW_NOT_FOUND_OR_NOT_OWNED'; end if;
  if flow.state <> 'simulated' or flow.signed_body_hash <> signed_body_digest then
    raise exception 'FLOW_EXECUTION_APPROVAL_CHECK_REJECTED';
  end if;

  -- This is the last database read before the route calls KeeperHub. It cannot
  -- make EIP-3009 cryptographically revocable; the short-lived wallet-signed
  -- broadcast approval remains the final authorization gate.
  perform 1
  from public.settlement_approvals a
  where a.ledger_id = flow.ledger_id
  for update;
  if exists (
    with expected as (
      select t.debtor_participant_id
      from public.transfers t
      where t.ledger_id = flow.ledger_id
      group by t.debtor_participant_id
    )
    select 1
    from expected e
    left join public.settlement_approvals a
      on a.ledger_id = flow.ledger_id and a.participant_id = e.debtor_participant_id
    where a.id is null or a.status <> 'signed' or a.expires_at <= now()
  ) then raise exception 'FLOW_APPROVALS_NOT_CURRENTLY_SIGNED'; end if;
  return true;
end;
$$;

create or replace function public.record_reviewed_settlement_execution(
  target_flow uuid,
  expected_owner uuid,
  expected_revision integer,
  signed_body_digest text,
  simulation_digest text,
  accepted_execution_id text,
  execution_record jsonb,
  execution_digest text,
  event_payload_hash text,
  server_attested_at timestamptz,
  server_attestation text,
  server_event_attestation text
)
returns setof public.settlement_flow_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := expected_owner;
  flow public.settlement_flow_records%rowtype;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'service role required'; end if;
  if caller is null then raise exception 'expected owner is required'; end if;
  if target_flow is null or expected_revision is null then raise exception 'required execution transition argument is null'; end if;
  if signed_body_digest is null or signed_body_digest !~ '^[0-9a-f]{64}$'
    or simulation_digest is null or simulation_digest !~ '^[0-9a-f]{64}$'
    or execution_digest is null or execution_digest !~ '^[0-9a-f]{64}$'
    or event_payload_hash is null or event_payload_hash !~ '^[0-9a-f]{64}$'
    or accepted_execution_id is null or accepted_execution_id !~ '^[A-Za-z0-9_-]{6,128}$'
    or server_attestation is null or server_attestation !~ '^[0-9a-f]{64}$'
    or server_event_attestation is null or server_event_attestation !~ '^[0-9a-f]{64}$'
  then raise exception 'invalid execution evidence'; end if;
  if jsonb_typeof(execution_record) is distinct from 'object'
    or pg_column_size(execution_record) > 65536
    or execution_record ->> 'executionId' is distinct from accepted_execution_id
  then raise exception 'invalid or unbounded execution response'; end if;
  if server_attested_at is null or server_attested_at < now() - interval '5 minutes' or server_attested_at > now() + interval '1 minute' then
    raise exception 'settlement flow attestation outside freshness window';
  end if;

  select f.* into flow from public.settlement_flow_records f
  where f.id = target_flow
  for update;
  if not found or not private.user_can_edit_settlement_tab(caller, flow.tab_id) then raise exception 'FLOW_NOT_FOUND_OR_NOT_OWNED'; end if;
  if flow.state in ('submitted', 'completed_unverified', 'verified_settled', 'failed', 'timeout') then
    if flow.execution_id <> accepted_execution_id
      or flow.execution_hash <> execution_digest
      or flow.signed_body_hash <> signed_body_digest
      or flow.simulation_hash <> simulation_digest
    then raise exception 'FLOW_EXECUTION_MISMATCH'; end if;
    return next flow;
    return;
  end if;
  if flow.state <> 'simulated' or expected_revision <> flow.revision + 1
    or flow.signed_body_hash <> signed_body_digest
    or flow.simulation_hash <> simulation_digest
  then raise exception 'FLOW_EXECUTION_TRANSITION_REJECTED'; end if;
  update public.settlements
  set keeperhub_execution_id = accepted_execution_id, status = 'submitted'
  where id = flow.settlement_record_id and ledger_id = flow.ledger_id;
  update public.tabs set status = 'settling' where id = flow.tab_id;
  update public.settlement_flow_records
  set state = 'submitted', execution_id = accepted_execution_id,
      execution_hash = execution_digest, execution_result = execution_record,
      revision = expected_revision, attested_at = server_attested_at,
      attestation = server_attestation
  where id = flow.id
  returning * into flow;
  insert into public.settlement_flow_events(
    flow_id, created_by, tab_id, revision, event_kind, state, payload_hash,
    attested_at, attestation
  ) values (
    flow.id, flow.created_by, flow.tab_id, expected_revision, 'submitted', 'submitted',
    event_payload_hash, server_attested_at, server_event_attestation
  );
  insert into public.audit_events(tab_id, settlement_id, actor_id, action, metadata)
  values (
    flow.tab_id, flow.settlement_record_id, caller,
    'settlement.flow.attestation_received',
    jsonb_build_object('flow_id', flow.id, 'revision', expected_revision, 'requires_server_attestation', true)
  );
  return next flow;
end;
$$;

create or replace function public.record_reviewed_settlement_terminal(
  target_flow uuid,
  expected_owner uuid,
  expected_revision integer,
  accepted_execution_id text,
  target_state text,
  keeperhub_status_record jsonb,
  keeperhub_status_digest text,
  proof_record jsonb,
  proof_digest text,
  event_payload_hash text,
  server_attested_at timestamptz,
  server_attestation text,
  server_event_attestation text
)
returns setof public.settlement_flow_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := expected_owner;
  flow public.settlement_flow_records%rowtype;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'service role required'; end if;
  if caller is null then raise exception 'expected owner is required'; end if;
  if target_flow is null or expected_revision is null then raise exception 'required terminal transition argument is null'; end if;
  if target_state is null or target_state not in ('completed_unverified', 'verified_settled', 'failed', 'timeout')
    or accepted_execution_id is null or accepted_execution_id !~ '^[A-Za-z0-9_-]{6,128}$'
    or keeperhub_status_digest is null or keeperhub_status_digest !~ '^[0-9a-f]{64}$'
    or proof_digest is null or proof_digest !~ '^[0-9a-f]{64}$'
    or event_payload_hash is null or event_payload_hash !~ '^[0-9a-f]{64}$'
    or server_attestation is null or server_attestation !~ '^[0-9a-f]{64}$'
    or server_event_attestation is null or server_event_attestation !~ '^[0-9a-f]{64}$'
  then raise exception 'invalid terminal evidence'; end if;
  if pg_column_size(keeperhub_status_record) > 196608
    or pg_column_size(proof_record) > 196608
  then raise exception 'terminal evidence exceeds bounded storage'; end if;
  if server_attested_at is null or server_attested_at < now() - interval '5 minutes' or server_attested_at > now() + interval '1 minute' then
    raise exception 'settlement flow attestation outside freshness window';
  end if;

  select f.* into flow from public.settlement_flow_records f
  where f.id = target_flow
  for update;
  if not found or not private.user_can_edit_settlement_tab(caller, flow.tab_id) then raise exception 'FLOW_NOT_FOUND_OR_NOT_OWNED'; end if;
  if flow.state in ('completed_unverified', 'verified_settled', 'failed', 'timeout') then
    if flow.state <> target_state
      or flow.execution_id <> accepted_execution_id
      or flow.keeperhub_status_hash <> keeperhub_status_digest
      or flow.proof_hash <> proof_digest
    then raise exception 'FLOW_TERMINAL_MISMATCH'; end if;
    return next flow;
    return;
  end if;
  if flow.state <> 'submitted' or expected_revision <> flow.revision + 1
    or flow.execution_id <> accepted_execution_id
  then raise exception 'FLOW_TERMINAL_TRANSITION_REJECTED'; end if;
  if jsonb_typeof(keeperhub_status_record) is distinct from 'object'
    or keeperhub_status_record ->> 'status' is null
    or keeperhub_status_record ->> 'executionId' is distinct from flow.execution_id
    or jsonb_typeof(proof_record) is distinct from 'object'
    or proof_record ->> 'executionId' is distinct from flow.execution_id
    or lower(proof_record ->> 'settlementId') is distinct from lower(flow.plan_hash)
    or lower(proof_record ->> 'ledgerHash') is distinct from lower(flow.ledger_hash)
    or lower(proof_record ->> 'contractAddress') is distinct from lower(flow.contract_address)
    or proof_record ->> 'chainId' is distinct from flow.chain_id::text
    or jsonb_typeof(proof_record -> 'receiptHashes') is distinct from 'array'
  then raise exception 'TERMINAL_PROOF_BINDING_MISMATCH'; end if;
  if target_state = 'verified_settled' then
    if jsonb_typeof(keeperhub_status_record -> 'receipts') is distinct from 'array' then
      raise exception 'VERIFIED_STATE_REQUIRES_EXACT_CHAIN_PROOF';
    end if;
    if keeperhub_status_record ->> 'status' is distinct from 'completed'
    or jsonb_array_length(keeperhub_status_record -> 'receipts') < 1
    or exists (
      select 1 from jsonb_array_elements(keeperhub_status_record -> 'receipts') receipt
      where jsonb_typeof(receipt) is distinct from 'object'
        or receipt ->> 'verified' is distinct from 'true'
        or receipt ->> 'receiptStatus' is distinct from 'success'
        or coalesce(receipt ->> 'hash', '') !~* '^0x[0-9a-f]{64}$'
        or receipt ->> 'chainId' is distinct from flow.chain_id::text
    )
    or proof_record ->> 'verified' is distinct from 'true'
    or proof_record #>> '{independent,verified}' is distinct from 'true'
    or jsonb_array_length(proof_record -> 'receiptHashes')
       <> jsonb_array_length(keeperhub_status_record -> 'receipts')
    or exists (
      select 1
      from jsonb_array_elements(keeperhub_status_record -> 'receipts') receipt
      where coalesce(receipt ->> 'hash', '') = ''
        or not (proof_record -> 'receiptHashes' ? lower(coalesce(receipt ->> 'hash', '')))
    )
    then raise exception 'VERIFIED_STATE_REQUIRES_EXACT_CHAIN_PROOF'; end if;
  end if;
  if target_state = 'failed'
    and coalesce(keeperhub_status_record ->> 'status', '') not in ('failed', 'cancelled', 'completed')
  then raise exception 'FAILED_STATE_REQUIRES_TERMINAL_PROVIDER_FAILURE'; end if;
  if target_state = 'failed' and keeperhub_status_record ->> 'status' = 'completed' then
    if jsonb_typeof(keeperhub_status_record -> 'receipts') is distinct from 'array' then
      raise exception 'FAILED_STATE_REQUIRES_TERMINAL_PROVIDER_FAILURE';
    end if;
    if jsonb_array_length(keeperhub_status_record -> 'receipts') < 1
      or jsonb_array_length(keeperhub_status_record -> 'receipts') > 20
      or exists (
        select 1 from jsonb_array_elements(keeperhub_status_record -> 'receipts') receipt
        where jsonb_typeof(receipt) is distinct from 'object'
          or coalesce(receipt ->> 'hash', '') !~* '^0x[0-9a-f]{64}$'
          or receipt ->> 'chainId' is distinct from flow.chain_id::text
          or receipt ->> 'verified' is distinct from 'true'
          or receipt ->> 'receiptStatus' is null
      )
      or not exists (
        select 1 from jsonb_array_elements(keeperhub_status_record -> 'receipts') receipt
        where receipt ->> 'receiptStatus' in ('reverted', 'safe_inner_failure')
      )
    then raise exception 'FAILED_STATE_REQUIRES_TERMINAL_PROVIDER_FAILURE'; end if;
  end if;
  if target_state = 'completed_unverified'
    and keeperhub_status_record ->> 'status' is distinct from 'completed'
  then raise exception 'UNVERIFIED_STATE_REQUIRES_COMPLETED_PROVIDER_STATUS'; end if;
  if target_state = 'timeout' then
    if jsonb_typeof(keeperhub_status_record -> 'receipts') is distinct from 'array' then
      raise exception 'TIMEOUT_STATE_REQUIRES_TIMEOUT_RECEIPT';
    end if;
    if not exists (
      select 1
      from jsonb_array_elements(keeperhub_status_record -> 'receipts') receipt
      where receipt ->> 'receiptStatus' in ('timeout', 'not_found')
    ) then raise exception 'TIMEOUT_STATE_REQUIRES_TIMEOUT_RECEIPT'; end if;
  end if;

  update public.settlements
  set status = target_state,
      receipts = keeperhub_status_record -> 'receipts'
  where id = flow.settlement_record_id and ledger_id = flow.ledger_id;
  update public.tabs
  set status = case when target_state = 'verified_settled' then 'verified_settled' else 'failed' end
  where id = flow.tab_id;
  update public.settlement_flow_records
  set state = target_state, keeperhub_status = keeperhub_status_record,
      keeperhub_status_hash = keeperhub_status_digest,
      independent_proof = proof_record, proof_hash = proof_digest,
      revision = expected_revision, attested_at = server_attested_at,
      attestation = server_attestation
  where id = flow.id
  returning * into flow;
  insert into public.settlement_flow_events(
    flow_id, created_by, tab_id, revision, event_kind, state, payload_hash,
    attested_at, attestation
  ) values (
    flow.id, flow.created_by, flow.tab_id, expected_revision, 'terminal', target_state,
    event_payload_hash, server_attested_at, server_event_attestation
  );
  insert into public.audit_events(tab_id, settlement_id, actor_id, action, metadata)
  values (
    flow.tab_id, flow.settlement_record_id, caller,
    'settlement.flow.attestation_received',
    jsonb_build_object('flow_id', flow.id, 'revision', expected_revision, 'requires_server_attestation', true)
  );
  return next flow;
end;
$$;

create or replace function public.reconcile_reviewed_settlement_proof(
  target_flow uuid,
  expected_owner uuid,
  expected_revision integer,
  accepted_execution_id text,
  keeperhub_status_record jsonb,
  keeperhub_status_digest text,
  proof_record jsonb,
  proof_digest text,
  event_payload_hash text,
  server_attested_at timestamptz,
  server_attestation text,
  server_event_attestation text
)
returns setof public.settlement_flow_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := expected_owner;
  flow public.settlement_flow_records%rowtype;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'service role required'; end if;
  if caller is null then raise exception 'expected owner is required'; end if;
  if target_flow is null or expected_revision is null then raise exception 'required reconciliation transition argument is null'; end if;
  if accepted_execution_id is null or accepted_execution_id !~ '^[A-Za-z0-9_-]{6,128}$'
    or keeperhub_status_digest is null or keeperhub_status_digest !~ '^[0-9a-f]{64}$'
    or proof_digest is null or proof_digest !~ '^[0-9a-f]{64}$'
    or event_payload_hash is null or event_payload_hash !~ '^[0-9a-f]{64}$'
    or server_attestation is null or server_attestation !~ '^[0-9a-f]{64}$'
    or server_event_attestation is null or server_event_attestation !~ '^[0-9a-f]{64}$'
  then raise exception 'invalid reconciliation evidence'; end if;
  if server_attested_at is null
    or server_attested_at < now() - interval '5 minutes'
    or server_attested_at > now() + interval '1 minute'
  then raise exception 'settlement flow attestation outside freshness window'; end if;
  if jsonb_typeof(keeperhub_status_record) is distinct from 'object'
    or jsonb_typeof(proof_record) is distinct from 'object'
  then raise exception 'RECONCILIATION_PROOF_BINDING_MISMATCH'; end if;
  if pg_column_size(keeperhub_status_record) > 196608
    or pg_column_size(proof_record) > 196608
  then raise exception 'reconciliation evidence exceeds bounded storage'; end if;
  if jsonb_typeof(keeperhub_status_record -> 'receipts') is distinct from 'array'
    or jsonb_typeof(proof_record -> 'receiptHashes') is distinct from 'array'
  then raise exception 'RECONCILIATION_REQUIRES_EXACT_CHAIN_PROOF'; end if;

  select f.* into flow from public.settlement_flow_records f
  where f.id = target_flow
  for update;
  if not found or not private.user_can_edit_settlement_tab(caller, flow.tab_id) then
    raise exception 'FLOW_NOT_FOUND_OR_NOT_OWNED';
  end if;
  if flow.state = 'verified_settled' then
    if flow.execution_id is distinct from accepted_execution_id
      or flow.keeperhub_status_hash is distinct from keeperhub_status_digest
      or flow.proof_hash is distinct from proof_digest
    then raise exception 'FLOW_RECONCILIATION_MISMATCH'; end if;
    return next flow;
    return;
  end if;
  if flow.state not in ('completed_unverified', 'timeout')
    or flow.revision <> 4
    or expected_revision <> 5
    or flow.execution_id is distinct from accepted_execution_id
  then raise exception 'FLOW_RECONCILIATION_TRANSITION_REJECTED'; end if;
  if keeperhub_status_record ->> 'executionId' is distinct from flow.execution_id
    or keeperhub_status_record ->> 'status' is distinct from 'completed'
    or jsonb_array_length(keeperhub_status_record -> 'receipts') < 1
    or proof_record ->> 'executionId' is distinct from flow.execution_id
    or lower(proof_record ->> 'settlementId') is distinct from lower(flow.plan_hash)
    or lower(proof_record ->> 'ledgerHash') is distinct from lower(flow.ledger_hash)
    or lower(proof_record ->> 'contractAddress') is distinct from lower(flow.contract_address)
    or proof_record ->> 'chainId' is distinct from flow.chain_id::text
    or proof_record ->> 'verified' is distinct from 'true'
    or proof_record #>> '{independent,verified}' is distinct from 'true'
    or jsonb_array_length(proof_record -> 'receiptHashes')
       <> jsonb_array_length(keeperhub_status_record -> 'receipts')
    or exists (
      select 1 from jsonb_array_elements(keeperhub_status_record -> 'receipts') receipt
      where jsonb_typeof(receipt) is distinct from 'object'
        or receipt ->> 'verified' is distinct from 'true'
        or receipt ->> 'receiptStatus' is distinct from 'success'
        or coalesce(receipt ->> 'hash', '') !~* '^0x[0-9a-f]{64}$'
        or receipt ->> 'chainId' is distinct from flow.chain_id::text
        or not (proof_record -> 'receiptHashes' ? lower(coalesce(receipt ->> 'hash', '')))
    )
  then raise exception 'RECONCILIATION_REQUIRES_EXACT_CHAIN_PROOF'; end if;

  update public.settlements
  set status = 'verified_settled', receipts = keeperhub_status_record -> 'receipts'
  where id = flow.settlement_record_id and ledger_id = flow.ledger_id;
  update public.tabs set status = 'verified_settled' where id = flow.tab_id;
  update public.settlement_flow_records
  set state = 'verified_settled', keeperhub_status = keeperhub_status_record,
      keeperhub_status_hash = keeperhub_status_digest,
      independent_proof = proof_record, proof_hash = proof_digest,
      revision = expected_revision, attested_at = server_attested_at,
      attestation = server_attestation
  where id = flow.id
  returning * into flow;
  insert into public.settlement_flow_events(
    flow_id, created_by, tab_id, revision, event_kind, state, payload_hash,
    attested_at, attestation
  ) values (
    flow.id, flow.created_by, flow.tab_id, expected_revision, 'reconciled',
    'verified_settled', event_payload_hash, server_attested_at,
    server_event_attestation
  );
  insert into public.audit_events(tab_id, settlement_id, actor_id, action, metadata)
  values (
    flow.tab_id, flow.settlement_record_id, caller,
    'settlement.flow.attestation_received',
    jsonb_build_object('flow_id', flow.id, 'revision', expected_revision, 'requires_server_attestation', true)
  );
  return next flow;
end;
$$;

revoke all on function public.freeze_reviewed_settlement_flow(
  uuid, uuid, uuid, text, jsonb, text, uuid, uuid, uuid, uuid, jsonb, text, text, text,
  bigint, text, jsonb, text, text, timestamptz, text, text
) from public, anon, authenticated;
revoke all on function public.record_reviewed_settlement_simulation(
  uuid, uuid, integer, text, text, jsonb, jsonb, text, timestamptz, text, text
) from public, anon, authenticated;
revoke all on function public.assert_reviewed_settlement_approvals(
  uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.record_reviewed_settlement_execution(
  uuid, uuid, integer, text, text, text, jsonb, text, text, timestamptz, text, text
) from public, anon, authenticated;
revoke all on function public.record_reviewed_settlement_terminal(
  uuid, uuid, integer, text, text, jsonb, text, jsonb, text, text, timestamptz, text, text
) from public, anon, authenticated;
revoke all on function public.reconcile_reviewed_settlement_proof(
  uuid, uuid, integer, text, jsonb, text, jsonb, text, text, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function public.freeze_reviewed_settlement_flow(
  uuid, uuid, uuid, text, jsonb, text, uuid, uuid, uuid, uuid, jsonb, text, text, text,
  bigint, text, jsonb, text, text, timestamptz, text, text
) to service_role;
grant execute on function public.record_reviewed_settlement_simulation(
  uuid, uuid, integer, text, text, jsonb, jsonb, text, timestamptz, text, text
) to service_role;
grant execute on function public.assert_reviewed_settlement_approvals(
  uuid, uuid, text
) to service_role;
grant execute on function public.record_reviewed_settlement_execution(
  uuid, uuid, integer, text, text, text, jsonb, text, text, timestamptz, text, text
) to service_role;
grant execute on function public.record_reviewed_settlement_terminal(
  uuid, uuid, integer, text, text, jsonb, text, jsonb, text, text, timestamptz, text, text
) to service_role;
grant execute on function public.reconcile_reviewed_settlement_proof(
  uuid, uuid, integer, text, jsonb, text, jsonb, text, text, timestamptz, text, text
) to service_role;
