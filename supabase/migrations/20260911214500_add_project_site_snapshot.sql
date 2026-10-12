-- A project must reopen with stable location context even when its source object
-- is outside the current viewport. This is a bounded canonical display snapshot;
-- source observations and analyses remain separately versioned.
alter table public.projects
  add column if not exists site_snapshot jsonb;

alter table public.projects
  add constraint projects_site_snapshot_is_object
  check (site_snapshot is null or jsonb_typeof(site_snapshot) = 'object');

grant update (site_snapshot) on public.projects to authenticated;
