import "server-only";
import { GroqClient } from "@finaltab/vision";
import { KeeperHubClient } from "@finaltab/keeperhub";

/** Server-side Groq client, or null when GROQ_API_KEY is not configured. */
export function groqClient(): GroqClient | null {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  return new GroqClient({ apiKey });
}

/**
 * Server-side KeeperHub client, or null when KEEPERHUB_API_KEY is not
 * configured. A wfb_ user key cannot execute — surface that honestly instead
 * of failing later with a confusing 401.
 */
export function keeperHubClient(): { client: KeeperHubClient | null; blockedReason: string | null } {
  const apiKey = process.env.KEEPERHUB_API_KEY;
  if (!apiKey) {
    return { client: null, blockedReason: "KEEPERHUB_API_KEY is not configured on the server." };
  }
  if (!apiKey.startsWith("kh_")) {
    return {
      client: null,
      blockedReason:
        "Configured KeeperHub key is not an organisation key (kh_ prefix). Direct execution requires an org key: Settings > API Keys > Organisation tab.",
    };
  }
  return { client: new KeeperHubClient({ apiKey }), blockedReason: null };
}

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}
