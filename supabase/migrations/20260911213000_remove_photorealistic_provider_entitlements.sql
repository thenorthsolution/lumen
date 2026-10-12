-- Lumen uses only open Dutch 3D sources. Remove the obsolete paid-provider
-- capability and allowance so no deployment can grant or meter that route.
delete from public.plan_features
where feature = 'photorealistic-3d';

delete from public.plan_allowances
where kind = 'photorealistic-session';
