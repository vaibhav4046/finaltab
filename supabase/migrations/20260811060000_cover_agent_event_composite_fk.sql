-- Cover the composite settlement-agent event foreign key for parent updates
-- and lifecycle cleanup without duplicating the owner-oriented read index.
create index if not exists idx_agent_events_run_owner_tab
  on public.settlement_agent_events(run_id, owner_id, tab_id);
