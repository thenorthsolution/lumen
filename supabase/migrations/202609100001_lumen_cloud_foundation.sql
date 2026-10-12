-- Lumen open-core cloud contract. The hosted cloud may extend this schema, but
-- renderer and public-data state must not depend on provider-specific columns.
create extension if not exists pgcrypto;
create extension if not exists postgis;
create extension if not exists vector;

create schema if not exists lumen_private;

create table public.plans (
  id text primary key,
  label text not null,
  tier text not null check (tier in ('public', 'personal', 'organization-trial', 'organization', 'enterprise')),
  project_limit integer check (project_limit is null or project_limit >= 0),
  seat_limit integer check (seat_limit is null or seat_limit >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.plan_features (
  plan_id text not null references public.plans(id) on delete cascade,
  feature text not null,
  primary key (plan_id, feature)
);

create table public.plan_allowances (
  plan_id text not null references public.plans(id) on delete cascade,
  kind text not null,
  period text not null check (period in ('day', 'month', 'trial', 'contract')),
  display_units numeric check (display_units is null or display_units >= 0),
  internal_limit numeric not null check (internal_limit >= 0),
  exhausted_behavior text not null check (exhausted_behavior in ('allow', 'queue', 'reject')),
  primary key (plan_id, kind)
);

insert into public.plans (id, label, tier, project_limit, seat_limit) values
  ('public', 'Publiek', 'public', 0, 0),
  ('personal', 'Persoonlijk', 'personal', 10, 1),
  ('organization-trial', 'Organisatieproef', 'organization-trial', null, 3),
  ('organization', 'Organisatie', 'organization', null, null),
  ('enterprise', 'Overheid en enterprise', 'enterprise', null, null)
on conflict (id) do nothing;

insert into public.plan_features (plan_id, feature) values
  ('public', 'public-world'),
  ('personal', 'public-world'), ('personal', 'private-projects'), ('personal', 'core-ai'),
  ('organization-trial', 'public-world'), ('organization-trial', 'private-projects'), ('organization-trial', 'core-ai'), ('organization-trial', 'organization-workspace'), ('organization-trial', 'collaboration'), ('organization-trial', 'photorealistic-3d'), ('organization-trial', 'premium-ai'), ('organization-trial', 'exports'),
  ('organization', 'public-world'), ('organization', 'private-projects'), ('organization', 'core-ai'), ('organization', 'organization-workspace'), ('organization', 'collaboration'), ('organization', 'photorealistic-3d'), ('organization', 'premium-ai'), ('organization', 'private-data'), ('organization', 'exports'), ('organization', 'audit-log'),
  ('enterprise', 'public-world'), ('enterprise', 'private-projects'), ('enterprise', 'core-ai'), ('enterprise', 'organization-workspace'), ('enterprise', 'collaboration'), ('enterprise', 'photorealistic-3d'), ('enterprise', 'premium-ai'), ('enterprise', 'private-data'), ('enterprise', 'exports'), ('enterprise', 'audit-log'), ('enterprise', 'sso')
on conflict do nothing;

-- display_units is intentionally null for fair-use plans. internal_limit is an
-- operational abuse guard and can be tuned without changing the product UI.
insert into public.plan_allowances (plan_id, kind, period, display_units, internal_limit, exhausted_behavior) values
  ('personal', 'ai-chat', 'day', null, 40, 'queue'),
  ('personal', 'voice-minute', 'day', null, 20, 'queue'),
  ('personal', 'ai-analysis', 'day', null, 8, 'queue'),
  ('personal', 'ai-design', 'day', null, 2, 'queue'),
  ('organization-trial', 'ai-chat', 'trial', 250, 250, 'reject'),
  ('organization-trial', 'voice-minute', 'trial', 120, 120, 'reject'),
  ('organization-trial', 'ai-analysis', 'trial', 100, 100, 'reject'),
  ('organization-trial', 'ai-design', 'trial', 25, 25, 'reject'),
  ('organization-trial', 'photorealistic-session', 'trial', 50, 50, 'reject'),
  ('organization', 'ai-chat', 'month', null, 5000, 'queue'),
  ('organization', 'voice-minute', 'month', null, 1000, 'reject'),
  ('organization', 'ai-analysis', 'month', null, 1000, 'queue'),
  ('organization', 'ai-design', 'month', null, 250, 'queue'),
  ('organization', 'photorealistic-session', 'month', null, 1500, 'reject'),
  ('enterprise', 'ai-chat', 'contract', null, 50000, 'allow'),
  ('enterprise', 'voice-minute', 'contract', null, 10000, 'allow'),
  ('enterprise', 'ai-analysis', 'contract', null, 10000, 'allow'),
  ('enterprise', 'ai-design', 'contract', null, 2500, 'queue'),
  ('enterprise', 'photorealistic-session', 'contract', null, 15000, 'reject')
on conflict do nothing;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  plan_id text not null default 'personal' references public.plans(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  created_by uuid not null references public.profiles(id),
  plan_id text not null default 'organization-trial' references public.plans(id),
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'editor', 'viewer')),
  token_hash text not null unique,
  invited_by uuid not null references public.profiles(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  provider text not null default 'stripe' check (provider = 'stripe'),
  customer_id text unique,
  subscription_id text unique,
  price_id text,
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'paused', 'canceled', 'incomplete')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  stripe_event_created bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (organization_id is not null or owner_id is not null)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  site_entity_id text,
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  provenance jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'calculated', 'archived')),
  assumptions jsonb not null default '[]'::jsonb,
  objects jsonb not null default '[]'::jsonb,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_artifacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  scenario_id uuid references public.scenarios(id) on delete set null,
  kind text not null check (kind in ('analysis', 'scenario', 'design', 'image', 'report', 'export')),
  title text not null,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'ready', 'failed', 'superseded')),
  content jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '[]'::jsonb,
  assumptions jsonb not null default '[]'::jsonb,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (project_id, kind, version)
);

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references public.profiles(id),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.usage_balances (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('personal', 'organization')),
  subject_id uuid not null,
  kind text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  display_units numeric,
  internal_limit numeric not null check (internal_limit >= 0),
  reserved_units numeric not null default 0 check (reserved_units >= 0),
  consumed_units numeric not null default 0 check (consumed_units >= 0),
  exhausted_behavior text not null check (exhausted_behavior in ('allow', 'queue', 'reject')),
  unique (subject_type, subject_id, kind, period_start)
);

create table public.usage_reservations (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null,
  subject_type text not null check (subject_type in ('personal', 'organization')),
  subject_id uuid not null,
  actor_id uuid not null references public.profiles(id),
  kind text not null,
  balance_id uuid not null references public.usage_balances(id),
  reserved_units numeric not null check (reserved_units > 0),
  consumed_units numeric check (consumed_units is null or consumed_units >= 0),
  status text not null default 'reserved' check (status in ('reserved', 'settled', 'released')),
  release_reason text,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (subject_type, subject_id, idempotency_key)
);

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.usage_reservations(id),
  actor_id uuid not null references public.profiles(id),
  event_type text not null check (event_type in ('reserved', 'settled', 'released')),
  units numeric not null check (units >= 0),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table public.provider_cost_events (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.usage_reservations(id),
  provider text not null,
  model text,
  input_units bigint,
  output_units bigint,
  cost_micros bigint,
  latency_ms integer,
  status text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table public.stripe_events (
  event_id text primary key,
  event_type text not null,
  event_created bigint not null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

create table lumen_private.trial_claims (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  organization_id uuid unique references public.organizations(id) on delete set null,
  claimed_at timestamptz not null default now()
);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger organizations_touch before update on public.organizations for each row execute function public.touch_updated_at();
create trigger subscriptions_touch before update on public.subscriptions for each row execute function public.touch_updated_at();
create trigger workspaces_touch before update on public.workspaces for each row execute function public.touch_updated_at();
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();
create trigger scenarios_touch before update on public.scenarios for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (id, display_name)
select id, coalesce(raw_user_meta_data ->> 'display_name', split_part(email, '@', 1)) from auth.users
on conflict (id) do nothing;

create or replace function public.is_org_member(target_org uuid, target_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.organization_members where organization_id = target_org and user_id = target_user)
$$;

create or replace function public.has_org_role(target_org uuid, allowed_roles text[], target_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.organization_members where organization_id = target_org and user_id = target_user and role = any(allowed_roles))
$$;

create or replace function public.add_org_owner() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.organization_members (organization_id, user_id, role) values (new.id, new.created_by, 'owner');
  insert into lumen_private.trial_claims (user_id, organization_id) values (new.created_by, new.id);
  return new;
end $$;
create trigger organization_add_owner after insert on public.organizations for each row execute function public.add_org_owner();

create or replace function public.resolve_subject_plan(target_type text, target_id uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare selected_plan text;
begin
  if target_type = 'personal' then
    select plan_id into selected_plan from public.profiles where id = target_id;
  elsif target_type = 'organization' then
    select case
      when o.plan_id = 'organization-trial' and o.trial_ends_at > now() then o.plan_id
      when o.plan_id in ('organization', 'enterprise') and s.status in ('active', 'trialing') then o.plan_id
      else 'public'
    end into selected_plan
    from public.organizations o left join public.subscriptions s on s.organization_id = o.id
    where o.id = target_id;
  end if;
  return coalesce(selected_plan, 'public');
end $$;

create or replace function public.apply_stripe_subscription_event(
  p_event_id text,
  p_event_type text,
  p_event_created bigint,
  p_payload jsonb,
  p_organization_id uuid default null,
  p_customer_id text default null,
  p_subscription_id text default null,
  p_price_id text default null,
  p_status text default null,
  p_current_period_end timestamptz default null,
  p_cancel_at_period_end boolean default false
) returns text language plpgsql security definer set search_path = public as $$
declare inserted_event integer; applied_subscription integer;
begin
  insert into public.stripe_events (event_id, event_type, event_created, payload)
  values (p_event_id, p_event_type, p_event_created, p_payload)
  on conflict (event_id) do nothing;
  get diagnostics inserted_event = row_count;
  if inserted_event = 0 then return 'duplicate'; end if;

  if p_organization_id is not null and p_subscription_id is not null then
    insert into public.subscriptions (organization_id, customer_id, subscription_id, price_id, status, current_period_end, cancel_at_period_end, stripe_event_created)
    values (p_organization_id, p_customer_id, p_subscription_id, p_price_id, p_status, p_current_period_end, p_cancel_at_period_end, p_event_created)
    on conflict (organization_id) do update set
      customer_id = excluded.customer_id,
      subscription_id = excluded.subscription_id,
      price_id = excluded.price_id,
      status = excluded.status,
      current_period_end = excluded.current_period_end,
      cancel_at_period_end = excluded.cancel_at_period_end,
      stripe_event_created = excluded.stripe_event_created,
      updated_at = now()
    where public.subscriptions.stripe_event_created <= excluded.stripe_event_created;
    get diagnostics applied_subscription = row_count;
    if applied_subscription > 0 then
      update public.organizations set plan_id = case when p_status in ('active', 'trialing') then 'organization' else 'organization-trial' end where id = p_organization_id;
    end if;
  end if;
  return case when coalesce(applied_subscription, 1) > 0 then 'applied' else 'stale' end;
end $$;

create or replace function public.reserve_usage(
  p_subject_type text, p_subject_id uuid, p_kind text, p_units numeric, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  plan_key text;
  allowance public.plan_allowances%rowtype;
  balance public.usage_balances%rowtype;
  existing public.usage_reservations%rowtype;
  start_at timestamptz;
  end_at timestamptz;
  reservation_id uuid;
begin
  if actor is null or p_units <= 0 or length(trim(p_idempotency_key)) < 8 then
    return jsonb_build_object('status', 'rejected', 'reason', 'invalid');
  end if;
  if p_subject_type = 'personal' and p_subject_id <> actor then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_subject_type = 'organization' and not public.is_org_member(p_subject_id, actor) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into existing from public.usage_reservations
  where subject_type = p_subject_type and subject_id = p_subject_id and idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('status', 'existing', 'reservation_id', existing.id, 'reservation_status', existing.status); end if;

  plan_key := public.resolve_subject_plan(p_subject_type, p_subject_id);
  select * into allowance from public.plan_allowances where plan_id = plan_key and kind = p_kind;
  if not found then return jsonb_build_object('status', 'rejected', 'reason', 'unavailable'); end if;

  if allowance.period = 'day' then start_at := date_trunc('day', now()); end_at := start_at + interval '1 day';
  elsif allowance.period = 'month' then start_at := date_trunc('month', now()); end_at := start_at + interval '1 month';
  elsif allowance.period = 'trial' then
    select trial_started_at, trial_ends_at into start_at, end_at from public.organizations where id = p_subject_id;
  else start_at := date_trunc('year', now()); end_at := start_at + interval '1 year'; end if;

  insert into public.usage_balances (subject_type, subject_id, kind, period_start, period_end, display_units, internal_limit, exhausted_behavior)
  values (p_subject_type, p_subject_id, p_kind, start_at, end_at, allowance.display_units, allowance.internal_limit, allowance.exhausted_behavior)
  on conflict (subject_type, subject_id, kind, period_start) do nothing;

  select * into balance from public.usage_balances
  where subject_type = p_subject_type and subject_id = p_subject_id and kind = p_kind and period_start = start_at
  for update;

  if balance.reserved_units + balance.consumed_units + p_units > balance.internal_limit then
    return jsonb_build_object('status', 'rejected', 'reason', 'exhausted', 'behavior', balance.exhausted_behavior);
  end if;

  insert into public.usage_reservations (idempotency_key, subject_type, subject_id, actor_id, kind, balance_id, reserved_units)
  values (p_idempotency_key, p_subject_type, p_subject_id, actor, p_kind, balance.id, p_units)
  returning id into reservation_id;
  update public.usage_balances set reserved_units = reserved_units + p_units where id = balance.id;
  insert into public.usage_events (reservation_id, actor_id, event_type, units) values (reservation_id, actor, 'reserved', p_units);
  return jsonb_build_object('status', 'reserved', 'reservation_id', reservation_id);
end $$;

create or replace function public.settle_usage(p_reservation_id uuid, p_consumed_units numeric, p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid(); reservation public.usage_reservations%rowtype;
begin
  select * into reservation from public.usage_reservations where id = p_reservation_id for update;
  if not found then return jsonb_build_object('status', 'rejected', 'reason', 'unknown'); end if;
  if reservation.actor_id <> actor then raise exception 'not authorized' using errcode = '42501'; end if;
  if reservation.status <> 'reserved' then return jsonb_build_object('status', reservation.status, 'reservation_id', reservation.id); end if;
  if p_consumed_units < 0 or p_consumed_units > reservation.reserved_units then return jsonb_build_object('status', 'rejected', 'reason', 'invalid'); end if;
  update public.usage_balances set reserved_units = reserved_units - reservation.reserved_units, consumed_units = consumed_units + p_consumed_units where id = reservation.balance_id;
  update public.usage_reservations set status = 'settled', consumed_units = p_consumed_units, settled_at = now() where id = reservation.id;
  insert into public.usage_events (reservation_id, actor_id, event_type, units, metadata) values (reservation.id, actor, 'settled', p_consumed_units, coalesce(p_metadata, '{}'::jsonb));
  return jsonb_build_object('status', 'settled', 'reservation_id', reservation.id);
end $$;

create or replace function public.release_usage(p_reservation_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid(); reservation public.usage_reservations%rowtype;
begin
  select * into reservation from public.usage_reservations where id = p_reservation_id for update;
  if not found then return jsonb_build_object('status', 'rejected', 'reason', 'unknown'); end if;
  if reservation.actor_id <> actor then raise exception 'not authorized' using errcode = '42501'; end if;
  if reservation.status <> 'reserved' then return jsonb_build_object('status', reservation.status, 'reservation_id', reservation.id); end if;
  update public.usage_balances set reserved_units = reserved_units - reservation.reserved_units where id = reservation.balance_id;
  update public.usage_reservations set status = 'released', release_reason = left(coalesce(p_reason, 'provider failure'), 240), settled_at = now() where id = reservation.id;
  insert into public.usage_events (reservation_id, actor_id, event_type, units, metadata) values (reservation.id, actor, 'released', 0, jsonb_build_object('reason', left(coalesce(p_reason, 'provider failure'), 240)));
  return jsonb_build_object('status', 'released', 'reservation_id', reservation.id);
end $$;

alter table public.plans enable row level security;
alter table public.plan_features enable row level security;
alter table public.plan_allowances enable row level security;
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.invitations enable row level security;
alter table public.subscriptions enable row level security;
alter table public.workspaces enable row level security;
alter table public.projects enable row level security;
alter table public.scenarios enable row level security;
alter table public.project_artifacts enable row level security;
alter table public.share_links enable row level security;
alter table public.usage_balances enable row level security;
alter table public.usage_reservations enable row level security;
alter table public.usage_events enable row level security;
alter table public.audit_events enable row level security;
alter table public.provider_cost_events enable row level security;
alter table public.stripe_events enable row level security;

create policy profiles_self_select on public.profiles for select using (id = auth.uid());
create policy plans_public_select on public.plans for select using (active);
create policy plan_features_public_select on public.plan_features for select using (true);
create policy plan_allowances_authenticated_select on public.plan_allowances for select to authenticated using (true);
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy organizations_member_select on public.organizations for select using (public.is_org_member(id));
create policy organizations_create on public.organizations for insert with check (created_by = auth.uid());
create policy organizations_admin_update on public.organizations for update using (public.has_org_role(id, array['owner','admin']));
create policy members_member_select on public.organization_members for select using (public.is_org_member(organization_id));
create policy members_admin_write on public.organization_members for all using (public.has_org_role(organization_id, array['owner','admin'])) with check (public.has_org_role(organization_id, array['owner','admin']));
create policy invitations_admin_access on public.invitations for all using (public.has_org_role(organization_id, array['owner','admin'])) with check (public.has_org_role(organization_id, array['owner','admin']));
create policy subscriptions_member_select on public.subscriptions for select using (public.is_org_member(organization_id));
create policy workspaces_scope_select on public.workspaces for select using (owner_id = auth.uid() or public.is_org_member(organization_id));
create policy workspaces_scope_insert on public.workspaces for insert with check (owner_id = auth.uid() and (organization_id is null or public.has_org_role(organization_id, array['owner','admin','editor'])));
create policy workspaces_scope_update on public.workspaces for update using (owner_id = auth.uid() or public.has_org_role(organization_id, array['owner','admin','editor']));
create policy projects_scope_select on public.projects for select using (owner_id = auth.uid() or public.is_org_member(organization_id));
create policy projects_scope_insert on public.projects for insert with check (owner_id = auth.uid() and (organization_id is null or public.has_org_role(organization_id, array['owner','admin','editor'])));
create policy projects_scope_update on public.projects for update using (owner_id = auth.uid() or public.has_org_role(organization_id, array['owner','admin','editor']));
create policy scenarios_project_select on public.scenarios for select using (exists(select 1 from public.projects p where p.id = project_id and (p.owner_id = auth.uid() or public.is_org_member(p.organization_id))));
create policy scenarios_project_write on public.scenarios for all using (exists(select 1 from public.projects p where p.id = project_id and (p.owner_id = auth.uid() or public.has_org_role(p.organization_id, array['owner','admin','editor'])))) with check (created_by = auth.uid());
create policy artifacts_project_select on public.project_artifacts for select using (exists(select 1 from public.projects p where p.id = project_id and (p.owner_id = auth.uid() or public.is_org_member(p.organization_id))));
create policy artifacts_project_write on public.project_artifacts for all using (exists(select 1 from public.projects p where p.id = project_id and (p.owner_id = auth.uid() or public.has_org_role(p.organization_id, array['owner','admin','editor'])))) with check (created_by = auth.uid());
create policy share_links_owner_select on public.share_links for select using (exists(select 1 from public.projects p where p.id = project_id and (p.owner_id = auth.uid() or public.is_org_member(p.organization_id))));
create policy share_links_owner_write on public.share_links for all using (exists(select 1 from public.projects p where p.id = project_id and (p.owner_id = auth.uid() or public.has_org_role(p.organization_id, array['owner','admin'])))) with check (created_by = auth.uid());
create policy usage_balance_subject_select on public.usage_balances for select using ((subject_type = 'personal' and subject_id = auth.uid()) or (subject_type = 'organization' and public.is_org_member(subject_id)));
create policy usage_reservation_subject_select on public.usage_reservations for select using ((subject_type = 'personal' and subject_id = auth.uid()) or (subject_type = 'organization' and public.is_org_member(subject_id)));
create policy usage_event_subject_select on public.usage_events for select using (exists(select 1 from public.usage_reservations r where r.id = reservation_id and ((r.subject_type = 'personal' and r.subject_id = auth.uid()) or (r.subject_type = 'organization' and public.is_org_member(r.subject_id)))));
create policy audit_org_select on public.audit_events for select using (public.is_org_member(organization_id));

revoke all on function public.reserve_usage(text, uuid, text, numeric, text) from public;
revoke all on function public.settle_usage(uuid, numeric, jsonb) from public;
revoke all on function public.release_usage(uuid, text) from public;
grant execute on function public.reserve_usage(text, uuid, text, numeric, text) to authenticated;
grant execute on function public.settle_usage(uuid, numeric, jsonb) to authenticated;
grant execute on function public.release_usage(uuid, text) to authenticated;
revoke all on function public.apply_stripe_subscription_event(text, text, bigint, jsonb, uuid, text, text, text, text, timestamptz, boolean) from public;
grant execute on function public.apply_stripe_subscription_event(text, text, bigint, jsonb, uuid, text, text, text, text, timestamptz, boolean) to service_role;
