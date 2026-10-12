begin;
select plan(61);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'personal@lumen.test', '', now(), '{}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'viewer@lumen.test', '', now(), '{}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'editor@lumen.test', '', now(), '{}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'government@lumen.test', '', now(), '{}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outsider@lumen.test', '', now(), '{}', '{}', now(), now());

insert into public.organizations (id, name, slug, created_by, plan_id) values
  ('20000000-0000-0000-0000-000000000001', 'Lumen organisatie', 'lumen-organisatie', '10000000-0000-0000-0000-000000000003', 'organization'),
  ('20000000-0000-0000-0000-000000000002', 'Gemeente Lumen', 'gemeente-lumen', '10000000-0000-0000-0000-000000000004', 'enterprise');
insert into public.organization_members (organization_id, user_id, role) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'viewer')
on conflict do nothing;
insert into public.workspaces (id, organization_id, owner_id, name) values
  ('30000000-0000-0000-0000-000000000001', null, '10000000-0000-0000-0000-000000000001', 'Persoonlijk'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'Organisatie'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004', 'Gemeente');
insert into public.projects (id, workspace_id, organization_id, owner_id, name) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', null, '10000000-0000-0000-0000-000000000001', 'Privéproject'),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'Organisatieproject'),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004', 'Gemeenteproject');

insert into public.dataset_snapshots (id, source_id, version, captured_at, license, method_version) values
  ('50000000-0000-0000-0000-000000000001', 'bag', 'rls-test', now(), 'CC0', 'rls-fixture-1.0');
insert into public.spatial_entities (id, entity_type, name, primary_snapshot_id, owner_id, organization_id, project_id) values
  ('cbs-municipality-test', 'municipality', 'Publieke gemeente', '50000000-0000-0000-0000-000000000001', null, null, null),
  ('bag-building-test', 'building', 'Publiek BAG-pand', '50000000-0000-0000-0000-000000000001', null, null, null),
  ('site-personal-test', 'site', 'Persoonlijke locatie', '50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', null, '40000000-0000-0000-0000-000000000001'),
  ('site-organization-test', 'site', 'Organisatielocatie', '50000000-0000-0000-0000-000000000001', null, '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002'),
  ('site-government-test', 'site', 'Overheidslocatie', '50000000-0000-0000-0000-000000000001', null, '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000003');
insert into public.source_records (id, snapshot_id, entity_id, external_id, observed_at) values
  ('51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'cbs-municipality-test', 'GMTEST', now()),
  ('51000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'bag-building-test', 'BAGTEST', now()),
  ('51000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', 'site-personal-test', 'PERSONAL', now()),
  ('51000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000001', 'site-organization-test', 'ORGANIZATION', now()),
  ('51000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000001', 'site-government-test', 'GOVERNMENT', now());
insert into public.entity_relationships (id, left_entity_id, right_entity_id, relation_type, snapshot_id, method_version) values
  ('52000000-0000-0000-0000-000000000001', 'bag-building-test', 'cbs-municipality-test', 'part-of', '50000000-0000-0000-0000-000000000001', 'rls-fixture-1.0'),
  ('52000000-0000-0000-0000-000000000002', 'site-personal-test', 'bag-building-test', 'derived-from', '50000000-0000-0000-0000-000000000001', 'rls-fixture-1.0'),
  ('52000000-0000-0000-0000-000000000003', 'site-organization-test', 'bag-building-test', 'derived-from', '50000000-0000-0000-0000-000000000001', 'rls-fixture-1.0'),
  ('52000000-0000-0000-0000-000000000004', 'site-government-test', 'bag-building-test', 'derived-from', '50000000-0000-0000-0000-000000000001', 'rls-fixture-1.0');
select lives_ok($$insert into public.spatial_entities (id, entity_type, name, primary_snapshot_id) values ('permit-type-test', 'permit', 'Vergunningtype', '50000000-0000-0000-0000-000000000001')$$, 'canonieke catalogus ondersteunt vergunningen');
select lives_ok($$insert into public.spatial_entities (id, entity_type, name, primary_snapshot_id) values ('tender-type-test', 'tender', 'Tendertype', '50000000-0000-0000-0000-000000000001')$$, 'canonieke catalogus ondersteunt tenders');
select lives_ok($$insert into public.spatial_entities (id, entity_type, name, primary_snapshot_id) values ('realization-type-test', 'realization', 'Realisatietype', '50000000-0000-0000-0000-000000000001')$$, 'canonieke catalogus ondersteunt realisatieobjecten');
delete from public.spatial_entities where id in ('permit-type-test', 'tender-type-test', 'realization-type-test');
insert into public.spatial_observations (id, snapshot_id, organization_id, project_id, subject_entity_id, theme, observed_at, method_version) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', null, null, 'bag-global', 'building', now(), 'rls-fixture-1.0'),
  ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', null, '40000000-0000-0000-0000-000000000001', 'bag-personal', 'analysis', now(), 'rls-fixture-1.0'),
  ('60000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'bag-organization', 'analysis', now(), 'rls-fixture-1.0'),
  ('60000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000003', 'bag-government', 'analysis', now(), 'rls-fixture-1.0');
insert into public.suitability_assessments (id, project_id, organization_id, subject_entity_id, conclusion, method_version, assessed_at) values
  ('70000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', null, 'site-personal', 'needs-research', 'rls-fixture-1.0', now()),
  ('70000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'site-organization', 'conditional', 'rls-fixture-1.0', now()),
  ('70000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'site-government', 'promising', 'rls-fixture-1.0', now());
insert into public.project_drawings (id, project_id, created_by, name, kind, geometry) values
  ('80000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Privévlak', 'polygon', st_geomfromtext('POLYGON((6.15 52.25,6.16 52.25,6.16 52.26,6.15 52.25))', 4326)),
  ('80000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'Organisatievlak', 'polygon', st_geomfromtext('POLYGON((6.15 52.25,6.16 52.25,6.16 52.26,6.15 52.25))', 4326)),
  ('80000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004', 'Gemeentevlak', 'polygon', st_geomfromtext('POLYGON((6.15 52.25,6.16 52.25,6.16 52.26,6.15 52.25))', 4326));
insert into public.data_connectors (id, organization_id, source_id, status, credential_reference, created_by) values
  ('90000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'brainbay', 'connected', 'vault://organization/brainbay', '10000000-0000-0000-0000-000000000003'),
  ('90000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'kadaster-commercial', 'connected', 'vault://government/kadaster', '10000000-0000-0000-0000-000000000004');

set local role anon;
select is((select count(*) from public.plans where active), 5::bigint, 'publiek kan actieve plannen lezen');
select is((select count(*) from public.projects), 0::bigint, 'publiek kan geen projecten lezen');
select throws_ok($$insert into public.projects (workspace_id, owner_id, name) values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Verboden')$$, '42501', null, 'publiek kan geen project schrijven');
select is((select count(*) from public.spatial_observations), 1::bigint, 'publiek ziet alleen globale observaties uit publieke bronnen');
select is((select count(*) from public.spatial_entities), 2::bigint, 'publiek ziet alleen globale canonieke objecten');
select is((select count(*) from public.source_records), 2::bigint, 'publiek ziet alleen bronrecords van globale objecten');
select is((select count(*) from public.entity_relationships), 1::bigint, 'publiek ziet alleen volledig publieke relaties');
select throws_ok($$insert into public.spatial_entities (id, entity_type, name, primary_snapshot_id) values ('forbidden', 'building', 'Verboden', '50000000-0000-0000-0000-000000000001')$$, '42501', null, 'publiek kan de canonieke catalogus niet schrijven');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.projects), 1::bigint, 'persoonlijk account ziet alleen eigen project');
select ok(not public.is_org_member('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002'), 'helper kan geen andere gebruiker onderzoeken');
select is((select count(*) from public.spatial_observations), 2::bigint, 'persoonlijk account ziet globale en eigen projectobservaties');
select is((select count(*) from public.suitability_assessments), 1::bigint, 'persoonlijk account ziet alleen eigen geschiktheidsanalyse');
select is((select count(*) from public.project_drawings), 1::bigint, 'persoonlijk account ziet alleen eigen tekeningen');
select is((select count(*) from public.spatial_entities), 3::bigint, 'persoonlijk account ziet publieke en eigen canonieke objecten');
select is((select count(*) from public.source_records), 3::bigint, 'persoonlijk account ziet publieke en eigen bronrecords');
select is((select count(*) from public.entity_relationships), 2::bigint, 'persoonlijk account ziet alleen relaties waarvan beide objecten zichtbaar zijn');
select throws_ok($$insert into public.spatial_entities (id, entity_type, name, owner_id) values ('forbidden-personal', 'site', 'Verboden', '10000000-0000-0000-0000-000000000001')$$, '42501', null, 'persoonlijk account kan catalogusobjecten niet rechtstreeks schrijven');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.projects), 1::bigint, 'organisatieviewer ziet alleen organisatieproject');
select results_eq($$update public.projects set name = 'Verboden' where id = '40000000-0000-0000-0000-000000000002' returning name$$, array[]::text[], 'viewer kan organisatieproject niet wijzigen');
select is((select count(*) from public.spatial_observations), 2::bigint, 'organisatieviewer ziet globale en eigen organisatieobservaties');
select is((select count(*) from public.suitability_assessments), 1::bigint, 'organisatieviewer ziet alleen analyses van de eigen organisatie');
select is((select count(*) from public.project_drawings), 1::bigint, 'organisatieviewer ziet alleen tekeningen van de eigen organisatie');
select is((select count(*) from public.data_connectors), 1::bigint, 'organisatieviewer ziet alleen connectorstatus van de eigen organisatie');
select throws_ok($$select credential_reference from public.data_connectors$$, '42501', null, 'organisatieviewer kan credentialreferenties niet lezen');
select results_eq($$update public.project_drawings set name = 'Verboden' where id = '80000000-0000-0000-0000-000000000002' returning name$$, array[]::text[], 'viewer kan organisatietekeningen niet wijzigen');
select is((select count(*) from public.spatial_entities), 3::bigint, 'organisatieviewer ziet publieke en eigen organisatieobjecten');
select is((select count(*) from public.source_records), 3::bigint, 'organisatieviewer ziet publieke en eigen bronrecords');
select is((select count(*) from public.entity_relationships), 2::bigint, 'organisatieviewer ziet geen relaties van andere tenants');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.projects), 1::bigint, 'organisatie-editor ziet alleen eigen organisatie');
select results_eq($$update public.projects set name = 'Gewijzigd' where id = '40000000-0000-0000-0000-000000000002' returning name$$, array['Gewijzigd']::text[], 'editor kan organisatieproject wijzigen');
select ok(not public.has_org_role('20000000-0000-0000-0000-000000000002', array['owner','admin'], '10000000-0000-0000-0000-000000000004'), 'rolhelper kan geen andere gebruiker onderzoeken');
select is((select count(*) from public.spatial_observations), 2::bigint, 'organisatie-editor ziet geen observaties van andere tenants');
select is((select count(*) from public.suitability_assessments), 1::bigint, 'organisatie-editor ziet geen analyses van andere tenants');
select lives_ok($$update public.project_drawings set name = 'Gewijzigd vlak' where id = '80000000-0000-0000-0000-000000000002'$$, 'editor kan organisatietekeningen wijzigen');
select is((select count(*) from public.data_connectors), 1::bigint, 'organisatie-editor ziet connectorstatus van de eigen organisatie');
select results_eq($$update public.data_connectors set status = 'degraded' where id = '90000000-0000-0000-0000-000000000001' returning status$$, array[]::text[], 'editor kan connectoren niet beheren');
select throws_ok($$select credential_reference from public.data_connectors$$, '42501', null, 'organisatie-editor kan credentialreferenties niet lezen');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is((select count(*) from public.projects), 1::bigint, 'overheidsaccount ziet alleen eigen overheidsorganisatie');
select is((select plan_id from public.organizations where id = '20000000-0000-0000-0000-000000000002'), 'enterprise', 'overheidsorganisatie behoudt enterprise-plan');
select lives_ok($$update public.projects set status = 'active' where id = '40000000-0000-0000-0000-000000000003'$$, 'overheidsbeheerder kan eigen project beheren');
select is((select count(*) from public.spatial_observations), 2::bigint, 'overheidsaccount ziet globale en eigen overheidsobservaties');
select is((select count(*) from public.suitability_assessments), 1::bigint, 'overheidsaccount ziet alleen eigen overheidsanalyses');
select is((select count(*) from public.project_drawings), 1::bigint, 'overheidsaccount ziet alleen eigen overheidstekeningen');
select is((select count(*) from public.data_connectors), 1::bigint, 'overheidsaccount ziet alleen eigen connectorstatus');
select throws_ok($$select credential_reference from public.data_connectors$$, '42501', null, 'overheidsaccount kan credentialreferenties niet direct lezen');
select lives_ok($$update public.data_connectors set status = 'degraded' where id = '90000000-0000-0000-0000-000000000002'$$, 'overheidsbeheerder kan eigen connector beheren');
select is((select count(*) from public.spatial_entities), 3::bigint, 'overheidsaccount ziet publieke en eigen overheidsobjecten');
select is((select count(*) from public.source_records), 3::bigint, 'overheidsaccount ziet publieke en eigen bronrecords');
select is((select count(*) from public.entity_relationships), 2::bigint, 'overheidsaccount ziet geen relaties van andere tenants');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select is((select count(*) from public.projects), 0::bigint, 'buitenstaander ziet geen tenantprojecten');
select is((select count(*) from public.organization_members), 0::bigint, 'buitenstaander ziet geen memberships');
select is((select count(*) from public.spatial_observations), 1::bigint, 'buitenstaander ziet alleen globale publieke observaties');
select is((select count(*) from public.suitability_assessments), 0::bigint, 'buitenstaander ziet geen private analyses');
select is((select count(*) from public.project_drawings), 0::bigint, 'buitenstaander ziet geen private tekeningen');
select is((select count(*) from public.data_connectors), 0::bigint, 'buitenstaander ziet geen connectorstatus van organisaties');
select is((select count(*) from public.spatial_entities), 2::bigint, 'buitenstaander ziet alleen globale canonieke objecten');
select is((select count(*) from public.source_records), 2::bigint, 'buitenstaander ziet alleen globale bronrecords');
select is((select count(*) from public.entity_relationships), 1::bigint, 'buitenstaander ziet geen private relaties');

reset role;
select * from finish();
rollback;
