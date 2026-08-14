import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const RUNTIME_NARRATION_CONTRACT = Object.freeze({
  endpoint: "https://finaltab.vercel.app/api/operator/v3-narration",
  operation: "finaltab-v3-elevenlabs-george-20260812",
  expiresAt: "2026-08-12T08:00:00Z",
  providerScriptSha256: "3361c9d84fa42ddeffd5c4eaf1b5e37b5db0494f9f72b404f2e9e4b550119a11",
  manifestScriptSha256: "0474a3c4e076c850f87b5e6ce42e0b9ea3131e34f6e79a99d7da199e938abdda",
  exactCharacters: 1_200,
  requiredIncludedCharacters: 1_320,
  minAudioBytes: 10_000,
  maxAudioBytes: 4_194_304,
});

export class RuntimeNarrationSafeStop extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const hash = (value) => createHash("sha256").update(value).digest("hex");

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw new RuntimeNarrationSafeStop("LOCAL_STATE_UNAVAILABLE");
  }
}

async function readJson(filePath, code) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    throw new RuntimeNarrationSafeStop(code);
  }
}

async function writeAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, value, { flag: "wx", mode: 0o600 });
  await rename(tempPath, filePath);
}

export async function loadRuntimeNarrationToken(credentialPath) {
  const parsed = await readJson(credentialPath, "CREDENTIAL_FILE_INVALID");
  if (!parsed || parsed.version !== 1 || typeof parsed.token !== "string" || parsed.token.length < 20) {
    throw new RuntimeNarrationSafeStop("CREDENTIAL_FILE_INVALID");
  }
  return parsed.token;
}

export async function loadRuntimeNarrationCapability(credentialPath) {
  const parsed = await readJson(credentialPath, "OPERATOR_CAPABILITY_FILE_INVALID");
  if (
    !parsed
    || parsed.version !== 1
    || typeof parsed.capability !== "string"
    || parsed.capability.length < 20
    || parsed.capability.length > 512
  ) throw new RuntimeNarrationSafeStop("OPERATOR_CAPABILITY_FILE_INVALID");
  return parsed.capability;
}

export function quotaSummary(quota) {
  if (!quota || typeof quota !== "object" || Array.isArray(quota)) {
    throw new RuntimeNarrationSafeStop("RUNTIME_RESPONSE_INVALID");
  }
  const safe = {
    checkedAt: quota.checkedAt,
    sanitized: quota.sanitized,
    result: quota.result,
    reasonCode: quota.reasonCode,
    httpStatus: quota.httpStatus,
    exactNarrationCharacters: quota.exactNarrationCharacters,
    safetyMultiplier: quota.safetyMultiplier,
    requiredIncludedCharacters: quota.requiredIncludedCharacters,
    remainingIncludedCharacters: quota.remainingIncludedCharacters,
    subscriptionActive: quota.subscriptionActive,
    currentOverageIsZero: quota.currentOverageIsZero,
    hasOpenInvoices: quota.hasOpenInvoices,
    paymentPendingOrFailed: quota.paymentPendingOrFailed,
    extensionOrOverageAvailable: quota.extensionOrOverageAvailable,
  };
  if (
    typeof safe.checkedAt !== "string"
    || !Number.isFinite(Date.parse(safe.checkedAt))
    || safe.sanitized !== true
    || !["approved", "denied"].includes(safe.result)
    || typeof safe.reasonCode !== "string"
    || !Number.isSafeInteger(safe.httpStatus)
    || safe.exactNarrationCharacters !== RUNTIME_NARRATION_CONTRACT.exactCharacters
    || safe.safetyMultiplier !== 1.1
    || safe.requiredIncludedCharacters !== RUNTIME_NARRATION_CONTRACT.requiredIncludedCharacters
    || !Number.isSafeInteger(safe.remainingIncludedCharacters)
  ) throw new RuntimeNarrationSafeStop("RUNTIME_RESPONSE_INVALID");
  return safe;
}

export async function readBoundedRuntimeAudio(response) {
  const declaredRaw = response.headers.get("content-length");
  if (declaredRaw !== null) {
    const declared = Number(declaredRaw);
    if (
      !Number.isSafeInteger(declared)
      || declared < RUNTIME_NARRATION_CONTRACT.minAudioBytes
      || declared > RUNTIME_NARRATION_CONTRACT.maxAudioBytes
    ) throw new RuntimeNarrationSafeStop("RUNTIME_AUDIO_INVALID");
  }
  if (!response.body) throw new RuntimeNarrationSafeStop("RUNTIME_AUDIO_INVALID");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > RUNTIME_NARRATION_CONTRACT.maxAudioBytes) {
        await reader.cancel();
        throw new RuntimeNarrationSafeStop("RUNTIME_AUDIO_INVALID");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  if (total < RUNTIME_NARRATION_CONTRACT.minAudioBytes) {
    throw new RuntimeNarrationSafeStop("RUNTIME_AUDIO_INVALID");
  }
  return Buffer.concat(chunks, total);
}

export function verifyRuntimeAudioResponse(response, audio) {
  const declaredRaw = response.headers.get("content-length");
  if (declaredRaw !== null) {
    const declared = Number(declaredRaw);
    if (!Number.isSafeInteger(declared) || declared !== audio.length) {
      throw new RuntimeNarrationSafeStop("RUNTIME_AUDIO_INVALID");
    }
  }
  const expectedAudioSha256 = response.headers.get("x-finaltab-narration-audio-sha256");
  const observedAudioSha256 = hash(audio);
  if (expectedAudioSha256 !== observedAudioSha256) {
    throw new RuntimeNarrationSafeStop("RUNTIME_AUDIO_INVALID");
  }
  return observedAudioSha256;
}

function validatePendingOrMatchingLedger(ledger, artifact) {
  if (
    ledger?.schemaVersion !== 3
    || ledger?.sanitized !== true
    || ledger?.containsCredentials !== false
    || ledger?.provider !== "ElevenLabs"
    || ledger?.voiceId !== "JBFqnCBsd6RMkjVDRZzb"
    || ledger?.model !== "eleven_multilingual_v2"
    || ledger?.outputFormat !== "mp3_44100_128"
    || ledger?.scriptWordCount !== 188
    || ledger?.callSummary?.expectedProviderCalls !== 1
  ) throw new RuntimeNarrationSafeStop("LOCAL_LEDGER_INVALID");
  if (ledger.status === "pending-v3-single-batch") {
    if (ledger.callSummary.selectedProviderCalls !== 0) throw new RuntimeNarrationSafeStop("LOCAL_LEDGER_CONFLICT");
    return;
  }
  if (
    ledger.status !== "generated-v3-single-batch"
    || ledger.callSummary.selectedProviderCalls !== 1
    || ledger.callSummary.attemptedProviderCalls !== 1
    || ledger.selectedBatch?.sha256 !== artifact.audioSha256
    || ledger.selectedBatch?.bytes !== artifact.audio.length
    || ledger.selectedBatch?.batchId !== artifact.batchId
    || ledger.selectedBatch?.scriptNarrationSha256 !== RUNTIME_NARRATION_CONTRACT.manifestScriptSha256
  ) throw new RuntimeNarrationSafeStop("LOCAL_LEDGER_CONFLICT");
}

function validatePendingOrMatchingManifest(manifest, artifact) {
  if (
    manifest?.schemaVersion !== 3
    || manifest?.provider !== "ElevenLabs"
    || manifest?.voiceId !== "JBFqnCBsd6RMkjVDRZzb"
    || manifest?.model !== "eleven_multilingual_v2"
    || manifest?.outputFormat !== "mp3_44100_128"
    || manifest?.expectedProviderCalls !== 1
  ) throw new RuntimeNarrationSafeStop("VOICE_MANIFEST_INVALID");
  if (manifest.status === "pending-v3-single-batch") {
    if (manifest.selectedProviderCalls !== 0) throw new RuntimeNarrationSafeStop("VOICE_MANIFEST_CONFLICT");
    return;
  }
  if (
    manifest.status !== "generated-v3-single-batch"
    || manifest.selectedProviderCalls !== 1
    || manifest.scriptNarrationSha256 !== RUNTIME_NARRATION_CONTRACT.manifestScriptSha256
    || manifest.rawProviderResponse?.sha256 !== artifact.audioSha256
    || manifest.rawProviderResponse?.bytes !== artifact.audio.length
    || manifest.rawProviderResponse?.batchId !== artifact.batchId
  ) throw new RuntimeNarrationSafeStop("VOICE_MANIFEST_CONFLICT");
}

export async function reconcileRuntimeNarrationArtifacts({
  audio,
  quotaFacts,
  replayed,
  providerPostsThisRequest,
  paths,
  interruptAfter,
}) {
  const audioSha256 = hash(audio);
  const batchId = `sha256-${audioSha256.slice(0, 24)}`;
  const artifact = { audio, audioSha256, batchId };
  const existingAudio = await exists(paths.audioPath) ? await readFile(paths.audioPath) : null;
  if (existingAudio && (existingAudio.length !== audio.length || hash(existingAudio) !== audioSha256)) {
    throw new RuntimeNarrationSafeStop("LOCAL_AUDIO_CONFLICT");
  }
  const ledger = await readJson(paths.ledgerPath, "LOCAL_LEDGER_INVALID");
  const manifest = await readJson(paths.manifestPath, "VOICE_MANIFEST_INVALID");
  validatePendingOrMatchingLedger(ledger, artifact);
  validatePendingOrMatchingManifest(manifest, artifact);

  if (!existingAudio) await writeAtomic(paths.audioPath, audio);
  if (interruptAfter === "audio") throw new RuntimeNarrationSafeStop("TEST_INTERRUPT_AFTER_AUDIO");

  const generatedLedger = {
    ...ledger,
    status: "generated-v3-single-batch",
    callSummary: {
      ...ledger.callSummary,
      attemptedProviderCalls: 1,
      selectedProviderCalls: 1,
    },
    quotaPreflight: quotaFacts,
    selectedBatch: {
      path: "assets/audio/voice-v3/finaltab-v3-george-provider-response.mp3",
      bytes: audio.length,
      sha256: audioSha256,
      batchId,
      scriptNarrationSha256: RUNTIME_NARRATION_CONTRACT.manifestScriptSha256,
      replayedFromDurableRuntime: replayed,
      providerPostsThisRequest,
    },
    note: "Retrieved through the fail-closed runtime operator. No credential, raw quota response, or provider response metadata is retained in this ledger.",
  };
  await writeAtomic(paths.ledgerPath, `${JSON.stringify(generatedLedger, null, 2)}\n`);
  if (interruptAfter === "ledger") throw new RuntimeNarrationSafeStop("TEST_INTERRUPT_AFTER_LEDGER");

  const generatedManifest = {
    ...manifest,
    status: "generated-v3-single-batch",
    selectedProviderCalls: 1,
    scriptNarrationSha256: RUNTIME_NARRATION_CONTRACT.manifestScriptSha256,
    rawProviderResponse: {
      path: "assets/audio/voice-v3/finaltab-v3-george-provider-response.mp3",
      bytes: audio.length,
      sha256: audioSha256,
      batchId,
      contentType: "audio/mpeg",
    },
  };
  await writeAtomic(paths.manifestPath, `${JSON.stringify(generatedManifest, null, 2)}\n`);
  if (interruptAfter === "manifest") throw new RuntimeNarrationSafeStop("TEST_INTERRUPT_AFTER_MANIFEST");

  const receipt = {
    schemaVersion: 1,
    status: "retrieved",
    sanitized: true,
    containsCredentials: false,
    operation: RUNTIME_NARRATION_CONTRACT.operation,
    scriptNarrationSha256: RUNTIME_NARRATION_CONTRACT.providerScriptSha256,
    audio: {
      path: "video/finaltab-winner/assets/audio/voice-v3/finaltab-v3-george-provider-response.mp3",
      bytes: audio.length,
      sha256: audioSha256,
    },
    replayedFromDurableRuntime: replayed,
    providerPostsThisRequest,
    note: "The bearer capability and provider response metadata are deliberately absent.",
  };
  // The receipt is last and may be refreshed by a crash-recovery replay. Its
  // total provider call truth stays in the ledger; this field records only the
  // retrieval that completed the local reconciliation.
  await writeAtomic(paths.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  if (interruptAfter === "receipt") throw new RuntimeNarrationSafeStop("TEST_INTERRUPT_AFTER_RECEIPT");
  return { audioSha256, batchId };
}
