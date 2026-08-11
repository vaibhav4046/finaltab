-- FINALTab production tenancy, collaboration, consent, and audit model.
-- This migration intentionally layers on 0001_init.sql: 0001 creates the
-- money-domain tables with RLS enabled; this file attaches every row to an
-- authenticated owner/tab and installs explicit least-privilege policies.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 64),
  avatar_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tabs
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

-- A new FINALTab database is empty when these migrations are first applied.
-- Keeping owner_id non-null makes an unowned financial record impossible.
alter table public.tabs alter column owner_id set not null;

create table if not exists public.tab_members (
  tab_id uuid not null references public.tabs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (tab_id, user_id)
);

alter table public.participants
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists invite_status text not null default 'draft'
    check (invite_status in ('draft', 'invited', 'joined', 'declined', 'revoked')),
  add column if not exists invite_token_hash text,
  add column if not exists invite_expires_at timestamptz;

alter table public.participants
  add constraint participants_wallet_format
  check (wallet_address is null or wallet_address ~* '^0x[0-9a-f]{40}$') not valid;

create unique index if not exists idx_participants_tab_user
  on public.participants(tab_id, user_id) where user_id is not null;
create unique index if not exists idx_participants_invite_hash
  on public.participants(invite_token_hash) where invite_token_hash is not null;

alter table public.receipts
  add column if not exists confirmed_by uuid references auth.users(id) on delete set null,
  add column if not exists confirmed_at timestamptz,
  add column if not exists extraction_provider text,
  add column if not exists retention_expires_at timestamptz;

alter table public.ledgers
  add column if not exists plan_hash text,
  add column if not exists chain_id bigint,
  add column if not exists contract_address text,
  add column if not exists supersedes_ledger_id uuid references public.ledgers(id);

create unique index if not exists idx_ledgers_plan_hash
  on public.ledgers(plan_hash) where plan_hash is not null;

create table if not exists public.settlement_approvals (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  wallet_address text not null check (wallet_address ~* '^0x[0-9a-f]{40}$'),
  plan_hash text not null check (plan_hash ~* '^0x[0-9a-f]{64}$'),
  debit_minor bigint not null check (debit_minor > 0),
  consent_signature text,
  usdc_authorization jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'signed', 'rejected', 'expired', 'revoked')),
  expires_at timestamptz not null,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ledger_id, participant_id)
);

create table if not exists public.approval_challenges (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references public.tabs(id) on delete cascade,
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  token_hash text not null unique,
  scopes text[] not null default array['settlements:read']::text[],
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  check (scopes <@ array[
    'tabs:read', 'tabs:write', 'receipts:write',
    'settlements:prepare', 'settlements:submit', 'settlements:read'
  ]::text[])
);

create table if not exists public.wallet_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  address text not null check (address ~ '^0x[0-9a-f]{40}$'),
  chain_id bigint not null default 84532,
  is_primary boolean not null default false,
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, address)
);

create unique index if not exists idx_wallet_one_primary
  on public.wallet_accounts(user_id) where is_primary;

create table if not exists public.wallet_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  address text not null check (address ~ '^0x[0-9a-f]{40}$'),
  message text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.idempotency_records (
  owner_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  request_hash text not null,
  state text not null default 'started' check (state in ('started', 'completed', 'failed')),
  response jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, idempotency_key)
);

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  tab_id uuid references public.tabs(id) on delete cascade,
  settlement_id uuid references public.settlements(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 1 and 100),
  request_id uuid not null default gen_random_uuid(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_tabs_owner on public.tabs(owner_id);
create index if not exists idx_tab_members_user on public.tab_members(user_id);
create index if not exists idx_approvals_ledger_status on public.settlement_approvals(ledger_id, status);
create index if not exists idx_challenges_user on public.approval_challenges(user_id, expires_at);
create index if not exists idx_api_tokens_owner on public.api_tokens(owner_id);
create index if not exists idx_wallet_challenges_user on public.wallet_challenges(user_id, expires_at);
create index if not exists idx_audit_tab_created on public.audit_events(tab_id, created_at desc);

-- RLS helpers live outside the exposed schema, cannot be called anonymously,
-- and always begin by requiring a real authenticated UID. SECURITY DEFINER is
-- used only to avoid recursive policies while resolving membership.
create or replace function private.is_tab_member(target_tab uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.tabs t
    left join public.tab_members m
      on m.tab_id = t.id and m.user_id = (select auth.uid())
    where t.id = target_tab
      and (t.owner_id = (select auth.uid()) or m.user_id is not null)
  );
$$;

create or replace function private.is_tab_owner(target_tab uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.tabs t
    where t.id = target_tab and t.owner_id = (select auth.uid())
  );
$$;

create or replace function private.can_edit_tab(target_tab uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.tabs t
    left join public.tab_members m
      on m.tab_id = t.id and m.user_id = (select auth.uid())
    where t.id = target_tab
      and (t.owner_id = (select auth.uid()) or m.role in ('owner', 'member'))
  );
$$;

revoke all on function private.is_tab_member(uuid) from public, anon;
revoke all on function private.is_tab_owner(uuid) from public, anon;
revoke all on function private.can_edit_tab(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_tab_member(uuid) to authenticated;
grant execute on function private.is_tab_owner(uuid) to authenticated;
grant execute on function private.can_edit_tab(uuid) to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.add_tab_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_id <> (select auth.uid()) then
    raise exception 'tab owner must be the authenticated user';
  end if;
  insert into public.tab_members(tab_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (tab_id, user_id) do update set role = 'owner';
  return new;
end;
$$;

-- Audit records are emitted by database operations, not accepted as caller
-- assertions. This keeps the append-only history descriptive of mutations
-- that actually committed.
create or replace function private.audit_tab_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_events(tab_id, actor_id, action, metadata)
  values (
    new.id,
    (select auth.uid()),
    case when tg_op = 'INSERT' then 'tab.created' else 'tab.updated' end,
    jsonb_build_object('status', new.status, 'currency', new.currency)
  );
  return new;
end;
$$;

create or replace function private.audit_participant_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_events(tab_id, actor_id, action, metadata)
  values (
    new.tab_id,
    (select auth.uid()),
    'participant.updated',
    jsonb_build_object('participant_id', new.id)
  );
  return new;
end;
$$;

create or replace function private.validate_tab_payer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.payer_participant_id is not null and not exists (
    select 1 from public.participants p
    where p.id = new.payer_participant_id and p.tab_id = new.id
  ) then
    raise exception 'payer must be a participant in the same tab';
  end if;
  return new;
end;
$$;

-- Challenge identity is relational, not caller-supplied metadata. This still
-- applies when a trusted backend inserts with a role that bypasses RLS.
create or replace function private.validate_approval_challenge_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.challenge_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid challenge digest';
  end if;
  if new.expires_at <= now() then
    raise exception 'approval challenge must expire in the future';
  end if;
  if not exists (
    select 1
    from public.participants p
    join public.ledgers l on l.tab_id = p.tab_id
    where p.id = new.participant_id
      and p.tab_id = new.tab_id
      and p.user_id = new.user_id
      and l.id = new.ledger_id
      and l.tab_id = new.tab_id
  ) then
    raise exception 'challenge tab, ledger, participant and user must match';
  end if;
  return new;
end;
$$;

-- Collaboration RPCs are SECURITY DEFINER only where a user cannot yet pass
-- ordinary membership RLS (invite acceptance) or where protected identity
-- columns must change atomically. Every entry point validates auth.uid(),
-- constrains inputs, sets an empty search_path, and is explicitly granted only
-- to authenticated callers.
create or replace function public.add_tab_participant(
  target_tab uuid,
  participant_name text,
  participant_wallet text default null,
  attach_to_self boolean default false
)
returns table(id uuid, tab_id uuid, display_name text, wallet_address text, user_id uuid, invite_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  created public.participants%rowtype;
  clean_name text := btrim(participant_name);
  clean_wallet text := case when participant_wallet is null or btrim(participant_wallet) = '' then null else lower(btrim(participant_wallet)) end;
begin
  if caller is null then raise exception 'authentication required'; end if;
  if not private.can_edit_tab(target_tab) then raise exception 'tab editor access required'; end if;
  if char_length(clean_name) < 1 or char_length(clean_name) > 64 then raise exception 'participant name must be 1-64 characters'; end if;
  if clean_wallet is not null and clean_wallet !~ '^0x[0-9a-f]{40}$' then raise exception 'invalid wallet address'; end if;

  insert into public.participants(tab_id, display_name, wallet_address, user_id, invite_status)
  values (target_tab, clean_name, clean_wallet, case when attach_to_self then caller else null end,
          case when attach_to_self then 'joined' else 'draft' end)
  returning * into created;

  insert into public.audit_events(tab_id, actor_id, action, metadata)
  values (target_tab, caller, 'participant.added',
          jsonb_build_object('participant_id', created.id, 'attached_to_actor', attach_to_self));

  return query select created.id, created.tab_id, created.display_name, created.wallet_address, created.user_id, created.invite_status;
end;
$$;

create or replace function public.create_tab_invite(
  target_participant uuid,
  token_digest text,
  requested_expires_at timestamptz
)
returns table(participant_id uuid, tab_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target public.participants%rowtype;
begin
  if caller is null then raise exception 'authentication required'; end if;
  if token_digest !~ '^[0-9a-f]{64}$' then raise exception 'invalid invite digest'; end if;
  if requested_expires_at <= now() + interval '5 minutes' or requested_expires_at > now() + interval '7 days' then
    raise exception 'invite expiry must be between 5 minutes and 7 days';
  end if;

  select p.* into target from public.participants p where p.id = target_participant for update;
  if not found then raise exception 'participant not found'; end if;
  if not private.can_edit_tab(target.tab_id) then raise exception 'tab editor access required'; end if;
  if target.user_id is not null or target.invite_status = 'joined' then raise exception 'participant has already joined'; end if;

  update public.participants
  set invite_status = 'invited', invite_token_hash = token_digest, invite_expires_at = requested_expires_at
  where id = target.id;

  insert into public.audit_events(tab_id, actor_id, action, metadata)
  values (target.tab_id, caller, 'invite.created',
          jsonb_build_object('participant_id', target.id, 'expires_at', requested_expires_at));

  return query select target.id, target.tab_id, requested_expires_at;
end;
$$;

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
  on conflict (tab_id, user_id) do update set role = case
    when public.tab_members.role = 'owner' then 'owner' else 'member' end;

  select t.title into title_value from public.tabs t where t.id = target.tab_id;
  insert into public.audit_events(tab_id, actor_id, action, metadata)
  values (target.tab_id, caller, 'invite.joined', jsonb_build_object('participant_id', target.id));

  return query select target.tab_id, target.id, title_value;
end;
$$;

create or replace function public.record_approval_decision(target_tab uuid, target_approval uuid, target_status text)
returns table(approval_id uuid, status text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  approval public.settlement_approvals%rowtype;
  approval_tab uuid;
begin
  if caller is null then raise exception 'authentication required'; end if;
  if target_status not in ('rejected', 'revoked') then
    raise exception 'only rejection or revocation may be recorded here';
  end if;

  select a.* into approval
  from public.settlement_approvals a
  join public.participants p on p.id = a.participant_id
  join public.ledgers l on l.id = a.ledger_id
  where a.id = target_approval
    and a.user_id = caller
    and p.user_id = caller
    and lower(p.wallet_address) = lower(a.wallet_address)
    and l.tab_id = p.tab_id
    and l.tab_id = target_tab
    and l.plan_hash = a.plan_hash
  for update of a;
  if not found then raise exception 'approval not found for authenticated debtor wallet'; end if;
  if target_status = 'rejected' and approval.status <> 'pending' then raise exception 'only a pending approval can be rejected'; end if;
  if target_status = 'revoked' and approval.status not in ('pending', 'signed') then raise exception 'approval cannot be revoked from its current state'; end if;

  update public.settlement_approvals a
  set status = target_status
  where a.id = approval.id
  returning a.* into approval;
  select l.tab_id into approval_tab from public.ledgers l where l.id = approval.ledger_id;

  insert into public.audit_events(tab_id, actor_id, action, metadata)
  values (approval_tab, caller, 'approval.' || target_status,
          jsonb_build_object('approval_id', approval.id, 'participant_id', approval.participant_id,
                             'ledger_id', approval.ledger_id));

  return query select approval.id, target_status, approval.updated_at;
end;
$$;

-- Signatures and USDC authorizations are intentionally absent. A member can
-- read only the approval state needed by collaboration UI through this RPC;
-- the base table has no authenticated SELECT grant below.
create or replace function public.list_tab_approval_summaries(target_tab uuid)
returns table(
  id uuid,
  participant_id uuid,
  user_id uuid,
  wallet_address text,
  plan_hash text,
  debit_minor bigint,
  status text,
  expires_at timestamptz,
  signed_at timestamptz,
  updated_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.is_tab_member(target_tab) then
    raise exception 'tab membership required';
  end if;
  return query
    select a.id, a.participant_id, a.user_id, a.wallet_address, a.plan_hash,
           a.debit_minor, a.status, a.expires_at, a.signed_at, a.updated_at,
           a.created_at
    from public.settlement_approvals a
    join public.ledgers l on l.id = a.ledger_id
    where l.tab_id = target_tab
    order by a.created_at asc;
end;
$$;

revoke all on function private.add_tab_owner_membership() from public, anon, authenticated;
revoke all on function private.audit_tab_change() from public, anon, authenticated;
revoke all on function private.audit_participant_update() from public, anon, authenticated;
revoke all on function private.validate_tab_payer() from public, anon, authenticated;
revoke all on function private.validate_approval_challenge_scope() from public, anon, authenticated;
revoke all on function public.add_tab_participant(uuid, text, text, boolean) from public, anon;
revoke all on function public.create_tab_invite(uuid, text, timestamptz) from public, anon;
revoke all on function public.accept_tab_invite(text) from public, anon;
revoke all on function public.record_approval_decision(uuid, uuid, text) from public, anon;
revoke all on function public.list_tab_approval_summaries(uuid) from public, anon;
grant execute on function public.add_tab_participant(uuid, text, text, boolean) to authenticated;
grant execute on function public.create_tab_invite(uuid, text, timestamptz) to authenticated;
grant execute on function public.accept_tab_invite(text) to authenticated;
grant execute on function public.record_approval_decision(uuid, uuid, text) to authenticated;
grant execute on function public.list_tab_approval_summaries(uuid) to authenticated;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists set_tabs_updated_at on public.tabs;
create trigger set_tabs_updated_at before update on public.tabs
for each row execute function public.set_updated_at();
drop trigger if exists set_approvals_updated_at on public.settlement_approvals;
create trigger set_approvals_updated_at before update on public.settlement_approvals
for each row execute function public.set_updated_at();
drop trigger if exists set_idempotency_updated_at on public.idempotency_records;
create trigger set_idempotency_updated_at before update on public.idempotency_records
for each row execute function public.set_updated_at();
drop trigger if exists add_tab_owner_membership on public.tabs;
create trigger add_tab_owner_membership after insert on public.tabs
for each row execute function private.add_tab_owner_membership();
drop trigger if exists audit_tab_change on public.tabs;
create trigger audit_tab_change after insert or update on public.tabs
for each row execute function private.audit_tab_change();
drop trigger if exists audit_participant_update on public.participants;
create trigger audit_participant_update after update of display_name, wallet_address on public.participants
for each row execute function private.audit_participant_update();
drop trigger if exists validate_tab_payer on public.tabs;
create trigger validate_tab_payer before insert or update of payer_participant_id on public.tabs
for each row execute function private.validate_tab_payer();
drop trigger if exists validate_approval_challenge_scope on public.approval_challenges;
create trigger validate_approval_challenge_scope before insert or update on public.approval_challenges
for each row execute function private.validate_approval_challenge_scope();

alter table public.profiles enable row level security;
alter table public.tab_members enable row level security;
alter table public.settlement_approvals enable row level security;
alter table public.approval_challenges enable row level security;
alter table public.api_tokens enable row level security;
alter table public.wallet_accounts enable row level security;
alter table public.wallet_challenges enable row level security;
alter table public.idempotency_records enable row level security;
alter table public.audit_events enable row level security;

-- Profiles are private by default. Shared display names are denormalized on
-- participants, so no broad profile directory is required.
create policy profiles_select_self on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profiles_delete_self on public.profiles for delete to authenticated
  using (id = (select auth.uid()));

create policy tabs_select_members on public.tabs for select to authenticated
  using (private.is_tab_member(id));
create policy tabs_insert_owner on public.tabs for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy tabs_update_owner on public.tabs for update to authenticated
  using (private.is_tab_owner(id)) with check (owner_id = (select auth.uid()));
create policy tabs_delete_owner on public.tabs for delete to authenticated
  using (private.is_tab_owner(id));

create policy members_select_related on public.tab_members for select to authenticated
  using (user_id = (select auth.uid()) or private.is_tab_owner(tab_id));
create policy members_insert_owner on public.tab_members for insert to authenticated
  with check (private.is_tab_owner(tab_id));
create policy members_update_owner on public.tab_members for update to authenticated
  using (private.is_tab_owner(tab_id)) with check (private.is_tab_owner(tab_id));
create policy members_delete_owner on public.tab_members for delete to authenticated
  using (private.is_tab_owner(tab_id));

-- Every tab-owned domain table uses the same membership gate. Mutations are
-- allowed to members; irreversible execution is still protected by signed
-- approval challenges and server-side scopes in the application layer.
create policy participants_select_members on public.participants for select to authenticated
  using (private.is_tab_member(tab_id));
create policy participants_insert_members on public.participants for insert to authenticated
  with check (private.can_edit_tab(tab_id));
create policy participants_update_members on public.participants for update to authenticated
  using (private.can_edit_tab(tab_id)) with check (private.can_edit_tab(tab_id));
create policy participants_delete_owner on public.participants for delete to authenticated
  using (private.is_tab_owner(tab_id));

create policy receipts_select_members on public.receipts for select to authenticated
  using (private.is_tab_member(tab_id));
create policy receipts_insert_members on public.receipts for insert to authenticated
  with check (private.can_edit_tab(tab_id));
create policy receipts_update_members on public.receipts for update to authenticated
  using (private.can_edit_tab(tab_id)) with check (private.can_edit_tab(tab_id));
create policy receipts_delete_owner on public.receipts for delete to authenticated
  using (private.is_tab_owner(tab_id));

create policy items_select_members on public.receipt_items for select to authenticated
  using (exists (select 1 from public.receipts r where r.id = receipt_id and private.is_tab_member(r.tab_id)));
create policy items_insert_members on public.receipt_items for insert to authenticated
  with check (exists (select 1 from public.receipts r where r.id = receipt_id and private.can_edit_tab(r.tab_id)));
create policy items_update_members on public.receipt_items for update to authenticated
  using (exists (select 1 from public.receipts r where r.id = receipt_id and private.can_edit_tab(r.tab_id)))
  with check (exists (select 1 from public.receipts r where r.id = receipt_id and private.can_edit_tab(r.tab_id)));
create policy items_delete_members on public.receipt_items for delete to authenticated
  using (exists (select 1 from public.receipts r where r.id = receipt_id and private.can_edit_tab(r.tab_id)));

create policy allocations_select_members on public.allocations for select to authenticated
  using (private.is_tab_member(tab_id));
create policy allocations_insert_members on public.allocations for insert to authenticated
  with check (private.can_edit_tab(tab_id));
create policy allocations_update_members on public.allocations for update to authenticated
  using (private.can_edit_tab(tab_id)) with check (private.can_edit_tab(tab_id));

create policy ledgers_select_members on public.ledgers for select to authenticated
  using (private.is_tab_member(tab_id));
create policy ledgers_insert_members on public.ledgers for insert to authenticated
  with check (private.can_edit_tab(tab_id));

create policy transfers_select_members on public.transfers for select to authenticated
  using (exists (select 1 from public.ledgers l where l.id = ledger_id and private.is_tab_member(l.tab_id)));
create policy transfers_insert_members on public.transfers for insert to authenticated
  with check (exists (select 1 from public.ledgers l where l.id = ledger_id and private.can_edit_tab(l.tab_id)));

create policy settlements_select_members on public.settlements for select to authenticated
  using (exists (select 1 from public.ledgers l where l.id = ledger_id and private.is_tab_member(l.tab_id)));
create policy settlements_insert_members on public.settlements for insert to authenticated
  with check (exists (select 1 from public.ledgers l where l.id = ledger_id and private.can_edit_tab(l.tab_id)));
create policy settlements_update_members on public.settlements for update to authenticated
  using (exists (select 1 from public.ledgers l where l.id = ledger_id and private.can_edit_tab(l.tab_id)))
  with check (exists (select 1 from public.ledgers l where l.id = ledger_id and private.can_edit_tab(l.tab_id)));

create policy approvals_select_members on public.settlement_approvals for select to authenticated
  using (exists (select 1 from public.ledgers l where l.id = ledger_id and private.is_tab_member(l.tab_id)));
create policy approvals_insert_signer on public.settlement_approvals for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.participants p
      join public.ledgers l on l.tab_id = p.tab_id
      where p.id = settlement_approvals.participant_id
        and l.id = settlement_approvals.ledger_id
        and p.user_id = (select auth.uid())
        and lower(p.wallet_address) = lower(settlement_approvals.wallet_address)
        and l.plan_hash = settlement_approvals.plan_hash
    )
  );
create policy approvals_update_signer on public.settlement_approvals for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy challenges_select_signer on public.approval_challenges for select to authenticated
  using (user_id = (select auth.uid()));
create policy challenges_insert_members on public.approval_challenges for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.can_edit_tab(tab_id)
    and exists (
      select 1 from public.participants p
      where p.id = participant_id and p.tab_id = approval_challenges.tab_id and p.user_id = (select auth.uid())
    )
  );
create policy challenges_update_signer on public.approval_challenges for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy api_tokens_owner_all on public.api_tokens for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy wallet_accounts_select_self on public.wallet_accounts for select to authenticated
  using (user_id = (select auth.uid()));
create policy wallet_accounts_delete_self on public.wallet_accounts for delete to authenticated
  using (user_id = (select auth.uid()));
create policy idempotency_owner_all on public.idempotency_records for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy audit_select_members on public.audit_events for select to authenticated
  using (tab_id is not null and private.is_tab_member(tab_id));
drop policy if exists audit_insert_actor on public.audit_events;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles, public.tabs, public.tab_members,
  public.participants, public.receipts, public.receipt_items, public.allocations,
  public.ledgers, public.transfers, public.settlements, public.settlement_approvals,
  public.approval_challenges, public.api_tokens, public.idempotency_records to authenticated;
grant select, delete on public.wallet_accounts to authenticated;
grant select, insert on public.audit_events to authenticated;
grant usage, select on sequence public.audit_events_id_seq to authenticated;

-- Browser sessions may edit safe draft fields through RLS, but identity,
-- invitation, audit and wallet-approval fields are mutation-capable only via
-- the narrow RPCs above (or a separately verified server-side wallet flow).
revoke insert, update on public.tabs from authenticated;
grant insert (title, currency, owner_id) on public.tabs to authenticated;
grant update (title, currency, payer_participant_id) on public.tabs to authenticated;
revoke insert, update on public.participants from authenticated;
grant update (display_name) on public.participants to authenticated;
revoke insert, update, delete on public.tab_members from authenticated;
revoke select, insert, update, delete on public.settlement_approvals from authenticated;
revoke insert, update, delete on public.approval_challenges from authenticated;
-- Token issuance/revocation and idempotency state are server trust-boundary
-- operations. RLS ownership alone must not let a browser mint submit scopes or
-- rewrite a completed execution response; future UI management uses narrow RPCs.
revoke insert, update, delete on public.api_tokens from authenticated;
revoke insert, update, delete on public.idempotency_records from authenticated;
revoke insert on public.audit_events from authenticated;

-- Tables are not public APIs. Explicitly keep anonymous callers and broad
-- PUBLIC privileges out even if project Data API exposure settings change.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
