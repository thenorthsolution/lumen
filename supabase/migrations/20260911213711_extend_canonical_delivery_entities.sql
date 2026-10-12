-- Complete the canonical delivery chain without weakening the existing scope
-- and source-snapshot checks on spatial_entities.
alter table public.spatial_entities
  drop constraint spatial_entities_entity_type_check;

alter table public.spatial_entities
  add constraint spatial_entities_entity_type_check check (entity_type in (
    'region','municipality','district','neighborhood','address','building','parcel','site',
    'infrastructure','planning-area','environmental-constraint','opportunity',
    'organization-asset','project','scenario','scenario-object','permit','tender','realization'
  ));
