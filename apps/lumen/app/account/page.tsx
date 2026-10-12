import Link from "next/link";
import { redirect } from "next/navigation";
import { BillingButton, OrganizationForm } from "@/components/AccountActions";
import { getCloudIdentity } from "@/lib/cloud/session";

export default async function AccountPage() {
  const identity = await getCloudIdentity();
  if (!identity.configured || !identity.user) redirect("/auth/sign-in");
  return <main className="accountPage"><header><Link className="authBrand" href="/"><span>L</span> LUMEN</Link><form action="/auth/sign-out" method="post"><button type="submit">Afmelden</button></form></header><section className="accountGrid"><article className="accountCard"><p className="eyebrow">ACCOUNT</p><h1>{identity.user.displayName}</h1><p>{identity.user.email}</p><dl><div><dt>Plan</dt><dd>{identity.entitlements.plan.label}</dd></div><div><dt>Projecten</dt><dd>{identity.entitlements.projectLimit === null ? "Geen vaste limiet" : `Maximaal ${identity.entitlements.projectLimit}`}</dd></div><div><dt>Lumen AI</dt><dd>{identity.entitlements.features.includes("core-ai") ? "Fair use actief" : "Niet beschikbaar"}</dd></div></dl></article><article className="accountCard"><p className="eyebrow">ORGANISATIE</p>{identity.organization ? <><h2>{identity.organization.name}</h2><p>{identity.organization.role} · {identity.entitlements.plan.label}</p>{identity.entitlements.trialEndsAt ? <p>Proefperiode tot {new Date(identity.entitlements.trialEndsAt).toLocaleDateString("nl-NL")}</p> : null}<BillingButton organizationId={identity.organization.id} /></> : <><h2>Samenwerken</h2><p>Start een proefperiode van 14 dagen voor gedeelde projecten, fotorealistische 3D en gegarandeerde capaciteit.</p><OrganizationForm /></>}</article></section></main>;
}

