import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/apiAccess", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/apiAccess")>();
  return { ...actual, authorizeApiRequest: vi.fn() };
});

vi.mock("@/lib/server/v3NarrationGenerationStore", () => ({
  createV3NarrationGenerationStore: vi.fn(),
}));

import { POST } from "@/app/api/operator/v3-narration/route";
import { authorizeApiRequest, type ApiPrincipal } from "@/lib/server/apiAccess";
import { createV3NarrationGenerationStore } from "@/lib/server/v3NarrationGenerationStore";
import {
  runV3NarrationOperator,
  V3_NARRATION_EXACT_CHARACTERS,
  V3_NARRATION_OPERATION_ID,
  V3_NARRATION_OPERATOR_EXPIRES_AT,
  V3_NARRATION_REQUIRED_INCLUDED_CHARACTERS,
  V3_NARRATION_SCRIPT_SHA256,
  V3_NARRATION_TEXT,
  type V3NarrationBinding,
  type V3NarrationGenerationStore,
  type V3NarrationJournalRecord,
} from "@/lib/server/v3NarrationOperator";

const bearerPrincipal: ApiPrincipal = {
  subject: "v3-video-operator",
  name: "V3 video operator",
  scopes: new Set(["settlements:prepare"]),
  source: "bearer-token",
  rateKey: "v3-video-operator-key",
};

const accessHeaders = new Headers({ "cache-control": "private, no-store", "x-ratelimit-remaining": "4" });
const operatorCapability = "ftv3_test_operator_capability_000000000001";
const operatorCapabilitySha256 = createHash("sha256").update(operatorCapability).digest("hex");
const actorHash = createHash("sha256").update(bearerPrincipal.subject).digest("hex");
const unexpired = Date.parse(V3_NARRATION_OPERATOR_EXPIRES_AT) - 1;
const audio = Buffer.alloc(12_000, 0x31);
const audioSha256 = createHash("sha256").update(audio).digest("hex");

function quotaSubscription(overrides: Record<string, unknown> = {}) {
  return {
    character_count: 100,
    character_limit: 10_000,
    status: "active",
    current_overage: { amount: "0" },
    has_open_invoices: false,
    open_invoices: [],
    next_invoice: null,
    can_extend_character_limit: false,
    max_credit_limit_extension: 0,
    ...overrides,
  };
}

function journal(
  state: V3NarrationJournalRecord["state"],
  overrides: Partial<V3NarrationJournalRecord> = {},
): V3NarrationJournalRecord {
  return {
    acquired: false,
    operationId: V3_NARRATION_OPERATION_ID,
    actorSubjectHash: actorHash,
    scriptSha256: V3_NARRATION_SCRIPT_SHA256,
    state,
    audio: state === "completed" ? audio : null,
    audioSha256: state === "completed" ? audioSha256 : null,
    audioBytes: state === "completed" ? audio.length : null,
    contentType: state === "completed" ? "audio/mpeg" : null,
    providerRequestId: state === "completed" ? "req-v3-1" : null,
    failureCode: state === "failed" ? "synthesis_http_error" : null,
    providerHttpStatus: state === "completed" ? 200 : state === "failed" ? 503 : null,
    quotaCheckedAt: "2026-08-12T07:59:59.000Z",
    remainingIncludedCharacters: 9_900,
    expiresAt: V3_NARRATION_OPERATOR_EXPIRES_AT,
    ...overrides,
  };
}

function mockStore(initial: V3NarrationJournalRecord | null = null) {
  let record = initial;
  const store: V3NarrationGenerationStore = {
    read: vi.fn(async () => record),
    reserve: vi.fn(async (binding: V3NarrationBinding) => {
      record = journal("reserved", {
        acquired: true,
        actorSubjectHash: binding.actorSubjectHash,
        scriptSha256: binding.scriptSha256,
      });
      return record;
    }),
    complete: vi.fn(async (binding, artifact) => {
      record = journal("completed", {
        actorSubjectHash: binding.actorSubjectHash,
        scriptSha256: binding.scriptSha256,
        audio: artifact.audio,
        audioSha256: artifact.audioSha256,
        audioBytes: artifact.audio.length,
        providerRequestId: artifact.providerRequestId,
      });
      return record;
    }),
    fail: vi.fn(async () => undefined),
  };
  return store;
}

function request(mode: "preflight" | "generate", capability: string | null = operatorCapability) {
  const headers = new Headers({ "content-type": "application/json" });
  if (capability !== null) headers.set("x-finaltab-v3-narration-token", capability);
  return new Request("https://finaltab.example/api/operator/v3-narration", {
    method: "POST",
    headers,
    body: JSON.stringify({ mode }),
  });
}

describe("temporary V3 narration runtime operator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    process.env.ELEVENLABS_API_KEY = "mock-elevenlabs-api-key";
    process.env.FINALTAB_V3_NARRATION_OPERATOR_TOKEN_SHA256 = operatorCapabilitySha256;
    vi.mocked(authorizeApiRequest).mockResolvedValue({
      ok: true,
      principal: bearerPrincipal,
      headers: accessHeaders,
    });
    vi.mocked(createV3NarrationGenerationStore).mockReturnValue(mockStore());
  });

  it("locks the exact 188-word, 1,200-character narration and conservative cost", () => {
    expect(V3_NARRATION_TEXT.match(/[\p{L}\p{N}]+(?:[-â€™'][\p{L}\p{N}]+)*/gu)).toHaveLength(188);
    expect([...V3_NARRATION_TEXT]).toHaveLength(V3_NARRATION_EXACT_CHARACTERS);
    expect(V3_NARRATION_EXACT_CHARACTERS).toBe(1_200);
    expect(V3_NARRATION_REQUIRED_INCLUDED_CHARACTERS).toBe(1_320);
    expect(createHash("sha256").update(V3_NARRATION_TEXT).digest("hex")).toBe(V3_NARRATION_SCRIPT_SHA256);
  });

  it.each(["session", "bearer-jwt"] as const)("rejects %s before touching the provider or journal", async (source) => {
    vi.mocked(authorizeApiRequest).mockResolvedValue({
      ok: true,
      principal: { ...bearerPrincipal, source },
      headers: accessHeaders,
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const store = mockStore();
    vi.mocked(createV3NarrationGenerationStore).mockReturnValue(store);

    const response = await POST(request("generate"));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "BEARER_TOKEN_REQUIRED" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(store.read).not.toHaveBeenCalled();
  });

  it.each([
    ["missing capability header", null, operatorCapabilitySha256],
    ["malformed capability header", "short", operatorCapabilitySha256],
    ["wrong capability header", "ftv3_wrong_operator_capability_000000000001", operatorCapabilitySha256],
    ["missing capability digest", operatorCapability, undefined],
    ["malformed capability digest", operatorCapability, "not-a-sha256"],
  ] as const)("rejects %s before provider configuration or journal access", async (_name, capability, digest) => {
    if (digest === undefined) delete process.env.FINALTAB_V3_NARRATION_OPERATOR_TOKEN_SHA256;
    else process.env.FINALTAB_V3_NARRATION_OPERATOR_TOKEN_SHA256 = digest;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const store = mockStore();
    vi.mocked(createV3NarrationGenerationStore).mockReturnValue(store);

    const response = await POST(request("generate", capability));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "NARRATION_OPERATOR_CAPABILITY_REQUIRED" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(createV3NarrationGenerationStore).not.toHaveBeenCalled();
    expect(store.read).not.toHaveBeenCalled();
  });

  it("preflight makes exactly one subscription GET and has no synthesis branch", async () => {
    const calls: Array<{ method: string; redirect: RequestRedirect | undefined; url: string }> = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ method: String(init?.method), redirect: init?.redirect, url: String(input) });
      return Response.json(quotaSubscription(), { status: 200 });
    }) as unknown as typeof fetch;
    const store = mockStore();

    const result = await runV3NarrationOperator({
      mode: "preflight",
      actorSubject: bearerPrincipal.subject,
      apiKey: "mock-key",
      store,
      fetchImpl,
      nowMs: unexpired,
    });

    expect(result.ok).toBe(true);
    expect(calls).toEqual([{
      method: "GET",
      redirect: "error",
      url: "https://api.elevenlabs.io/v1/user/subscription",
    }]);
    expect(store.read).not.toHaveBeenCalled();
    expect(store.reserve).not.toHaveBeenCalled();
  });

  it.each([
    ["expired", { nowMs: Date.parse(V3_NARRATION_OPERATOR_EXPIRES_AT) }],
    ["missing key", { apiKey: "" }],
  ])("makes no provider call when denied by %s", async (_name, overrides) => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const store = mockStore();
    const result = await runV3NarrationOperator({
      mode: "generate",
      actorSubject: bearerPrincipal.subject,
      apiKey: "mock-key",
      store,
      fetchImpl,
      nowMs: unexpired,
      ...overrides,
    });
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.reserve).not.toHaveBeenCalled();
  });

  it("denies insufficient included quota with one GET and zero POST", async () => {
    const methods: string[] = [];
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      methods.push(String(init?.method));
      return Response.json(quotaSubscription({ character_count: 9_999, character_limit: 10_000 }), { status: 200 });
    }) as unknown as typeof fetch;
    const store = mockStore();

    const result = await runV3NarrationOperator({
      mode: "generate",
      actorSubject: bearerPrincipal.subject,
      apiKey: "mock-key",
      store,
      fetchImpl,
      nowMs: unexpired,
    });

    expect(result).toMatchObject({ ok: false, status: 412, code: "QUOTA_PREFLIGHT_DENIED" });
    expect(methods).toEqual(["GET"]);
    expect(store.reserve).not.toHaveBeenCalled();
  });

  it("denies enabled extension or overage capacity with one GET and zero POST", async () => {
    const methods: string[] = [];
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      methods.push(String(init?.method));
      return Response.json(quotaSubscription({
        can_extend_character_limit: true,
        max_credit_limit_extension: "unlimited",
      }), { status: 200 });
    }) as unknown as typeof fetch;
    const store = mockStore();

    const result = await runV3NarrationOperator({
      mode: "generate",
      actorSubject: bearerPrincipal.subject,
      apiKey: "mock-key",
      store,
      fetchImpl,
      nowMs: unexpired,
    });

    expect(result).toMatchObject({
      ok: false,
      status: 412,
      code: "QUOTA_PREFLIGHT_DENIED",
      facts: { reasonCode: "extension_or_overage_enabled" },
    });
    expect(methods).toEqual(["GET"]);
    expect(store.reserve).not.toHaveBeenCalled();
  });

  it("fails closed when the subscription omits explicit extension-disable proof", async () => {
    const methods: string[] = [];
    const subscription = quotaSubscription();
    delete (subscription as Partial<typeof subscription>).can_extend_character_limit;
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      methods.push(String(init?.method));
      return Response.json(subscription, { status: 200 });
    }) as unknown as typeof fetch;

    const result = await runV3NarrationOperator({
      mode: "generate",
      actorSubject: bearerPrincipal.subject,
      apiKey: "mock-key",
      store: mockStore(),
      fetchImpl,
      nowMs: unexpired,
    });

    expect(result).toMatchObject({
      ok: false,
      status: 412,
      facts: { reasonCode: "subscription_response_malformed" },
    });
    expect(methods).toEqual(["GET"]);
  });

  it("fails closed on a subscription redirect and never reaches synthesis", async () => {
    const calls: Array<{ method: string; redirect: RequestRedirect | undefined; url: string }> = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ method: String(init?.method), redirect: init?.redirect, url: String(input) });
      return new Response(null, {
        status: 302,
        headers: { location: "https://redirect.invalid/subscription" },
      });
    }) as unknown as typeof fetch;
    const store = mockStore();

    const result = await runV3NarrationOperator({
      mode: "generate",
      actorSubject: bearerPrincipal.subject,
      apiKey: "mock-key",
      store,
      fetchImpl,
      nowMs: unexpired,
    });

    expect(result).toMatchObject({
      ok: false,
      status: 412,
      code: "QUOTA_PREFLIGHT_DENIED",
      facts: { httpStatus: 302, reasonCode: "subscription_get_http_error" },
    });
    expect(calls).toEqual([{
      method: "GET",
      redirect: "error",
      url: "https://api.elevenlabs.io/v1/user/subscription",
    }]);
    expect(store.reserve).not.toHaveBeenCalled();
  });

  it("reserves durably before exactly one provider POST, then stores and returns audio", async () => {
    const calls: Array<{ method: string; redirect: RequestRedirect | undefined; url: string; body?: string }> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({
        method: String(init?.method),
        redirect: init?.redirect,
        url: String(input),
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      if (init?.method === "GET") return Response.json(quotaSubscription(), { status: 200 });
      return new Response(audio, { status: 200, headers: { "content-type": "audio/mpeg", "request-id": "req-v3-1" } });
    });
    const fetchImpl = fetchMock as unknown as typeof fetch;
    const store = mockStore();

    const result = await runV3NarrationOperator({
      mode: "generate",
      actorSubject: bearerPrincipal.subject,
      apiKey: "mock-key",
      store,
      fetchImpl,
      nowMs: unexpired,
    });

    expect(result).toMatchObject({ ok: true, kind: "audio", replayed: false, audioSha256 });
    expect(calls.map((call) => call.method)).toEqual(["GET", "POST"]);
    expect(calls.map((call) => call.redirect)).toEqual(["error", "error"]);
    expect(calls.map((call) => call.url)).toEqual([
      "https://api.elevenlabs.io/v1/user/subscription",
      "https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128",
    ]);
    expect(JSON.parse(calls[1]!.body!)).toEqual({ text: V3_NARRATION_TEXT, model_id: "eleven_multilingual_v2" });
    expect(vi.mocked(store.reserve).mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[1]!);
    expect(store.complete).toHaveBeenCalledTimes(1);
  });

  it("replays stored audio with zero quota GETs and zero provider POSTs", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const store = mockStore(journal("completed"));

    const result = await runV3NarrationOperator({
      mode: "generate",
      actorSubject: bearerPrincipal.subject,
      apiKey: "mock-key",
      store,
      fetchImpl,
      nowMs: unexpired,
    });

    expect(result).toMatchObject({ ok: true, kind: "audio", replayed: true, audioSha256 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.reserve).not.toHaveBeenCalled();
  });

  it("rejects a completed replay bound to another bearer actor with zero provider calls", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const store = mockStore(journal("completed", { actorSubjectHash: "a".repeat(64) }));

    const result = await runV3NarrationOperator({
      mode: "generate",
      actorSubject: bearerPrincipal.subject,
      apiKey: "mock-key",
      store,
      fetchImpl,
      nowMs: unexpired,
    });

    expect(result).toEqual({ ok: false, status: 503, code: "GENERATION_JOURNAL_BINDING_INVALID" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.reserve).not.toHaveBeenCalled();
  });

  it("rejects a completed replay with a mismatched hard expiry with zero provider calls", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const store = mockStore(journal("completed", { expiresAt: "2026-08-12T08:00:01Z" }));

    const result = await runV3NarrationOperator({
      mode: "generate",
      actorSubject: bearerPrincipal.subject,
      apiKey: "mock-key",
      store,
      fetchImpl,
      nowMs: unexpired,
    });

    expect(result).toEqual({ ok: false, status: 503, code: "GENERATION_JOURNAL_BINDING_INVALID" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.reserve).not.toHaveBeenCalled();
  });

  it.each([journal("reserved"), journal("failed")])("never posts for an existing $state operation", async (existing) => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const store = mockStore(existing);
    const result = await runV3NarrationOperator({
      mode: "generate",
      actorSubject: bearerPrincipal.subject,
      apiKey: "mock-key",
      store,
      fetchImpl,
      nowMs: unexpired,
    });
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
