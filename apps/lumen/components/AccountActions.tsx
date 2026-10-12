"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@lumen/ui/components/button";
import { Input } from "@lumen/ui/components/input";

export function OrganizationForm() {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage("Organisatie aanmaken");
    const response = await fetch("/api/organizations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setMessage(result.error ?? "Organisatie kon niet worden aangemaakt."); return; }
    window.location.reload();
  }
  return <form className="accountAction" onSubmit={submit}><Input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} placeholder="Naam van de organisatie" required /><Button type="submit">Start organisatieproef</Button>{message ? <small role="status">{message}</small> : null}</form>;
}

export function BillingButton({ organizationId, portal = false }: { organizationId: string; portal?: boolean }) {
  const [message, setMessage] = useState("");
  async function openBilling() {
    setMessage("Voorbereiden");
    const response = await fetch(portal ? "/api/billing/portal" : "/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId }) });
    const result = await response.json() as { url?: string; error?: string };
    if (!response.ok || !result.url) { setMessage(result.error ?? "Facturatie is nog niet beschikbaar."); return; }
    window.location.assign(result.url);
  }
  return <div className="accountAction"><Button onClick={openBilling}>{portal ? "Beheer abonnement" : "Activeer organisatie"}</Button>{message ? <small role="status">{message}</small> : null}</div>;
}

