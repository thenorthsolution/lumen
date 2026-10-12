import { lumenConfig } from "@/config/lumen";

export interface CloudConfiguration {
  supabase: boolean;
  aiGateway: boolean;
  aiDevelopmentAccess: boolean;
  stripe: boolean;
}

export function getCloudConfiguration(): CloudConfiguration {
  const aiDevelopmentAccess = lumenConfig.ai.allowLocalDevelopmentAccess
    && process.env.NODE_ENV === "development"
    && !process.env.VERCEL;
  return {
    supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    aiGateway: lumenConfig.ai.enabled && (aiDevelopmentAccess || Boolean(process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY)),
    aiDevelopmentAccess,
    stripe: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_ORGANIZATION_PRICE_ID),
  };
}

export function getSupabasePublicConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && publishableKey ? { url, publishableKey } : null;
}
