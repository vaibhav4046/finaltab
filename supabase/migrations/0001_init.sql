-- FINALTab schema. All money columns are integer minor units (bigint), never numeric floats.
-- Amount strings from the vision layer are validated and converted server-side before insert.

create table if not exists tabs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  currency char(3) not null,
  payer_participant_id uuid,
  status text not null default 'open'
    check (status in ('open', 'frozen', 'signing', 'settling', 'verified_settled', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references tabs(id) on delete cascade,
  display_name text not null,
  wallet_address text,
  created_at timestamptz not null default now(),
  unique (tab_id, display_name)
);

alter table tabs
  add constraint tabs_payer_fk
  foreign key (payer_participant_id) references participants(id) deferrable initially deferred;

create table if not exists receipts (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references tabs(id) on delete cascade,
  image_path text,
  raw_extraction jsonb not null,
  merchant text,
  subtotal_minor bigint,
  tax_minor bigint,
  tip_minor bigint,
  service_charge_minor bigint,
  total_minor bigint not null check (total_minor >= 0),
  created_at timestamptz not null default now()
);

create table if not exists receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references receipts(id) on delete cascade,
  position int not null,
  label text not null,
  quantity int not null default 1 check (quantity > 0),
  amount_minor bigint not null check (amount_minor >= 0),
  unique (receipt_id, position)
);

create table if not exists allocations (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references tabs(id) on delete cascade,
  instruction text not null,
  model_proposal jsonb not null,
  reconciled_shares jsonb not null, -- {participant_id: share_minor}, engine output, sums to receipt total
  created_at timestamptz not null default now()
);

-- One frozen ledger per tab. Any edit means a NEW ledger row with a NEW hash;
-- signatures reference the hash they signed, so stale signatures are unusable.
create table if not exists ledgers (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references tabs(id) on delete cascade,
  canonical_json jsonb not null,
  ledger_hash text not null unique, -- keccak256 hex of canonical ledger
  frozen_at timestamptz not null default now()
);

create table if not exists transfers (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references ledgers(id) on delete cascade,
  debtor_participant_id uuid not null references participants(id),
  creditor_participant_id uuid not null references participants(id),
  usdc_minor bigint not null check (usdc_minor > 0),
  check (debtor_participant_id <> creditor_participant_id)
);

create table if not exists signatures (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references ledgers(id) on delete cascade,
  transfer_id uuid not null references transfers(id) on delete cascade,
  signer_address text not null,
  eip3009_nonce text not null, -- derived from ledger_hash + transfer index
  valid_after bigint not null,
  valid_before bigint not null,
  signature text not null,
  created_at timestamptz not null default now(),
  unique (transfer_id)
);

create table if not exists settlements (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references ledgers(id) on delete cascade,
  settlement_id text not null unique, -- derived from ledger_hash, replay-blocked onchain
  chain_id bigint not null,
  contract_address text,
  keeperhub_execution_id text,
  simulate_result jsonb,
  -- Fail-closed state machine. verified_settled requires a terminal-success
  -- execution AND a receipt with verified=true AND receiptStatus='success'.
  status text not null default 'draft'
    check (status in ('draft', 'simulated', 'simulation_failed', 'submitted',
                      'completed_unverified', 'verified_settled', 'failed', 'timeout')),
  receipts jsonb, -- raw KeeperHub ExecutionReceipt[] as returned, never synthesized
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS: locked down by default. The web app talks to Postgres only through
-- server route handlers using the service role; no anon writes.
alter table tabs enable row level security;
alter table participants enable row level security;
alter table receipts enable row level security;
alter table receipt_items enable row level security;
alter table allocations enable row level security;
alter table ledgers enable row level security;
alter table transfers enable row level security;
alter table signatures enable row level security;
alter table settlements enable row level security;

create index if not exists idx_participants_tab on participants(tab_id);
create index if not exists idx_receipts_tab on receipts(tab_id);
create index if not exists idx_items_receipt on receipt_items(receipt_id);
create index if not exists idx_allocations_tab on allocations(tab_id);
create index if not exists idx_ledgers_tab on ledgers(tab_id);
create index if not exists idx_transfers_ledger on transfers(ledger_id);
create index if not exists idx_settlements_ledger on settlements(ledger_id);
create index if not exists idx_settlements_exec on settlements(keeperhub_execution_id);
