-- Shared source lineage and project geometry for the unified Lumen workspace.
-- Raw national datasets and licensed payloads remain server-managed; exposed
-- tables contain only catalogue metadata and tenant-scoped project records.
create table public.data_sources (
  id text primary key,
  label text not null,
  authority text not null,
  access text not null check (access in ('public','account','organization','government','licensed')),
  availability text not null check (availability in ('available','planned','requires-connection','unavailable')),
  license_url text,
  coverage text not null default 'national',
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.dataset_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.data_sources(id),
  version text not null,
  captured_at timestamptz not null,
  valid_from timestamptz,
  valid_until timestamptz,
  license text not null,
  checksum text,
  method_version text,
  coverage geometry(Geometry, 4326),
  unique(source_id, version)
);

create table public.spatial_observations (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.dataset_snapshots(id),
  organization_id uuid references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  subject_entity_id text,
  theme text not null,
  geometry geometry(Geometry, 4326),
  observed_at timestamptz not null,
  method_version text not null,
  metrics jsonb not null default '[]'::jsonb check (jsonb_typeof(metrics) = 'array'),
  limitations jsonb not null default '[]'::jsonb check (jsonb_typeof(limitations) = 'array'),
  created_at timestamptz not null default now()
);
create index spatial_observations_subject_idx on public.spatial_observations(subject_entity_id, theme, observed_at desc);
create index spatial_observations_project_idx on public.spatial_observations(project_id) where project_id is not null;
create index spatial_observations_organization_idx on public.spatial_observations(organization_id) where organization_id is not null;
create index spatial_observations_geometry_idx on public.spatial_observations using gist(geometry);

create table public.suitability_assessments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  subject_entity_id text,
  geometry geometry(Geometry, 4326),
  conclusion text not null check (conclusion in ('promising','conditional','blocked','needs-research')),
  dimensions jsonb not null default '[]'::jsonb check (jsonb_typeof(dimensions) = 'array'),
  blockers jsonb not null default '[]'::jsonb check (jsonb_typeof(blockers) = 'array'),
  snapshot_ids uuid[] not null default '{}',
  method_version text not null,
  assessed_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index suitability_subject_idx on public.suitability_assessments(subject_entity_id, assessed_at desc);
create index suitability_project_idx on public.suitability_assessments(project_id) where project_id is not null;
create index suitability_organization_idx on public.suitability_assessments(organization_id) where organization_id is not null;
create index suitability_geometry_idx on public.suitability_assessments using gist(geometry);

create table public.project_drawings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  name text not null check (length(trim(name)) between 1 and 160),
  kind text not null check (kind in ('point','line','polygon','rectangle')),
  geometry geometry(Geometry, 4326) not null,
  color text not null default '#315df0' check (color ~ '^#[0-9a-fA-F]{6}$'),
  note text,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_drawings_project_idx on public.project_drawings(project_id);
create index project_drawings_geometry_idx on public.project_drawings using gist(geometry);

create table public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  label text not null,
  status text not null check (status in ('planned','active','complete','blocked')),
  planned_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.data_connectors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_id text not null references public.data_sources(id),
  status text not null default 'disconnected' check (status in ('disconnected','connected','degraded')),
  credential_reference text,
  last_sync_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, source_id)
);

alter table public.data_sources enable row level security;
alter table public.dataset_snapshots enable row level security;
alter table public.spatial_observations enable row level security;
alter table public.suitability_assessments enable row level security;
alter table public.project_drawings enable row level security;
alter table public.project_milestones enable row level security;
alter table public.data_connectors enable row level security;

create policy data_sources_public_read on public.data_sources for select to anon, authenticated using (true);
create policy snapshots_public_read on public.dataset_snapshots for select to anon, authenticated using (exists(select 1 from public.data_sources s where s.id = source_id and s.access = 'public'));
create policy observations_public_read on public.spatial_observations for select to anon, authenticated using (organization_id is null and exists(select 1 from public.dataset_snapshots ds join public.data_sources s on s.id = ds.source_id where ds.id = snapshot_id and s.access = 'public'));
create policy observations_org_read on public.spatial_observations for select to authenticated using (organization_id is not null and public.is_org_member(organization_id));
create policy assessments_project_read on public.suitability_assessments for select to authenticated using ((organization_id is not null and public.is_org_member(organization_id)) or exists(select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or public.is_org_member(p.organization_id))));
create policy drawings_project_read on public.project_drawings for select to authenticated using (exists(select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or public.is_org_member(p.organization_id))));
create policy drawings_project_insert on public.project_drawings for insert to authenticated with check (created_by = (select auth.uid()) and exists(select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or public.has_org_role(p.organization_id, array['owner','admin','editor']))));
create policy drawings_project_update on public.project_drawings for update to authenticated using (exists(select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or public.has_org_role(p.organization_id, array['owner','admin','editor'])))) with check (created_by = (select auth.uid()) and exists(select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or public.has_org_role(p.organization_id, array['owner','admin','editor']))));
create policy drawings_project_delete on public.project_drawings for delete to authenticated using (exists(select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or public.has_org_role(p.organization_id, array['owner','admin','editor']))));
create policy milestones_project_read on public.project_milestones for select to authenticated using (exists(select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or public.is_org_member(p.organization_id))));
create policy milestones_project_write on public.project_milestones for all to authenticated using (exists(select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or public.has_org_role(p.organization_id, array['owner','admin','editor'])))) with check (created_by = (select auth.uid()) and exists(select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or public.has_org_role(p.organization_id, array['owner','admin','editor']))));
create policy connectors_member_read on public.data_connectors for select to authenticated using (public.is_org_member(organization_id));
create policy connectors_admin_write on public.data_connectors for all to authenticated using (public.has_org_role(organization_id, array['owner','admin'])) with check (created_by = (select auth.uid()) and public.has_org_role(organization_id, array['owner','admin']));

revoke all on public.data_sources, public.dataset_snapshots, public.spatial_observations, public.suitability_assessments, public.project_drawings, public.project_milestones, public.data_connectors from anon, authenticated;
grant select on public.data_sources, public.dataset_snapshots, public.spatial_observations to anon, authenticated;
grant select on public.suitability_assessments to authenticated;
grant select, insert, update, delete on public.project_drawings, public.project_milestones to authenticated;
grant select, insert, update, delete on public.data_connectors to authenticated;
grant all on public.data_sources, public.dataset_snapshots, public.spatial_observations, public.suitability_assessments, public.project_drawings, public.project_milestones, public.data_connectors to service_role;

create trigger project_drawings_touch before update on public.project_drawings for each row execute function public.touch_updated_at();
create trigger project_milestones_touch before update on public.project_milestones for each row execute function public.touch_updated_at();
create trigger data_connectors_touch before update on public.data_connectors for each row execute function public.touch_updated_at();

create or replace function lumen_private.increment_drawing_version() returns trigger language plpgsql set search_path = public as $$
begin
  new.version := old.version + 1;
  return new;
end $$;
create trigger project_drawings_increment_version before update on public.project_drawings for each row execute function lumen_private.increment_drawing_version();
revoke all on function lumen_private.increment_drawing_version() from public, anon, authenticated;

insert into public.data_sources (id,label,authority,access,availability,license_url) values
  ('bag','BAG','Kadaster','public','available','https://www.kadaster.nl/-/gebruiksvoorwaarden-bag'),
  ('bgt','BGT','Landelijke voorziening BGT','public','available','https://www.pdok.nl/introductie/-/article/basisregistratie-grootschalige-topografie-bgt-'),
  ('brk','Kadastrale kaart','Kadaster','public','planned','https://www.pdok.nl/introductie/-/article/kadastrale-kaart'),
  ('cbs','CBS wijken en buurten','CBS','public','available','https://www.cbs.nl/nl-nl/over-ons/website/copyright'),
  ('dso','DSO','IPLO','public','planned','https://iplo.nl/digitaal-stelsel/aansluiten/open-data-api/'),
  ('tenderned','TenderNed','TenderNed','public','planned','https://www.tenderned.nl/cms/nl/aanbesteden-in-cijfers/datasets-aanbestedingen'),
  ('brainbay','Brainbay','Brainbay','licensed','requires-connection','https://brainbay.nl/producten/object-informatie/'),
  ('kadaster-commercial','Kadaster zakelijk','Kadaster','licensed','requires-connection','https://www.kadaster.nl/zakelijk/over-ons/financieel/tarieven')
on conflict (id) do update set label=excluded.label, authority=excluded.authority, access=excluded.access, availability=excluded.availability, license_url=excluded.license_url, updated_at=now();
