-- Harden exposed-schema helpers and explicitly opt tables into the Data API.
-- Authorization comes from auth.uid() and membership rows, never user_metadata.

create or replace function public.is_org_member(target_org uuid, target_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select target_user is not null
    and target_user = (select auth.uid())
    and exists(select 1 from public.organization_members where organization_id = target_org and user_id = target_user)
$$;

create or replace function public.has_org_role(target_org uuid, allowed_roles text[], target_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select target_user is not null
    and target_user = (select auth.uid())
    and exists(select 1 from public.organization_members where organization_id = target_org and user_id = target_user and role = any(allowed_roles))
$$;

revoke all on function public.is_org_member(uuid, uuid) from public, anon;
revoke all on function public.has_org_role(uuid, text[], uuid) from public, anon;
grant execute on function public.is_org_member(uuid, uuid) to authenticated;
grant execute on function public.has_org_role(uuid, text[], uuid) to authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.add_org_owner() from public, anon, authenticated;
revoke all on function public.resolve_subject_plan(text, uuid) from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;

revoke all on public.plans, public.plan_features, public.plan_allowances, public.profiles,
  public.organizations, public.organization_members, public.invitations, public.subscriptions,
  public.workspaces, public.projects, public.scenarios, public.project_artifacts,
  public.share_links, public.usage_balances, public.usage_reservations, public.usage_events,
  public.audit_events, public.provider_cost_events, public.stripe_events from anon, authenticated;

grant select on public.plans, public.plan_features to anon, authenticated;
grant select on public.plan_allowances to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert on public.organizations to authenticated;
grant update (name, slug) on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_members, public.invitations to authenticated;
grant select on public.subscriptions to authenticated;
grant select, insert on public.workspaces, public.projects to authenticated;
grant update (name) on public.workspaces to authenticated;
grant update (site_entity_id, name, status) on public.projects to authenticated;
grant select, insert, delete on public.scenarios, public.project_artifacts, public.share_links to authenticated;
grant update (name, status, assumptions, objects) on public.scenarios to authenticated;
grant update (title, status, content, provenance, assumptions) on public.project_artifacts to authenticated;
grant update (expires_at, revoked_at) on public.share_links to authenticated;
grant select on public.usage_balances, public.usage_reservations, public.usage_events, public.audit_events to authenticated;

grant all on public.plans, public.plan_features, public.plan_allowances, public.profiles,
  public.organizations, public.organization_members, public.invitations, public.subscriptions,
  public.workspaces, public.projects, public.scenarios, public.project_artifacts,
  public.share_links, public.usage_balances, public.usage_reservations, public.usage_events,
  public.audit_events, public.provider_cost_events, public.stripe_events to service_role;

drop policy organizations_admin_update on public.organizations;
create policy organizations_admin_update on public.organizations for update to authenticated
  using (public.has_org_role(id, array['owner','admin']))
  with check (public.has_org_role(id, array['owner','admin']));

drop policy workspaces_scope_update on public.workspaces;
create policy workspaces_scope_update on public.workspaces for update to authenticated
  using (owner_id = (select auth.uid()) or public.has_org_role(organization_id, array['owner','admin','editor']))
  with check (owner_id = (select auth.uid()) or public.has_org_role(organization_id, array['owner','admin','editor']));

drop policy projects_scope_update on public.projects;
create policy projects_scope_update on public.projects for update to authenticated
  using (owner_id = (select auth.uid()) or public.has_org_role(organization_id, array['owner','admin','editor']))
  with check (owner_id = (select auth.uid()) or public.has_org_role(organization_id, array['owner','admin','editor']));

drop policy scenarios_project_write on public.scenarios;
create policy scenarios_project_write on public.scenarios for all to authenticated
  using (exists(select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or public.has_org_role(p.organization_id, array['owner','admin','editor']))))
  with check (created_by = (select auth.uid()) and exists(select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or public.has_org_role(p.organization_id, array['owner','admin','editor']))));

drop policy artifacts_project_write on public.project_artifacts;
create policy artifacts_project_write on public.project_artifacts for all to authenticated
  using (exists(select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or public.has_org_role(p.organization_id, array['owner','admin','editor']))))
  with check (created_by = (select auth.uid()) and exists(select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or public.has_org_role(p.organization_id, array['owner','admin','editor']))));

drop policy share_links_owner_write on public.share_links;
create policy share_links_owner_write on public.share_links for all to authenticated
  using (exists(select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or public.has_org_role(p.organization_id, array['owner','admin']))))
  with check (created_by = (select auth.uid()) and exists(select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or public.has_org_role(p.organization_id, array['owner','admin']))));
