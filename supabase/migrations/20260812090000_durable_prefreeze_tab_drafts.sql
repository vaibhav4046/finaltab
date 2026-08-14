-- Editable, reload-safe state is deliberately separate from the immutable
-- receipt/allocation rows bound into an attested review and frozen ledger.
-- Only the server-side service role can reach this table or mutation RPC.

create table if not exists public.tab_drafts (
  tab_id uuid primary key references public.tabs(id) on delete cascade,
  receipt_state jsonb not null,
  allocation_state jsonb,
  payer_participant_id uuid references public.participants(id) on delete cascade,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  revision bigint not null default 1 check (revision > 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(receipt_state) = 'object'),
  check (allocation_state is null or jsonb_typeof(allocation_state) = 'object'),
  check (pg_column_size(receipt_state) <= 196608),
  check (allocation_state is null or pg_column_size(allocation_state) <= 196608),
  check (pg_column_size(receipt_state) + coalesce(pg_column_size(allocation_state), 0) <= 262144),
  check (allocation_state is null or payer_participant_id is not null)
);

-- PostgreSQL does not create indexes for referencing columns automatically.
-- These keep participant/user deletion checks bounded as draft volume grows.
create index if not exists tab_drafts_payer_participant_id_idx
  on public.tab_drafts (payer_participant_id)
  where payer_participant_id is not null;
create index if not exists tab_drafts_updated_by_idx
  on public.tab_drafts (updated_by)
  where updated_by is not null;

alter table public.tab_drafts enable row level security;

revoke all on table public.tab_drafts from public, anon, authenticated;
grant select, insert, update on table public.tab_drafts to service_role;

-- The draft RPC is SECURITY INVOKER, so make every dependency it reaches
-- explicit instead of relying on project-age-dependent Supabase default ACLs.
grant select on table public.tabs, public.tab_members, public.participants, public.ledgers
  to service_role;
grant insert on table public.audit_events to service_role;
grant usage on sequence public.audit_events_id_seq to service_role;

-- Keep authorization, current tab status, and the optional draft read inside
-- one database statement. This removes the stale-authority window that would
-- exist if an application first checked membership and then read as admin.
create or replace function public.get_tab_draft(
  target_tab uuid,
  expected_actor uuid
)
returns table(
  tab_status text,
  saved_revision bigint,
  saved_receipt_state jsonb,
  saved_allocation_state jsonb,
  saved_payer_participant_id uuid,
  saved_updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required';
  end if;
  if expected_actor is null then
    raise exception 'authenticated actor required';
  end if;

  return query
  select t.status::text,
    d.revision, d.receipt_state, d.allocation_state,
    d.payer_participant_id, d.updated_at
  from public.tabs t
  left join public.tab_drafts d
    on d.tab_id = t.id and t.status = 'open'
  where t.id = target_tab
    and (
      t.owner_id = expected_actor
      or exists (
        select 1 from public.tab_members m
        where m.tab_id = t.id
          and m.user_id = expected_actor
          and m.role in ('owner', 'member')
      )
    )
  for share of t;
end;
$$;

revoke all on function public.get_tab_draft(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_tab_draft(uuid, uuid)
  to service_role;

create or replace function public.upsert_tab_draft(
  target_tab uuid,
  expected_actor uuid,
  expected_revision bigint,
  receipt_document jsonb,
  allocation_document jsonb,
  selected_payer uuid,
  request_digest text
)
returns table(
  saved_revision bigint,
  saved_receipt_state jsonb,
  saved_allocation_state jsonb,
  saved_payer_participant_id uuid,
  saved_updated_at timestamptz,
  was_idempotent boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_status text;
  target_currency text;
  current_draft public.tab_drafts%rowtype;
  next_revision bigint;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required';
  end if;
  if expected_actor is null then raise exception 'authenticated actor required'; end if;
  if expected_revision is null or expected_revision < 0 then raise exception 'invalid expected draft revision'; end if;
  if request_digest is null or request_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid draft request digest';
  end if;
  if receipt_document is null or jsonb_typeof(receipt_document) is distinct from 'object' then
    raise exception 'confirmed receipt document required';
  end if;
  if receipt_document ->> 'confirmedAt' is null
    or coalesce(receipt_document ->> 'imageDataUrl', '') <> '' then
    raise exception 'receipt draft must be confirmed and image-free';
  end if;
  if pg_column_size(receipt_document) > 196608
    or (allocation_document is not null and pg_column_size(allocation_document) > 196608)
    or pg_column_size(receipt_document) + coalesce(pg_column_size(allocation_document), 0) > 262144 then
    raise exception 'draft payload exceeds storage bounds';
  end if;
  if allocation_document is not null and jsonb_typeof(allocation_document) is distinct from 'object' then
    raise exception 'allocation draft must be an object';
  end if;
  if allocation_document is not null and selected_payer is null then
    raise exception 'allocation draft requires a payer';
  end if;

  -- Lock the tab before the source-state guard. This serializes draft writes
  -- against the freeze RPC, which also locks the tab row before changing status.
  select t.status, t.currency::text
  into target_status, target_currency
  from public.tabs t
  where t.id = target_tab
    and (
      t.owner_id = expected_actor
      or exists (
        select 1 from public.tab_members m
        where m.tab_id = t.id
          and m.user_id = expected_actor
          and m.role in ('owner', 'member')
      )
    )
  for update;

  if not found then raise exception 'tab editor access required'; end if;
  if target_status <> 'open' or exists (select 1 from public.ledgers l where l.tab_id = target_tab) then
    raise exception 'frozen settlement source is immutable';
  end if;
  if receipt_document #>> '{receipt,currency}' is distinct from target_currency then
    raise exception 'receipt currency must match tab currency';
  end if;
  if selected_payer is not null and not exists (
    select 1 from public.participants p where p.id = selected_payer and p.tab_id = target_tab
  ) then
    raise exception 'payer must belong to tab';
  end if;

  if allocation_document is not null then
    if allocation_document #>> '{proposal,payerId}' is distinct from selected_payer::text then
      raise exception 'allocation payer does not match selected payer';
    end if;
    if jsonb_typeof(allocation_document -> 'shares') is distinct from 'array'
      or jsonb_typeof(allocation_document -> 'debts') is distinct from 'array'
      or jsonb_typeof(allocation_document #> '{proposal,allocations}') is distinct from 'array' then
      raise exception 'allocation arrays are required';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(allocation_document -> 'shares') share
      where not exists (
        select 1 from public.participants p
        where p.tab_id = target_tab and p.id::text = share ->> 'id'
      )
    ) or exists (
      select 1
      from jsonb_array_elements(allocation_document -> 'debts') debt
      where not exists (
        select 1 from public.participants p
        where p.tab_id = target_tab and p.id::text = debt ->> 'debtor'
      ) or not exists (
        select 1 from public.participants p
        where p.tab_id = target_tab and p.id::text = debt ->> 'creditor'
      )
    ) or exists (
      select 1
      from jsonb_array_elements(allocation_document #> '{proposal,allocations}') entry
      cross join lateral jsonb_array_elements_text(entry -> 'participants') participant_id
      where not exists (
        select 1 from public.participants p
        where p.tab_id = target_tab and p.id::text = participant_id
      )
    ) then
      raise exception 'allocation references a participant outside the tab';
    end if;
  end if;

  select d.* into current_draft
  from public.tab_drafts d
  where d.tab_id = target_tab
  for update;

  if found and current_draft.request_hash = request_digest then
    return query select current_draft.revision, current_draft.receipt_state,
      current_draft.allocation_state, current_draft.payer_participant_id,
      current_draft.updated_at, true;
    return;
  end if;

  if found and current_draft.revision <> expected_revision then
    raise exception 'draft revision conflict';
  end if;
  if not found and expected_revision <> 0 then
    raise exception 'draft revision conflict';
  end if;

  next_revision := expected_revision + 1;
  insert into public.tab_drafts(
    tab_id, receipt_state, allocation_state, payer_participant_id,
    request_hash, revision, updated_by, updated_at
  ) values (
    target_tab, receipt_document, allocation_document, selected_payer,
    request_digest, next_revision, expected_actor, now()
  )
  on conflict (tab_id) do update
  set receipt_state = excluded.receipt_state,
      allocation_state = excluded.allocation_state,
      payer_participant_id = excluded.payer_participant_id,
      request_hash = excluded.request_hash,
      revision = excluded.revision,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

  insert into public.audit_events(tab_id, actor_id, action, metadata)
  values (
    target_tab,
    expected_actor,
    'tab.draft.saved',
    jsonb_build_object(
      'revision', next_revision,
      'hasAllocation', allocation_document is not null,
      'requestHash', request_digest
    )
  );

  return query
  select d.revision, d.receipt_state, d.allocation_state,
    d.payer_participant_id, d.updated_at, false
  from public.tab_drafts d
  where d.tab_id = target_tab;
end;
$$;

revoke all on function public.upsert_tab_draft(uuid, uuid, bigint, jsonb, jsonb, uuid, text)
  from public, anon, authenticated;
grant execute on function public.upsert_tab_draft(uuid, uuid, bigint, jsonb, jsonb, uuid, text)
  to service_role;

-- Freezing must consume the latest collaborative intent, not merely any older
-- still-valid agent run. The freeze RPC locks the tab before inserting its flow;
-- draft writes use the same tab-then-draft lock order. Locking the draft here
-- therefore closes the final save/freeze race without introducing a deadlock.
create or replace function private.assert_latest_tab_draft_matches_flow()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  latest_draft public.tab_drafts%rowtype;
  reviewed_input jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required';
  end if;

  reviewed_input := new.agent_run_snapshot -> 'inputSnapshot';
  if jsonb_typeof(reviewed_input) is distinct from 'object'
    or reviewed_input ->> 'tabId' is distinct from new.tab_id::text then
    raise exception 'LATEST_TAB_DRAFT_CHANGED';
  end if;

  select d.* into latest_draft
  from public.tab_drafts d
  where d.tab_id = new.tab_id
  for update;

  if not found then
    raise exception 'LATEST_TAB_DRAFT_MISSING';
  end if;
  if latest_draft.receipt_state -> 'receipt' is distinct from reviewed_input -> 'receipt'
    or latest_draft.allocation_state is null
    or latest_draft.allocation_state -> 'proposal' is distinct from reviewed_input -> 'existingProposal'
    or latest_draft.allocation_state ->> 'instruction' is distinct from reviewed_input ->> 'instruction'
    or latest_draft.payer_participant_id::text is distinct from reviewed_input ->> 'payerParticipantId' then
    raise exception 'LATEST_TAB_DRAFT_CHANGED';
  end if;

  return new;
end;
$$;

revoke all on function private.assert_latest_tab_draft_matches_flow()
  from public, anon, authenticated;

drop trigger if exists assert_latest_tab_draft_matches_flow
  on public.settlement_flow_records;
create trigger assert_latest_tab_draft_matches_flow
before insert on public.settlement_flow_records
for each row execute function private.assert_latest_tab_draft_matches_flow();
