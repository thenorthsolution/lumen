# Lumen Cloud Foundation

Status: first open-core cloud slice, 10 September 2026.

## Product boundary

Lumen's public viewer remains available without an account or environment variables. A personal account adds private projects and fair-use AI. Organization trials and paid organizations add shared context and guaranteed capacity. Exact euro pricing is intentionally absent until provider telemetry has been collected with design partners.

This repository contains the portable contracts and reference adapters. Managed prompts, evaluation sets, operational policy, private connectors and enterprise deployment belong in a separate private `lumen-cloud` repository. That repository has not been created from this workspace.

## Implemented foundation

- `@lumen/world` exports plan, entitlement, usage, action-risk, artifact, and AI-provider contracts.
- Supabase migration `202609100001_lumen_cloud_foundation.sql` creates the organization/project model, RLS, 14-day trials, one-trial-per-user enforcement, append-only usage events, private provider cost rows and atomic usage reservation/settlement.
- Email magic-link authentication uses Supabase SSR cookies and keeps the main world public.
- Personal project saving is limited to ten active projects. Organization projects use the same endpoint and RLS boundary.
- Stripe Checkout and Portal endpoints accept only server-configured pricing. Signed webhook events are recorded and applied idempotently; stale subscription events cannot overwrite newer state.
- AI requests require an authenticated `core-ai` entitlement, reserve usage before streaming through AI Gateway, tag requests by user/plan, and settle or release usage after the stream outcome. A strictly local development bypass works without Auth or Supabase, but only outside Vercel and only while Gateway credentials are present.
- Dutch push-to-talk records at most 60 seconds, transcribes through AI Gateway and submits the transcript through the same validated chat/tool path.
- The 3D adapter uses the open Dutch 3D Basisvoorziening and requires no paid map-provider credential.

## Configuration

Copy `apps/lumen/.env.example` to `.env.local`. The public viewer needs none of these values.

1. Create a Supabase project and apply the migration.
2. Configure Site URL and redirect URLs, then change the email template to use `/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
3. Enable Vercel AI Gateway. Chat and transcription model IDs plus operational limits live in typed `config/lumen.ts`; deployments use OIDC and local development may use an AI Gateway key or an OIDC token obtained through the Vercel CLI.
4. Create one organization subscription price in Stripe and register `/api/billing/webhook` for subscription create, update and delete events.

## Security and operational invariants

- Service and Stripe secrets are server-only. The publishable Supabase key is safe only in combination with the included RLS policies.

## Database permission verification

Run `pnpm test:db` against the local Supabase stack. The pgTAP suite verifies the effective row access for anonymous visitors, personal accounts, organization viewers/editors, government/enterprise organizations and unrelated authenticated users.

New public-schema tables are not exposed automatically. Every table needs both an explicit grant and RLS policy. Tenant authorization uses `auth.uid()` and membership rows; user-editable `user_metadata` is never an authorization source. Public `SECURITY DEFINER` membership helpers reject attempts to inspect another user and expose execution only to the authenticated database role.
- New projects are private. Sharing requires a future explicit, revocable share-link action.
- Client state never grants entitlements and cannot select a Stripe price.
- Provider operations reserve usage under an idempotency key before execution. Failed or aborted work releases the reservation.
- Public map sources must follow their published cache, attribution, and redistribution conditions.
- AI calculation claims must come from deterministic tools and retain assumptions, confidence, source and method version.

## Deliberately pending

- The separate private cloud repository and deployment pipeline.
- Invitation acceptance, live collaboration, comments and share-link UI.
- Durable AI conversation storage and automatic artifact creation.
- Heavy queued analysis/design workers, realtime conversational voice, image generation and enterprise BYOK. Push-to-talk transcription is available now.
- Final pricing, overages and public quota display.
- National open tile/LOD production, photogrammetry acquisition and GeoSplats pilots.

These are subsequent delivery slices, not simulated capabilities. Current unavailable states remain truthful in the product.
