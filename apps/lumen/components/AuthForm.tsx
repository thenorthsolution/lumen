"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@lumen/ui/components/button";
import { Input } from "@lumen/ui/components/input";
import { createClient } from "@/lib/supabase/client";

export function AuthForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const supabase = createClient();
    if (!supabase) { setStatus("error"); setMessage("Supabase is nog niet geconfigureerd."); return; }
    setStatus("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm?next=/account` },
    });
    if (error) { setStatus("error"); setMessage(error.message); return; }
    setStatus("sent");
    setMessage("Controleer je e-mail. De aanmeldlink verloopt automatisch.");
  }

  return (
    <form className="authForm" onSubmit={submit}>
      <label htmlFor="email">E-mailadres</label>
      <Input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="naam@organisatie.nl" />
      <Button type="submit" disabled={status === "sending" || status === "sent"}>{status === "sending" ? "Link versturen" : status === "sent" ? "Link verstuurd" : "Aanmelden met e-mail"}</Button>
      {message ? <p className={`authMessage ${status}`} role="status">{message}</p> : null}
    </form>
  );
}

