-- Align the database freeze invariant with the application review boundary:
-- collaborators without an attached wallet stay in the shared tab, while only
-- valid wallet-backed participants may enter the attested executable ledger.
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
    or (
      select count(*)
      from public.participants p
      where p.tab_id = target_tab
        and p.wallet_address ~* '^0x[0-9a-f]{40}$'
    ) <> jsonb_array_length(run_record.input_snapshot -> 'participants')
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
        and p.wallet_address ~* '^0x[0-9a-f]{40}$'
        and (
          reviewed.id is null
          or frozen.id is null
          or reviewed.name is distinct from p.display_name
          or lower(reviewed."walletAddress") is distinct from lower(p.wallet_address)
          or frozen."displayName" is distinct from p.display_name
          or lower(frozen.address) is distinct from lower(p.wallet_address)
        )
    )
    or (
      select count(distinct lower(p.wallet_address))
      from public.participants p
      where p.tab_id = target_tab
        and p.wallet_address ~* '^0x[0-9a-f]{40}$'
    ) <> (
      select count(*)
      from public.participants p
      where p.tab_id = target_tab
        and p.wallet_address ~* '^0x[0-9a-f]{40}$'
    )
  then raise exception 'RUN_PARTICIPANT_BINDING_MISMATCH'; end if;
  if not exists (
    select 1 from public.participants p
    where p.id = payer_id
      and p.tab_id = target_tab
      and p.wallet_address ~* '^0x[0-9a-f]{40}$'
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

revoke all on function public.freeze_reviewed_settlement_flow(
  uuid, uuid, uuid, text, jsonb, text, uuid, uuid, uuid, uuid, jsonb, text, text, text,
  bigint, text, jsonb, text, text, timestamptz, text, text
) from public, anon, authenticated;

grant execute on function public.freeze_reviewed_settlement_flow(
  uuid, uuid, uuid, text, jsonb, text, uuid, uuid, uuid, uuid, jsonb, text, text, text,
  bigint, text, jsonb, text, text, timestamptz, text, text
) to service_role;
