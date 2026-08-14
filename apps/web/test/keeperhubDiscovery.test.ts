import { describe, expect, it } from "vitest";
import {
  buildFinalTabOpenApi,
  buildKeeperHubDiscovery,
  buildKeeperHubWorkflow,
  canonicalIntegrationOrigin,
  publicV2ContractAddress,
} from "@/lib/integrations/keeperhubDiscovery";

describe("KeeperHub integration discovery", () => {
  it("pins a configured HTTPS origin and permits localhost HTTP only for development", () => {
    expect(
      canonicalIntegrationOrigin("https://host-header.example/path", "https://finaltab.example/ignored"),
    ).toBe("https://finaltab.example");
    expect(canonicalIntegrationOrigin("http://localhost:3017/path")).toBe("http://localhost:3017");
    expect(canonicalIntegrationOrigin("https://finaltab.example/path", "http://unsafe.example")).toBe(
      "https://finaltab.example",
    );
  });

  it("advertises V2 only and fails readiness closed without a valid contract", () => {
    const missing = buildKeeperHubDiscovery("https://finaltab.example", publicV2ContractAddress("not-an-address"));
    expect(missing.keeperHub.contract).toMatchObject({
      name: "FinalTabBatchSettlementV2",
      version: "2",
      address: null,
      ready: false,
    });
    expect(JSON.stringify(missing)).not.toContain("FinalTabBatchSettlement\"");
    expect(JSON.stringify(missing)).not.toContain("0xCcf6b4Def9A70b52F5fB78Aa38CD274a05aB7e64");

    const address = "0x1111111111111111111111111111111111111111";
    const ready = buildKeeperHubDiscovery("https://finaltab.example", publicV2ContractAddress(address));
    expect(ready.keeperHub.contract).toMatchObject({ address, ready: true });
  });

  it("builds the documented KeeperHub workflow export v1 shape without a credential", () => {
    const workflow = buildKeeperHubWorkflow("https://finaltab.example");
    expect(Object.keys(workflow)).toEqual([
      "version",
      "exportedAt",
      "workflow",
      "nodes",
      "edges",
      "integrationBindings",
    ]);
    expect(workflow.version).toBe(1);
    expect(workflow.nodes[0]?.data.config.triggerType).toBe("Webhook");
    expect(workflow.nodes[1]?.data.config.actionType).toBe("webhook/send-webhook");
    expect(JSON.parse(workflow.nodes[1]!.data.config.webhookPayload!)).toEqual({
      event: "keeperhub.execution.observe",
      executionId: "{{Webhook.input.executionId}}",
      settlementId: "{{Webhook.input.settlementId}}",
      ledgerHash: "{{Webhook.input.ledgerHash}}",
    });
    expect(workflow.nodes[1]?.data.config.webhookHeaders).toContain("REPLACE_WITH_FINALTAB_SCOPED_TOKEN");
    expect(JSON.stringify(workflow)).not.toMatch(/\b(kh_|wfb_|sk_)[A-Za-z0-9_-]{8,}/);
  });

  it("publishes an OpenAPI 3.1 contract for authenticated V2 settlement and the observer", () => {
    const openapi = buildFinalTabOpenApi("https://finaltab.example");
    expect(openapi.openapi).toBe("3.1.0");
    expect(openapi.paths["/api/settle/execute"].post.operationId).toBe("executeV2Settlement");
    expect(
      openapi.paths["/api/settle/execute"].post.requestBody.content["application/json"].schema.required,
    ).toEqual(["signedSettlement", "approval"]);
    expect(openapi.paths["/api/settle/approval"].post.operationId).toBe(
      "createV2BroadcastApprovalChallenge",
    );
    expect(openapi.paths["/api/integrations/keeperhub/events"].post.operationId).toBe(
      "observeKeeperHubExecution",
    );
    expect(
      openapi.paths["/api/integrations/keeperhub/events"].post.requestBody.content["application/json"].schema.required,
    ).toEqual(["event", "executionId", "settlementId", "ledgerHash"]);
    expect(openapi.paths["/api/settle/status/{id}"].get.parameters.map((item) => item.name)).toEqual([
      "id",
      "settlementId",
      "ledgerHash",
    ]);
    expect(openapi.components.securitySchemes.FinalTabBearer.scheme).toBe("bearer");
    expect(openapi.components.schemas.signedDebit.properties.nonce.$ref).toBe(
      "#/components/schemas/bytes32",
    );
    expect(JSON.stringify(openapi)).not.toContain("#/$defs/");
    expect(openapi["x-keeperhub"].contractVersion).toBe("FinalTabBatchSettlementV2");
  });

  it("documents configuration-gated AssemblyAI live STT and ElevenLabs readback", () => {
    const openapi = buildFinalTabOpenApi("https://finaltab.example");
    const token = openapi.paths["/api/voice/token"].post;
    const speak = openapi.paths["/api/voice/speak"].post;

    expect(openapi.tags.map((tag) => tag.name)).toContain("Voice");
    expect(token.operationId).toBe("createVoiceTranscriptionSession");
    expect(token["x-finaltab-required-scope"]).toBe("receipts:write");
    expect(token["x-finaltab-configuration-gated"]).toBe(true);
    expect(token["x-finaltab-authenticated-user-required"]).toBe(true);
    expect(token["x-finaltab-accepted-authentication"]).toEqual([
      "same-origin-supabase-cookie-session",
      "supabase-bearer-jwt",
    ]);
    expect(token["x-finaltab-opaque-bearer-accepted"]).toBe(false);
    expect(token["x-finaltab-durable-quota"]).toMatchObject({
      backend: "supabase-postgres-rpc",
      identity: "route-verified-supabase-user-id",
      databaseExecutionRole: "service_role_only",
      limit: 8,
      capability: "transcription",
    });
    expect(token["x-finaltab-durable-budget"]).toMatchObject({
      reservation: "before-provider-token-mint",
      unit: "seconds",
      reservedPerRequest: 180,
      user: { daily: 720, monthly: 3600 },
      project: { daily: 3600, monthly: 18000 },
      concurrency: { user: 1, project: 4, leaseSeconds: 240 },
    });
    expect("requestBody" in token).toBe(false);
    expect(token.responses["200"].content["application/json"].schema.$ref).toBe(
      "#/components/schemas/voiceStreamingSession",
    );
    const sessionSchema = openapi.components.schemas.voiceStreamingSession;
    expect(sessionSchema.required).toEqual([
      "token",
      "expiresInSeconds",
      "maxSessionDurationSeconds",
      "websocketUrl",
      "sampleRate",
      "encoding",
      "model",
      "mode",
      "languageDetection",
      "keyterms",
      "voiceFocus",
    ]);
    expect(Object.keys(sessionSchema.properties)).toEqual(sessionSchema.required);
    expect(sessionSchema.properties.token.description).toContain(
      "not the permanent provider API key",
    );
    expect(sessionSchema.properties.websocketUrl.pattern).toBe("^wss://");
    expect(sessionSchema.properties.maxSessionDurationSeconds.const).toBe(180);
    expect(token.responses["501"].description).toContain("not configured");
    expect(token.responses["403"].description).toContain("opaque FINALTab API tokens");
    expect(token.responses["503"].description).toContain("Durable budget storage");
    expect(token.responses["502"].headers).toHaveProperty("x-voice-ratelimit-remaining");
    expect(token.responses["502"].headers).toHaveProperty("x-voice-budget-reserved-units");

    expect(speak.operationId).toBe("streamVoiceReadback");
    expect(speak["x-finaltab-required-scope"]).toBe("tabs:read");
    expect(speak["x-finaltab-configuration-gated"]).toBe(true);
    expect(speak["x-finaltab-authenticated-user-required"]).toBe(true);
    expect(speak["x-finaltab-opaque-bearer-accepted"]).toBe(false);
    expect(speak["x-finaltab-durable-quota"]).toMatchObject({
      identity: "route-verified-supabase-user-id",
      databaseExecutionRole: "service_role_only",
      limit: 20,
      capability: "readback",
    });
    expect(speak["x-finaltab-durable-budget"]).toMatchObject({
      reservation: "before-provider-request",
      unit: "characters",
      user: { daily: 2400, monthly: 12000 },
      project: { daily: 12000, monthly: 60000 },
    });
    expect(speak.requestBody.content["application/json"].schema.$ref).toBe(
      "#/components/schemas/voiceSpeakRequest",
    );
    expect(openapi.components.schemas.voiceSpeakRequest).toMatchObject({
      additionalProperties: false,
      required: ["text"],
    });
    expect(openapi.components.schemas.voiceSpeakRequest.properties.text).toMatchObject({
      minLength: 1,
      maxLength: 600,
      pattern: "\\S",
    });
    expect(speak.responses["200"].content["audio/mpeg"].schema).toEqual({
      type: "string",
      format: "binary",
    });
    expect(speak.responses["501"].description).toContain("not configured");
    expect(openapi["x-finaltab-voice"]).toMatchObject({
      configurationGated: true,
      authentication: {
        requiredIdentity: "supabase-auth-uid",
        opaqueFinalTabBearerAccepted: false,
      },
      durableQuota: {
        backend: "supabase-postgres-rpc",
        function: "reserve_voice_budget_service(uuid, text, bigint)",
        identity: "route-verified-supabase-user-id",
        databaseExecutionRole: "service_role_only",
        limitsPerMinute: { transcriptionSessions: 8, readbacks: 20 },
        assemblyAIConcurrency: { user: 1, project: 4, leaseSeconds: 240 },
        failClosedBeforeProvider: true,
      },
      permanentProviderKeys: "server-only",
      submissionNarrationProvider: "ElevenLabs-only",
      deploymentAvailability: "configuration-dependent-not-asserted",
    });
  });
});
