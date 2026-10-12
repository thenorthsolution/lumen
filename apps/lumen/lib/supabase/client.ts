import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicConfiguration } from "@/lib/cloud/config";

export function createClient() {
  const configuration = getSupabasePublicConfiguration();
  if (!configuration) return null;
  return createBrowserClient(configuration.url, configuration.publishableKey);
}

