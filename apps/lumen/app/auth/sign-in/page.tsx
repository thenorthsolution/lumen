import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { getCloudConfiguration } from "@/lib/cloud/config";

export default function SignInPage() {
  const configured = getCloudConfiguration().supabase;
  return <main className="authPage"><section className="authCard"><Link className="authBrand" href="/"><span>L</span> LUMEN</Link><p className="eyebrow">PERSOONLIJKE WERKRUIMTE</p><h1>Aanmelden</h1><p>Bewaar projecten en gebruik Lumen AI. Publiek browsen blijft beschikbaar zonder account.</p>{configured ? <AuthForm /> : <div className="authNotice"><strong>Lokale open-core modus</strong><span>Voeg Supabase-variabelen toe om accounts te activeren.</span></div>}<Link className="authBack" href="/">Terug naar de wereld</Link></section></main>;
}

