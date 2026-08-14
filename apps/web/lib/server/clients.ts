import "server-only";
import { GroqClient, type GroqClientOptions } from "@finaltab/vision";
import { KeeperHubClient, KeeperHubError } from "@finaltab/keeperhub";

/** Server-side Groq client, or null when GROQ_API_KEY is not configured. */
export function groqClient(options: Pick<GroqClientOptions, "maxCompletionTokens" | "timeoutMs"> = {}): GroqClient | null {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  return new GroqClient({ apiKey, ...options });
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

/**
 * KeeperHubError.message is only the shape of the call ("POST /x -> 400"). The
 * reason lives in the upstream JSON body, and dropping it leaves an operator
 * staring at a bare status code with nothing to act on. Append whatever the
 * gateway actually said.
 *
 * The body is a validation/rejection message from KeeperHub — it carries no
 * credential material, so it is safe to return to the caller.
 */
export function keeperHubDetail(e: KeeperHubError): string {
  const b = e.body;
  if (!b) return e.message;
  const reason = [b.error, b.message, b.code].filter(Boolean).join(" — ");
  return reason ? `${e.message}: ${reason}` : `${e.message}: ${JSON.stringify(b).slice(0, 500)}`;
}
