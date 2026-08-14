-- Cover every currently unindexed foreign-key side. Existing primary, unique,
-- partial, and composite indexes were inspected first; none has these columns
-- as a usable leading prefix.
create index idx_approval_challenges_ledger_id
  on public.approval_challenges (ledger_id);

create index idx_approval_challenges_participant_id
  on public.approval_challenges (participant_id);

create index idx_approval_challenges_tab_id
  on public.approval_challenges (tab_id);

create index idx_audit_events_actor_id
  on public.audit_events (actor_id);

create index idx_audit_events_settlement_id
  on public.audit_events (settlement_id);

create index idx_ledgers_supersedes_ledger_id
  on public.ledgers (supersedes_ledger_id);

create index idx_participants_user_id
  on public.participants (user_id);

create index idx_receipts_confirmed_by
  on public.receipts (confirmed_by);

create index idx_settlement_approvals_participant_id
  on public.settlement_approvals (participant_id);

create index idx_settlement_approvals_user_id
  on public.settlement_approvals (user_id);

create index idx_signatures_ledger_id
  on public.signatures (ledger_id);

create index idx_tabs_payer_participant_id
  on public.tabs (payer_participant_id);

create index idx_transfers_creditor_participant_id
  on public.transfers (creditor_participant_id);

create index idx_transfers_debtor_participant_id
  on public.transfers (debtor_participant_id);
