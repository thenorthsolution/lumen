import "server-only";

import type { UsageKind } from "@lumen/world";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface UsageSubject { type: "personal" | "organization"; id: string }

export async function reserveUsage(subject: UsageSubject, kind: UsageKind, units: number, idempotencyKey: string) {
  const supabase = await createClient();
  if (!supabase) return { status: "rejected", reason: "unavailable" } as const;
  const { data, error } = await supabase.rpc("reserve_usage", {
    p_subject_type: subject.type,
    p_subject_id: subject.id,
    p_kind: kind,
    p_units: units,
    p_idempotency_key: idempotencyKey,
  });
  if (error) return { status: "rejected", reason: "unavailable", message: error.message } as const;
  return data as { status: "reserved" | "existing" | "rejected"; reservation_id?: string; reason?: string; behavior?: string };
}

export async function settleUsage(reservationId: string, units: number, metadata: Record<string, unknown> = {}) {
  const supabase = await createClient();
  if (!supabase) return;
  await supabase.rpc("settle_usage", { p_reservation_id: reservationId, p_consumed_units: units, p_metadata: metadata });
}

export async function releaseUsage(reservationId: string, reason: string) {
  const supabase = await createClient();
  if (!supabase) return;
  await supabase.rpc("release_usage", { p_reservation_id: reservationId, p_reason: reason });
}

export async function recordProviderCost(input: {
  reservationId: string;
  provider: string;
  model?: string;
  inputUnits?: number;
  outputUnits?: number;
  latencyMs?: number;
  status: string;
}) {
  const service = createServiceClient();
  if (!service) return;
  await service.from("provider_cost_events").insert({
    reservation_id: input.reservationId,
    provider: input.provider,
    model: input.model,
    input_units: input.inputUnits,
    output_units: input.outputUnits,
    latency_ms: input.latencyMs,
    status: input.status,
  });
}
