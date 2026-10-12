-- Persistent, source-bound canonical objects. Large display geometries remain in
-- versioned tiles; this catalogue supports exact selection, relations and search.
create table public.spatial_entities (
  id text primary key,
  entity_type text not null check (entity_type in (
    'region','municipality','district','neighborhood','address','building','parcel','site',
    'infrastructure','planning-area','environmental-constraint','opportunity',
    'organization-asset','project','scenario','scenario-object'
  )),
  name text not null check (length(trim(name)) between 1 and 240),
  description text,
  geometry geometry(Geometry, 4326),
  properties jsonb not null default '{}'::jsonb check (jsonb_typeof(properties) = 'object'),
  primary_snapshot_id uuid references public.dataset_snapshots(id),
  owner_id uuid references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  search_document tsvector generated always as (
    to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(description, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (owner_id is null and organization_id is null and project_id is null and primary_snapshot_id is not null)
    or project_id is not null
    or (project_id is null and organization_id is not null and owner_id is null)
    or (project_id is null and organization_id is null and owner_id is not null)
  )
);

create index spatial_entities_search_idx on public.spatial_entities using gin(search_document);
create index spatial_entities_geometry_idx on public.spatial_entities using gist(geometry);
create index spatial_entities_type_idx on public.spatial_entities(entity_type);
create index spatial_entities_snapshot_idx on public.spatial_entities(primary_snapshot_id) where primary_snapshot_id is not null;
create index spatial_entities_owner_idx on public.spatial_entities(owner_id) where owner_id is not null;
create index spatial_entities_organization_idx on public.spatial_entities(organization_id) where organization_id is not null;
create index spatial_entities_project_idx on public.spatial_entities(project_id) where project_id is not null;

create table public.source_records (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.dataset_snapshots(id) on delete cascade,
  entity_id text references public.spatial_entities(id) on delete cascade,
  external_id text not null,
  observed_at timestamptz not null,
  payload_reference text,
  created_at timestamptz not null default now(),
  unique(snapshot_id, external_id)
);
create index source_records_entity_idx on public.source_records(entity_id) where entity_id is not null;

create table public.entity_relationships (
  id uuid primary key default gen_random_uuid(),
  left_entity_id text not null references public.spatial_entities(id) on delete cascade,
  right_entity_id text not null references public.spatial_entities(id) on delete cascade,
  relation_type text not null check (relation_type in (
    'located-at','contains','part-of','registered-on','derived-from','candidate-for',
    'project-site','scenario-of','permit-for','tender-for','realizes'
  )),
  snapshot_id uuid references public.dataset_snapshots(id),
  method_version text not null,
  created_at timestamptz not null default now(),
  check (left_entity_id <> right_entity_id),
  unique(left_entity_id, right_entity_id, relation_type)
);
create index entity_relationships_left_idx on public.entity_relationships(left_entity_id, relation_type);
create index entity_relationships_right_idx on public.entity_relationships(right_entity_id, relation_type);
create index entity_relationships_snapshot_idx on public.entity_relationships(snapshot_id) where snapshot_id is not null;

alter table public.spatial_entities enable row level security;
alter table public.source_records enable row level security;
alter table public.entity_relationships enable row level security;

create policy spatial_entities_public_read on public.spatial_entities
for select to anon, authenticated
using (
  owner_id is null and organization_id is null and project_id is null
  and exists (
    select 1 from public.dataset_snapshots ds
    join public.data_sources source on source.id = ds.source_id
    where ds.id = primary_snapshot_id and source.access = 'public'
  )
);

create policy spatial_entities_private_read on public.spatial_entities
for select to authenticated
using (
  owner_id = (select auth.uid())
  or (organization_id is not null and public.is_org_member(organization_id))
  or (project_id is not null and exists (
    select 1 from public.projects project
    where project.id = project_id
      and (project.owner_id = (select auth.uid()) or public.is_org_member(project.organization_id))
  ))
);

create policy source_records_visible_entity_read on public.source_records
for select to anon, authenticated
using (
  entity_id is not null
  and exists (select 1 from public.spatial_entities entity where entity.id = entity_id)
);

create policy source_records_unbound_public_read on public.source_records
for select to anon, authenticated
using (
  entity_id is null
  and exists (
    select 1 from public.dataset_snapshots ds
    join public.data_sources source on source.id = ds.source_id
    where ds.id = snapshot_id and source.access = 'public'
  )
);

create policy entity_relationships_visible_read on public.entity_relationships
for select to anon, authenticated
using (
  exists (select 1 from public.spatial_entities entity where entity.id = left_entity_id)
  and exists (select 1 from public.spatial_entities entity where entity.id = right_entity_id)
);

revoke all on public.spatial_entities, public.source_records, public.entity_relationships from anon, authenticated;
grant select on public.spatial_entities, public.source_records, public.entity_relationships to anon, authenticated;
grant all on public.spatial_entities, public.source_records, public.entity_relationships to service_role;

create trigger spatial_entities_touch before update on public.spatial_entities
for each row execute function public.touch_updated_at();
