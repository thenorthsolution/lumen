import "server-only";

import { personalPlan, publicPlan, type EntitlementFeature, type EntitlementSnapshot, type UsageKind } from "@lumen/world";
import { createClient } from "@/lib/supabase/server";

export interface CloudIdentity {
  configured: boolean;
  user: null | { id: string; email: string | null; displayName: string; initials: string };
  organization: null | { id: string; name: string; role: "owner" | "admin" | "editor" | "viewer" };
  entitlements: EntitlementSnapshot;
}

const publicSnapshot = (): EntitlementSnapshot => ({
  subject: { type: "anonymous" },
  plan: { id: publicPlan.id, tier: publicPlan.tier, label: publicPlan.label },
  features: publicPlan.features,
  projectLimit: publicPlan.projectLimit,
  seatLimit: publicPlan.seatLimit,
  usage: [],
});

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "LU";
}

export async function getCloudIdentity(preferredOrganizationId?: string): Promise<CloudIdentity> {
  const supabase = await createClient();
  if (!supabase) return { configured: false, user: null, organization: null, entitlements: publicSnapshot() };
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return { configured: true, user: null, organization: null, entitlements: publicSnapshot() };

  const userId = authData.user.id;
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("display_name, plan_id").eq("id", userId).maybeSingle(),
    supabase.from("organization_members").select("organization_id, role").eq("user_id", userId),
  ]);
  const selectedMembership = memberships?.find((membership) => membership.organization_id === preferredOrganizationId) ?? memberships?.[0] ?? null;
  const displayName = profile?.display_name || authData.user.email?.split("@")[0] || "Lumen gebruiker";
  const user = { id: userId, email: authData.user.email ?? null, displayName, initials: initials(displayName) };

  let planId = profile?.plan_id ?? "personal";
  let organization: CloudIdentity["organization"] = null;
  let trialEndsAt: string | undefined;
  if (selectedMembership) {
    const { data: org } = await supabase.from("organizations").select("id, name, plan_id, trial_ends_at").eq("id", selectedMembership.organization_id).maybeSingle();
    if (org) {
      const trialActive = org.plan_id !== "organization-trial" || Date.parse(org.trial_ends_at) > Date.now();
      planId = trialActive ? org.plan_id : "public";
      trialEndsAt = org.plan_id === "organization-trial" ? org.trial_ends_at : undefined;
      organization = { id: org.id, name: org.name, role: selectedMembership.role };
    }
  }

  const [{ data: plan }, { data: featureRows }, { data: allowanceRows }, { data: balances }] = await Promise.all([
    supabase.from("plans").select("id, label, tier, project_limit, seat_limit").eq("id", planId).maybeSingle(),
    supabase.from("plan_features").select("feature").eq("plan_id", planId),
    supabase.from("plan_allowances").select("kind, display_units, exhausted_behavior").eq("plan_id", planId),
    supabase.from("usage_balances").select("kind, display_units, reserved_units, consumed_units, period_end").eq("subject_id", organization?.id ?? userId).gt("period_end", new Date().toISOString()),
  ]);

  const fallbackPlan = organization ? publicPlan : personalPlan;
  const usage = (allowanceRows ?? []).map((allowance) => {
    const balance = balances?.find((candidate) => candidate.kind === allowance.kind);
    return {
      kind: allowance.kind as UsageKind,
      granted: allowance.display_units === null ? null : Number(allowance.display_units),
      reserved: Number(balance?.reserved_units ?? 0),
      consumed: Number(balance?.consumed_units ?? 0),
      ...(balance?.period_end ? { resetsAt: balance.period_end } : {}),
      behavior: allowance.exhausted_behavior as "allow" | "queue" | "reject",
    };
  });
  return {
    configured: true,
    user,
    organization,
    entitlements: {
      subject: organization ? { type: "organization", id: organization.id } : { type: "personal", id: userId },
      plan: plan ? { id: plan.id, tier: plan.tier, label: plan.label } : { id: fallbackPlan.id, tier: fallbackPlan.tier, label: fallbackPlan.label },
      features: (featureRows?.map((row) => row.feature) ?? fallbackPlan.features) as EntitlementFeature[],
      projectLimit: plan?.project_limit ?? fallbackPlan.projectLimit,
      seatLimit: plan?.seat_limit ?? fallbackPlan.seatLimit,
      ...(trialEndsAt ? { trialEndsAt } : {}),
      usage,
    },
  };
}

