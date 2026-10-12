alter table public.scenarios
  add column if not exists calculation jsonb;

alter table public.scenarios
  add constraint scenarios_calculation_object
  check (calculation is null or jsonb_typeof(calculation) = 'object');

comment on column public.scenarios.calculation is
  'Validated, versioned scenario input and output used to reproduce the visible estimate.';
