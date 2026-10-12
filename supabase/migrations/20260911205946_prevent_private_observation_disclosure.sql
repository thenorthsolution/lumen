-- Public-source observations are only public when they are global catalogue
-- records. Project-bound observations inherit the project tenant boundary.
drop policy if exists observations_public_read on public.spatial_observations;
create policy observations_public_read on public.spatial_observations
for select to anon, authenticated
using (
  organization_id is null
  and project_id is null
  and exists (
    select 1
    from public.dataset_snapshots ds
    join public.data_sources s on s.id = ds.source_id
    where ds.id = snapshot_id and s.access = 'public'
  )
);

drop policy if exists observations_project_read on public.spatial_observations;
create policy observations_project_read on public.spatial_observations
for select to authenticated
using (
  project_id is not null
  and exists (
    select 1 from public.projects p
    where p.id = project_id
      and (p.owner_id = (select auth.uid()) or public.is_org_member(p.organization_id))
  )
);

-- Connector credential references are server-only. Members may inspect safe
-- connector status metadata, while service_role retains full access.
revoke select on public.data_connectors from authenticated;
grant select (id, organization_id, source_id, status, last_sync_at, created_by, created_at, updated_at)
on public.data_connectors to authenticated;
