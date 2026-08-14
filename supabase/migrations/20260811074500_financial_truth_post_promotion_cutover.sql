-- Apply only after the web candidate using the durable settlement-flow RPCs
-- has passed live probes. Keeping this cutover separate avoids breaking the
-- currently served release during an additive schema promotion.

drop policy if exists ledgers_insert_members on public.ledgers;
drop policy if exists transfers_insert_members on public.transfers;
drop policy if exists settlements_insert_members on public.settlements;
drop policy if exists settlements_update_members on public.settlements;
drop policy if exists approvals_insert_signer on public.settlement_approvals;
drop policy if exists approvals_update_signer on public.settlement_approvals;

-- PostgreSQL table privileges such as TRUNCATE bypass row-level policies and
-- row triggers. Browser-facing roles never need schema-maintenance authority;
-- remove the Supabase default grants across the whole public schema before the
-- financial DML cutover. SELECT and the narrow collaboration writes granted by
-- earlier migrations are intentionally unaffected.
revoke truncate, references, trigger, maintain on all tables in schema public
  from public, anon, authenticated;

revoke insert, update, delete on public.ledgers from authenticated;
revoke insert, update, delete on public.transfers from authenticated;
revoke insert, update, delete on public.signatures from authenticated;
revoke insert, update, delete on public.settlements from authenticated;
revoke insert, update, delete on public.settlement_approvals from authenticated;

-- The replacement reserve_voice_budget RPC is already deployed and probed
-- before this cutover; retire the legacy request-count-only surface here.
revoke execute on function public.consume_voice_quota(text) from authenticated;
