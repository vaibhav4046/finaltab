-- INSERT ... RETURNING evaluates the table's SELECT policy before the
-- after-insert owner-membership trigger can make private.is_tab_member(id)
-- true. The row already carries an immutable, policy-checked owner_id, so let
-- that owner read the row directly while retaining the existing member path.
drop policy if exists tabs_select_members on public.tabs;
create policy tabs_select_members on public.tabs
for select to authenticated
using (
  owner_id = (select auth.uid())
  or private.is_tab_member(id)
);
