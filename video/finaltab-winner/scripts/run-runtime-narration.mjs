import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadRuntimeNarrationCapability,
  loadRuntimeNarrationToken,
  quotaSummary,
  readBoundedRuntimeAudio,
  reconcileRuntimeNarrationArtifacts,
  RUNTIME_NARRATION_CONTRACT,
  RuntimeNarrationSafeStop,
  verifyRuntimeAudioResponse,
} from "./runtime-narration-runner-lib.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const repoDir = path.resolve(projectDir, "../..");
const paths = {
  bearerCredentialPath: path.join(repoDir, "proof-output", "finaltab-mcp-token.local.json"),
  operatorCredentialPath: path.join(repoDir, "proof-output", "finaltab-v3-narration-operator-token.local.json"),
  audioPath: path.join(projectDir, "assets", "audio", "voice-v3", "finaltab-v3-george-provider-response.mp3"),
  ledgerPath: path.join(projectDir, "data", "narration-generation-ledger.json"),
  manifestPath: path.join(projectDir, "data", "voiceover-manifest.json"),
  receiptPath: path.join(repoDir, "proof-output", "finaltab-v3-narration-runtime-receipt.json"),
};

const args = new Set(process.argv.slice(2));
const known = new Set([
  "--preflight",
  "--generate",
  "--acknowledge-one-no-charge-subscription-get",
  "--acknowledge-one-provider-call",
]);

async function parseSafeJson(response) {
  try {
    const body = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new RuntimeNarrationSafeStop("RUNTIME_RESPONSE_INVALID");
  }
}

async function runtimeRequest(mode, bearerToken, operatorCapability) {
  return fetch(RUNTIME_NARRATION_CONTRACT.endpoint, {
    method: "POST",
    headers: {
      accept: mode === "generate" ? "audio/mpeg" : "application/json",
      authorization: `Bearer ${bearerToken}`,
      "content-type": "application/json",
      "x-finaltab-v3-narration-token": operatorCapability,
    },
    body: JSON.stringify({ mode }),
    redirect: "error",
    signal: AbortSignal.timeout(mode === "generate" ? 190_000 : 45_000),
  });
}

async function main() {
  if ([...args].some((arg) => !known.has(arg))) throw new RuntimeNarrationSafeStop("UNKNOWN_ARGUMENT");
  const preflight = args.has("--preflight");
  const generate = args.has("--generate");
  if (preflight === generate) throw new RuntimeNarrationSafeStop("CHOOSE_EXACTLY_ONE_MODE");
  if (Date.now() >= Date.parse(RUNTIME_NARRATION_CONTRACT.expiresAt)) throw new RuntimeNarrationSafeStop("OPERATOR_EXPIRED");
  if (preflight && !args.has("--acknowledge-one-no-charge-subscription-get")) {
    throw new RuntimeNarrationSafeStop("PREFLIGHT_ACKNOWLEDGEMENT_REQUIRED");
  }
  if (generate && !args.has("--acknowledge-one-provider-call")) {
    throw new RuntimeNarrationSafeStop("GENERATION_ACKNOWLEDGEMENT_REQUIRED");
  }
  if (preflight && args.has("--acknowledge-one-provider-call")) throw new RuntimeNarrationSafeStop("GENERATION_FLAG_REJECTED_IN_PREFLIGHT");
  if (generate && args.has("--acknowledge-one-no-charge-subscription-get")) throw new RuntimeNarrationSafeStop("PREFLIGHT_FLAG_REJECTED_IN_GENERATION");

  const bearerToken = await loadRuntimeNarrationToken(paths.bearerCredentialPath);
  const operatorCapability = await loadRuntimeNarrationCapability(paths.operatorCredentialPath);
  let response;
  try {
    response = await runtimeRequest(generate ? "generate" : "preflight", bearerToken, operatorCapability);
  } catch {
    throw new RuntimeNarrationSafeStop("RUNTIME_REQUEST_FAILED_CLOSED");
  }
  if (preflight) {
    const body = await parseSafeJson(response);
    if (!response.ok || body.ok !== true) {
      const error = typeof body.error === "string" ? body.error : "PREFLIGHT_DENIED";
      const detail = body.quota ? quotaSummary(body.quota) : null;
      throw new RuntimeNarrationSafeStop(`${error}${detail ? `_${detail.reasonCode}` : ""}`);
    }
    const safe = quotaSummary(body.quota);
    process.stdout.write(`V3 narration preflight approved · ${safe.exactNarrationCharacters} exact characters · ${safe.requiredIncludedCharacters} included required · ${safe.remainingIncludedCharacters} included remaining · no synthesis request made\n`);
    return;
  }
  if (!response.ok) {
    const body = await parseSafeJson(response);
    throw new RuntimeNarrationSafeStop(typeof body.error === "string" ? body.error : "GENERATION_DENIED");
  }

  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLocaleLowerCase("en-US");
  const replayed = response.headers.get("x-finaltab-narration-replayed");
  const postsThisRequest = response.headers.get("x-finaltab-provider-posts-this-request");
  const checkedAt = response.headers.get("x-finaltab-quota-checked-at");
  const remaining = Number(response.headers.get("x-finaltab-quota-remaining-included-characters"));
  if (
    contentType !== "audio/mpeg"
    || response.headers.get("x-finaltab-narration-script-sha256") !== RUNTIME_NARRATION_CONTRACT.providerScriptSha256
    || !["true", "false"].includes(replayed)
    || !["0", "1"].includes(postsThisRequest)
    || (replayed === "true" && postsThisRequest !== "0")
    || (replayed === "false" && postsThisRequest !== "1")
    || typeof checkedAt !== "string"
    || !Number.isFinite(Date.parse(checkedAt))
    || !Number.isSafeInteger(remaining)
    || remaining < RUNTIME_NARRATION_CONTRACT.requiredIncludedCharacters
  ) throw new RuntimeNarrationSafeStop("RUNTIME_AUDIO_HEADERS_INVALID");

  const audio = await readBoundedRuntimeAudio(response);
  const expectedAudioSha256 = response.headers.get("x-finaltab-narration-audio-sha256");
  verifyRuntimeAudioResponse(response, audio);
  const quotaFacts = {
    checkedAt,
    sanitized: true,
    result: "approved",
    reasonCode: "included_quota_sufficient",
    httpStatus: 200,
    exactNarrationCharacters: RUNTIME_NARRATION_CONTRACT.exactCharacters,
    safetyMultiplier: 1.1,
    requiredIncludedCharacters: RUNTIME_NARRATION_CONTRACT.requiredIncludedCharacters,
    remainingIncludedCharacters: remaining,
    subscriptionActive: true,
    currentOverageIsZero: true,
    hasOpenInvoices: false,
    paymentPendingOrFailed: false,
    extensionOrOverageAvailable: false,
  };
  const reconciled = await reconcileRuntimeNarrationArtifacts({
    audio,
    quotaFacts,
    replayed: replayed === "true",
    providerPostsThisRequest: Number(postsThisRequest),
    paths,
  });
  if (reconciled.audioSha256 !== expectedAudioSha256) throw new RuntimeNarrationSafeStop("RUNTIME_AUDIO_HASH_INVALID");
  process.stdout.write(`V3 narration audio reconciled · ${audio.length} bytes · sha256 ${reconciled.audioSha256} · provider posts this request ${postsThisRequest}\n`);
}

main().catch((error) => {
  const code = error instanceof RuntimeNarrationSafeStop ? error.code : "RUNTIME_RUNNER_FAILED_CLOSED";
  process.stderr.write(`V3 narration runner stopped safely: ${code}. No credential or response body was printed.\n`);
  process.exitCode = 1;
});
