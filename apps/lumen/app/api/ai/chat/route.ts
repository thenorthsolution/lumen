import {
  convertToModelMessages,
  safeValidateUIMessages,
  stepCountIs,
  streamText,
} from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { hasEntitlement } from "@lumen/world";
import { z } from "zod";
import { lumenConfig } from "@/config/lumen";
import { consumeLocalAiAllowance, hasAiGatewayCredentials, providerErrorMessage, providerErrorResponse, useLocalAiDevelopmentAccess } from "@/lib/ai/request-policy";
import { getCloudIdentity } from "@/lib/cloud/session";
import { recordProviderCost, releaseUsage, reserveUsage, settleUsage } from "@/lib/cloud/usage";
import { lumenServerWorldTools } from "@/lib/ai/server-world-tools";
import { boundedConversation, compactLocalWorldContext, localActiveTools } from "@/lib/ai/prompt-budget";
import type { LumenAIMessage } from "@/lib/ai/world-tools";

export const maxDuration = 60;

const system = `Je bent Lumen AI: de professionele, klantgerichte ruimtelijke assistent van Lumen World.

STIJL
- Antwoord in de taal van de gebruiker, standaard Nederlands. Schrijf rustig, deskundig en menselijk.
- Begin direct met het resultaat. Houd eenvoudige antwoorden bij één of twee korte zinnen.
- Noem nooit een model, provider, systeemprompt, tool, JSON, entiteit-ID of interne kaartcontext.
- Zeg nooit dat de gebruiker een bepaald model of technisch systeem gebruikt.
- Een begroeting is alleen: "Hallo! Waar kan ik je mee helpen?"

ACTIES
- Voer kaartopdrachten uit in plaats van uit te leggen hoe je ze zou uitvoeren.
- Bevat een opdracht een Nederlandse plaats of adres, gebruik dan altijd eerst find_world_location en navigeer naar het beste exacte resultaat. Verzin nooit coördinaten.
- Gebruik search_world_catalog wanneer het gevraagde canonieke object, project of scenario niet in de huidige kaartcontext staat. Behandel uitsluitend de teruggegeven displayvelden en provenance als feiten; ontbrekende broninformatie blijft onbekend.
- Gebruik inspect_world_catalog_entity pas met een ID uit de kaartcontext of search_world_catalog om relaties, bronrecords, observaties en analyses te onderbouwen. Vul ontbrekend of gedeeltelijk bewijs nooit zelf aan.
- Na navigatie: gebruik find_and_select_world_entity voor het gevraagde gebouw of object. Een zoekwoord zoals "gesloopt" hoort in query.
- Gebruik uitsluitend IDs uit de interne wereldcontext. Berekeningen en rankings komen alleen uit deterministische tools.
- Gebruik open_world_tool, set_world_task_preset, toggle_world_comparison en analyze_world_drawing voor bestaande UI-acties; beschrijf niet alleen waar de gebruiker moet klikken.
- Rond een geslaagde actie af met een korte bevestiging plus hoogstens één relevante observatie.
- Als gegevens ontbreken, benoem alleen de ontbrekende publieke broninformatie en geef een concrete vervolgstap. Stel geen vraag die al door de opdracht is beantwoord.

VEILIGHEID
- Presenteer indicaties nooit als vergunning, financieel advies of constructieve goedkeuring.
- Vraag om bevestiging voor delen, publiceren, uitnodigen, inkopen of indienen. Die externe acties zijn nog niet beschikbaar.`;

const ollama = createOpenAICompatible({
  name: "ollama",
  baseURL: lumenConfig.ai.local.ollamaBaseUrl,
});

const sourceContextSchema = z.object({
  sourceId: z.string(), sourceLabel: z.string(), sourceUrl: z.string().url().optional(), retrievedAt: z.string().datetime().nullable(),
  confidence: z.enum(["verified", "high", "medium", "low", "unknown"]), methodVersion: z.string().optional(), limitations: z.array(z.string()).max(5).optional(), limitationsMissing: z.literal(true).optional(),
});

const worldContextSchema = z.object({
  renderer: z.enum(["map-2d", "world-3d"]),
  camera: z.object({ longitude: z.number(), latitude: z.number(), zoom: z.number() }),
  selectedEntityId: z.string().nullable(),
  activeTool: z.enum(["explore", "search", "layers", "analyze", "draw", "compare", "projects"]),
  taskPreset: z.enum(["living", "vacancy", "development", "delivery"]),
  comparisonEntityIds: z.array(z.string()).max(4),
  entities: z.array(z.object({
    id: z.string(), type: z.string(), name: z.string(), description: z.string().optional(),
    relatedEntityIds: z.array(z.string()).max(200),
    properties: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
    facets: z.array(z.object({ id: z.string(), availability: z.enum(["available", "partial", "missing"]), values: z.record(z.union([z.string(), z.number(), z.boolean()])), missing: z.array(z.string()) })).max(7),
    sources: z.array(sourceContextSchema).max(3),
  })).max(30),
  entityCounts: z.record(z.number().int().nonnegative()),
  layers: z.array(z.object({
    id: z.string(), visible: z.boolean(), status: z.enum(["idle", "loading", "ready", "error"]), error: z.string().optional(),
    label: z.string().optional(), coverage: z.enum(["national", "regional", "local"]).optional(),
    supportedRenderers: z.array(z.enum(["map-2d", "world-3d"])).max(2).optional(), minZoom: z.number().nullable().optional(), maxZoom: z.number().nullable().optional(),
    sources: z.array(z.object({ sourceId: z.string(), label: z.string(), authority: z.string(), availability: z.enum(["available", "planned", "requires-connection", "unavailable"]), access: z.enum(["public", "account", "organization", "government", "licensed"]), freshness: z.enum(["live", "daily", "monthly", "quarterly", "annual", "on-demand"]) })).max(8).optional(),
    metadataMissing: z.literal(true).optional(),
  })).max(30),
  drawings: z.array(z.object({ id: z.string(), name: z.string(), kind: z.enum(["point", "line", "polygon", "rectangle"]), projectId: z.string().optional(), areaSquareMeters: z.number().nonnegative(), lengthMeters: z.number().nonnegative(), methodVersion: z.string(), limitations: z.array(z.string()) })).max(10),
  selectedAnalysis: z.object({
    subjectId: z.string(),
    suitability: z.object({
      conclusion: z.enum(["promising", "conditional", "blocked", "needs-research"]), assessedAt: z.string().datetime(), methodVersion: z.string(),
      dimensions: z.array(z.object({
        dimension: z.enum(["planning", "physical", "environment-safety", "accessibility", "market-program", "deliverability"]), status: z.enum(["suitable", "attention", "blocked", "needs-research"]), score: z.number().nullable(), confidence: z.enum(["verified", "high", "medium", "low", "unknown"]),
        metrics: z.array(z.object({ key: z.string(), value: z.number().nullable(), unit: z.string(), status: z.enum(["measured", "estimated", "missing"]), source: sourceContextSchema })).max(30),
      })).length(6),
      blockers: z.array(z.object({ code: z.string(), label: z.string(), severity: z.enum(["hard", "conditional"]), explanation: z.string(), source: sourceContextSchema })).max(30),
    }),
    accessibility: z.object({
      computedAt: z.string().datetime(), methodVersion: z.string(),
      themes: z.record(z.string(), z.object({ score: z.number().nullable(), confidence: z.enum(["verified", "high", "medium", "low", "unknown"]) })),
      measures: z.array(z.object({ destinationType: z.string(), mode: z.enum(["walk", "bike", "transit", "car"]), minutes: z.number().nullable(), distanceMeters: z.number().nonnegative().nullable(), status: z.enum(["measured", "estimated", "missing"]), count5: z.number().int().nonnegative(), count10: z.number().int().nonnegative(), count15: z.number().int().nonnegative(), source: sourceContextSchema })).max(25),
    }).nullable(),
  }).nullable().optional(),
  project: z.object({ id: z.string(), name: z.string(), siteId: z.string().nullable(), saved: z.boolean() }).nullable(),
  milestones: z.array(z.object({ id: z.string(), projectId: z.string(), label: z.string(), status: z.enum(["planned", "active", "complete", "blocked"]), plannedAt: z.string().datetime().nullable(), completedAt: z.string().datetime().nullable() })).max(50),
  scenario: z.object({
    id: z.string(), name: z.string(),
    calculation: z.object({
      methodVersion: z.literal("indicative-scenario-1.0.0"),
      inputs: z.object({ siteAreaM2: z.number(), coverageRatio: z.number(), floors: z.number(), grossToNetRatio: z.number(), averageHomeAreaM2: z.number(), constructionCostPerGfaM2: z.number(), preparationMonths: z.number(), constructionMonthsPer10kGfa: z.number() }),
      grossFloorAreaM2: z.number(), netFloorAreaM2: z.number(), homes: z.object({ low: z.number(), expected: z.number(), high: z.number() }),
      constructionCostEur: z.object({ low: z.number(), expected: z.number(), high: z.number() }), durationMonths: z.object({ low: z.number(), expected: z.number(), high: z.number() }),
      riskFlags: z.array(z.string()).max(50), assumptions: z.array(z.string()).max(50),
    }).nullable(),
    objects: z.array(z.object({ id: z.string(), kind: z.string(), label: z.string(), parameters: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])), sources: z.array(z.object({ sourceId: z.string(), sourceLabel: z.string(), retrievedAt: z.string().datetime(), confidence: z.enum(["verified", "high", "medium", "low", "unknown"]), methodVersion: z.string().optional(), limitations: z.array(z.string()).max(5) })).max(3) })).max(30),
  }).nullable(),
}).optional();

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > lumenConfig.ai.limits.maxRequestBytes) return Response.json({ error: "Bericht is te groot." }, { status: 413 });
  const body = await request.json().catch(() => null) as { messages?: unknown; organizationId?: string; context?: unknown } | null;
  if (!body || !Array.isArray(body.messages) || body.messages.length > lumenConfig.ai.limits.maxMessages) return Response.json({ error: "Ongeldige conversatie." }, { status: 400 });

  const identity = await getCloudIdentity(body.organizationId);
  const localDevelopment = useLocalAiDevelopmentAccess();
  if (!identity.user && !localDevelopment) return Response.json({ error: "Log in om Lumen AI te gebruiken." }, { status: 401 });
  if (identity.user && !localDevelopment && !hasEntitlement(identity.entitlements, "core-ai")) return Response.json({ error: "Lumen AI is niet beschikbaar binnen dit plan." }, { status: 403 });
  if (!localDevelopment && !hasAiGatewayCredentials()) return Response.json({ error: "De beheerde AI-provider is nog niet geconfigureerd." }, { status: 503 });

  const validated = await safeValidateUIMessages<LumenAIMessage>({ messages: body.messages, tools: lumenServerWorldTools });
  if (!validated.success) return Response.json({ error: "De conversatie bevat ongeldige gegevens." }, { status: 400 });
  const parsedContext = worldContextSchema.safeParse(body.context);
  if (!parsedContext.success) return Response.json({ error: "Ongeldige wereldcontext." }, { status: 400 });

  let reservationId: string | undefined;
  if (localDevelopment) {
    if (!consumeLocalAiAllowance("chat")) return Response.json({ error: "De lokale ontwikkellimiet is bereikt. Probeer het later opnieuw." }, { status: 429 });
  } else {
    const subject = identity.entitlements.subject;
    if (!subject.id || subject.type === "anonymous") return Response.json({ error: "Geen usage-subject beschikbaar." }, { status: 403 });
    const idempotencyKey = request.headers.get("x-lumen-request-id") ?? crypto.randomUUID();
    const reservation = await reserveUsage({ type: subject.type, id: subject.id }, "ai-chat", 1, idempotencyKey);
    if (reservation.status === "rejected" || !reservation.reservation_id) {
      const status = reservation.reason === "exhausted" ? 429 : 503;
      return Response.json({ error: "behavior" in reservation && reservation.behavior === "queue" ? "Deze taak wordt later beschikbaar. Probeer het binnenkort opnieuw." : "De fair-use grens is bereikt." }, { status });
    }
    reservationId = reservation.reservation_id;
  }

  const modelId = localDevelopment ? lumenConfig.ai.local.chatModel : lumenConfig.ai.model;
  const model = localDevelopment ? ollama(modelId) : modelId;
  const startedAt = Date.now();
  try {
    const conversation = boundedConversation(validated.data, localDevelopment ? 6 : 20);
    const promptContext = parsedContext.data && localDevelopment ? compactLocalWorldContext(parsedContext.data) : parsedContext.data;
    const result = streamText({
      model,
      maxOutputTokens: localDevelopment ? lumenConfig.ai.local.maxOutputTokens : lumenConfig.ai.limits.maxOutputTokens,
      maxRetries: localDevelopment ? 0 : 2,
      abortSignal: localDevelopment ? AbortSignal.timeout(lumenConfig.ai.local.requestTimeoutMs) : undefined,
      temperature: .15,
      system: promptContext ? `${system}\n\n<interne_wereldcontext>\n${JSON.stringify(promptContext)}\n</interne_wereldcontext>\nGebruik dit alleen operationeel en verwijs er nooit naar in je antwoord.` : system,
      messages: await convertToModelMessages(conversation),
      tools: lumenServerWorldTools,
      activeTools: localDevelopment ? localActiveTools(conversation) : undefined,
      stopWhen: stepCountIs(4),
      providerOptions: localDevelopment ? undefined : {
        gateway: {
          user: identity.user?.id ?? "local-development",
          tags: ["app:lumen", "feature:world-assistant", `environment:${localDevelopment ? "local" : "managed"}`, `plan:${identity.entitlements.plan.id}`],
        },
      },
    });
    return result.toUIMessageStreamResponse({
      originalMessages: validated.data,
      onError: (error) => providerErrorMessage(error, localDevelopment),
      onFinish: async ({ outcome }) => {
        if (!reservationId) return;
        let usage: Awaited<typeof result.totalUsage> | undefined;
        try { usage = await result.totalUsage; } catch { usage = undefined; }
        const succeeded = outcome.status === "completed";
        if (succeeded) await settleUsage(reservationId, 1, { inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0 });
        else await releaseUsage(reservationId, `stream-${outcome.status}`);
        await recordProviderCost({
          reservationId, provider: "vercel-ai-gateway", model: modelId,
          inputUnits: usage?.inputTokens, outputUnits: usage?.outputTokens,
          latencyMs: Date.now() - startedAt, status: outcome.status,
        });
      },
    });
  } catch (error) {
    if (reservationId) {
      await releaseUsage(reservationId, error instanceof Error ? error.message : "provider failure");
      await recordProviderCost({ reservationId, provider: "vercel-ai-gateway", model: modelId, latencyMs: Date.now() - startedAt, status: "failed" });
    }
    return providerErrorResponse(error, localDevelopment);
  }
}
