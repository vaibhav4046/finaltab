const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

const SETTLEMENT_REQUEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["settlementId", "ledgerHash", "transfers", "payouts"],
  properties: {
    settlementId: { $ref: "#/components/schemas/bytes32" },
    ledgerHash: { $ref: "#/components/schemas/bytes32" },
    transfers: {
      type: "array",
      minItems: 1,
      maxItems: 50,
      items: { $ref: "#/components/schemas/signedDebit" },
      description: "Unique debtors, sorted by address. Each debtor signs both the USDC pull and the complete V2 payout plan.",
    },
    payouts: {
      type: "array",
      minItems: 1,
      maxItems: 50,
      items: { $ref: "#/components/schemas/payout" },
      description: "Unique creditors, sorted by address. The sum must equal the signed debit total.",
    },
  },
} as const;

const VOICE_QUOTA_RESPONSE_HEADERS = {
  "x-voice-ratelimit-remaining": {
    description: "Requests remaining in the evaluated per-user voice quota window.",
    schema: { type: "integer", minimum: 0, maximum: 20 },
  },
  "x-voice-ratelimit-reset": {
    description: "Database-clock timestamp at which the evaluated fixed-minute window resets.",
    schema: { type: "string", format: "date-time" },
  },
  "x-voice-ratelimit-durable": {
    description: "Whether this decision came from the durable Supabase quota store.",
    schema: { type: "boolean" },
  },
  "x-voice-budget-durable": {
    description: "Whether spend units were atomically reserved in Supabase before the provider boundary.",
    schema: { type: "boolean" },
  },
  "x-voice-budget-unit": {
    description: "The reserved provider-usage unit: seconds or characters.",
    schema: { type: "string", enum: ["seconds", "characters"] },
  },
  "x-voice-budget-reserved-units": {
    description: "Worst-case units reserved before the provider call; zero when the decision was denied.",
    schema: { type: "integer", minimum: 0, maximum: 600 },
  },
  "x-voice-budget-user-day-remaining": {
    description: "Units remaining in the caller's UTC-day budget after this decision.",
    schema: { type: "integer", minimum: 0 },
  },
  "x-voice-budget-user-month-remaining": {
    description: "Units remaining in the caller's UTC-calendar-month budget after this decision.",
    schema: { type: "integer", minimum: 0 },
  },
} as const;

/**
 * Prefer an operator-pinned origin so proxy Host headers cannot rewrite
 * discovery URLs. Local HTTP remains available for development only.
 */
export function canonicalIntegrationOrigin(requestUrl: string, configuredOrigin?: string): string {
  const candidates = [configuredOrigin, new URL(requestUrl).origin];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate);
      const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
      if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) continue;
      return parsed.origin;
    } catch {
      // Try the request origin next.
    }
  }
  throw new Error("FINALTab integration origin must be HTTPS (or localhost HTTP in development).");
}

export function publicV2ContractAddress(value?: string): string | null {
  return value && ADDRESS_RE.test(value) ? value : null;
}

export function buildKeeperHubDiscovery(origin: string, contractAddress: string | null) {
  return {
    kind: "finaltab.integration",
    schemaVersion: "1.0",
    id: "finaltab",
    name: "FINALTab",
    description:
      "Receipt-to-settlement infrastructure with deterministic allocation, V2 plan-bound approvals, KeeperHub execution, and fail-closed proof.",
    environment: "base-sepolia",
    testnetOnly: true,
    canonicalUrl: origin,
    discovery: {
      openapi: `${origin}/openapi.json`,
      mcp: `${origin}/api/mcp`,
      keeperHubWorkflow: `${origin}/integrations/keeperhub/workflow`,
    },
    surfaces: {
      application: {
        url: `${origin}/app/tab`,
        integrationMode: "deep-link",
        iframeContract: "not-declared",
      },
      api: {
        baseUrl: origin,
        authentication: "scoped-bearer-or-supabase-session",
      },
      mcp: {
        url: `${origin}/api/mcp`,
        transport: "streamable-http",
        authentication: "scoped-bearer",
      },
    },
    keeperHub: {
      executionMode: "direct-execution-api",
      callbackMode: "workflow-send-webhook",
      observerEndpoint: `${origin}/api/integrations/keeperhub/events`,
      observerEvent: "keeperhub.execution.observe",
      callbackAuthentication: "finaltab-scoped-bearer",
      chainId: 84532,
      contract: {
        name: "FinalTabBatchSettlementV2",
        version: "2",
        address: contractAddress,
        ready: contractAddress !== null,
      },
      proofPolicy: "keeperhub-terminal-success-plus-independent-base-sepolia-receipt-and-exact-v2-settlement-binding",
    },
    limitations: [
      "This is a FINALTab-owned discovery document, not a KeeperHub-native application-manifest standard.",
      "No cross-origin iframe allowlist is declared; integrate through the API, MCP, workflow template, or deep link.",
      "Hub or Marketplace publication requires a KeeperHub organization owner to import, test, enable, and publish the workflow.",
    ],
  };
}

export function buildKeeperHubWorkflow(origin: string) {
  return {
    version: 1,
    exportedAt: "2026-08-11T00:00:00.000Z",
    workflow: {
      name: "FINALTab proof observer bridge",
      description:
        "Receive a KeeperHub executionId plus the expected settlementId and ledgerHash, then ask FINALTab to re-fetch and independently verify that exact V2 plan. Read-only; never broadcasts a transaction.",
    },
    nodes: [
      {
        id: "trigger",
        type: "trigger",
        position: { x: 100, y: 200 },
        data: {
          type: "trigger",
          label: "Webhook",
          config: { triggerType: "Webhook" },
        },
      },
      {
        id: "observe-finaltab-proof",
        type: "action",
        position: { x: 420, y: 200 },
        data: {
          type: "action",
          label: "Verify with FINALTab",
          config: {
            actionType: "webhook/send-webhook",
            webhookUrl: `${origin}/api/integrations/keeperhub/events`,
            webhookMethod: "POST",
            webhookHeaders: JSON.stringify({
              "Content-Type": "application/json",
              Authorization: "Bearer REPLACE_WITH_FINALTAB_SCOPED_TOKEN",
            }),
            webhookPayload: JSON.stringify({
              event: "keeperhub.execution.observe",
              executionId: "{{Webhook.input.executionId}}",
              settlementId: "{{Webhook.input.settlementId}}",
              ledgerHash: "{{Webhook.input.ledgerHash}}",
            }),
          },
        },
      },
    ],
    edges: [{ id: "trigger-to-observer", source: "trigger", target: "observe-finaltab-proof" }],
    integrationBindings: [],
  };
}

export function buildFinalTabOpenApi(origin: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "FINALTab Integration API",
      version: "2.0.0-testnet",
      description:
        "Authenticated receipt, allocation, configuration-gated voice, V2 settlement, proof, and KeeperHub observer surfaces. Money movement is Base Sepolia testnet only.",
      license: { name: "MIT", identifier: "MIT" },
    },
    servers: [{ url: origin }],
    security: [{ FinalTabBearer: [] }],
    tags: [
      { name: "Discovery" },
      { name: "Receipts" },
      { name: "Voice" },
      { name: "Settlement" },
      { name: "KeeperHub" },
    ],
    paths: {
      "/.well-known/finaltab.json": {
        get: {
          tags: ["Discovery"],
          operationId: "getFinalTabDiscovery",
          security: [],
          responses: { "200": { description: "FINALTab-owned integration discovery document" } },
        },
      },
      "/integrations/keeperhub/workflow": {
        get: {
          tags: ["Discovery", "KeeperHub"],
          operationId: "downloadKeeperHubWorkflow",
          security: [],
          responses: { "200": { description: "KeeperHub workflow export schema v1 JSON" } },
        },
      },
      "/api/vision/extract": {
        post: {
          tags: ["Receipts"],
          operationId: "extractReceipt",
          description: "Extract a receipt image with the configured server-side vision provider; arithmetic is checked deterministically.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["imageDataUrl"],
                  properties: {
                    imageDataUrl: {
                      type: "string",
                      pattern: "^data:image/(png|jpeg|jpg|webp);base64,",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Extracted receipt plus arithmetic findings" },
            "401": { $ref: "#/components/responses/authError" },
            "501": { description: "No vision provider is configured" },
          },
        },
      },
      "/api/vision/allocate": {
        post: {
          tags: ["Receipts"],
          operationId: "allocateReceipt",
          description: "Turn a natural-language allocation proposal into deterministic, cent-perfect shares.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object" } } },
          },
          responses: {
            "200": { description: "Reconciled allocation" },
            "401": { $ref: "#/components/responses/authError" },
            "422": { description: "Proposal cannot be reconciled" },
          },
        },
      },
      "/api/voice/token": {
        post: {
          tags: ["Voice"],
          operationId: "createVoiceTranscriptionSession",
          description:
            "Configuration-gated AssemblyAI live speech-to-text session bootstrap. Requires a signed-in Supabase user (same-origin cookie session or validated Supabase bearer JWT) whose effective scopes include receipts:write; opaque FINALTab API tokens are rejected. The route binds the verified Supabase user ID to a service-role-only durable budget reservation before any provider call. Accepts no request body. Returns a short-lived browser redemption credential plus constrained streaming settings; permanent provider and Supabase server keys stay server-side. This contract does not assert that a deployment has the provider configured.",
          "x-finaltab-required-scope": "receipts:write",
          "x-finaltab-configuration-gated": true,
          "x-finaltab-authenticated-user-required": true,
          "x-finaltab-accepted-authentication": ["same-origin-supabase-cookie-session", "supabase-bearer-jwt"],
          "x-finaltab-opaque-bearer-accepted": false,
          "x-finaltab-durable-quota": {
            backend: "supabase-postgres-rpc",
            identity: "route-verified-supabase-user-id",
            databaseExecutionRole: "service_role_only",
            limit: 8,
            capability: "transcription",
            window: "fixed-database-minute",
          },
          "x-finaltab-durable-budget": {
            reservation: "before-provider-token-mint",
            unit: "seconds",
            reservedPerRequest: 180,
            user: { daily: 720, monthly: 3600 },
            project: { daily: 3600, monthly: 18000 },
            concurrency: { user: 1, project: 4, leaseSeconds: 240 },
            windows: "utc-calendar-day-and-month",
          },
          responses: {
            "200": {
              description: "Short-lived AssemblyAI live-transcription session settings",
              headers: VOICE_QUOTA_RESPONSE_HEADERS,
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/voiceStreamingSession" },
                },
              },
            },
            "400": { description: "A request body was supplied; this endpoint accepts no body" },
            "401": { $ref: "#/components/responses/authError" },
            "403": { description: "A Supabase user session/JWT is required, receipts:write is missing, or the session origin was rejected; opaque FINALTab API tokens cannot invoke paid voice" },
            "413": { description: "A non-empty request body was declared" },
            "429": { description: "Per-minute quota, user/project spend budget, or AssemblyAI concurrency lease exceeded", headers: VOICE_QUOTA_RESPONSE_HEADERS },
            "501": { description: "AssemblyAI transcription is not configured on the server", headers: VOICE_QUOTA_RESPONSE_HEADERS },
            "502": { description: "AssemblyAI rejected or returned an invalid/unavailable session response", headers: VOICE_QUOTA_RESPONSE_HEADERS },
            "503": { description: "Durable budget storage is unavailable before token mint, or AssemblyAI rate-limited session creation", headers: VOICE_QUOTA_RESPONSE_HEADERS },
          },
        },
      },
      "/api/voice/speak": {
        post: {
          tags: ["Voice"],
          operationId: "streamVoiceReadback",
          description:
            "Configuration-gated ElevenLabs spoken readback for short product confirmations. Requires a signed-in Supabase user (same-origin cookie session or validated Supabase bearer JWT) whose effective scopes include tabs:read; opaque FINALTab API tokens are rejected. The route binds the verified Supabase user ID to a service-role-only durable budget reservation before any provider call. Returns uncached MP3 audio; the current browser client buffers the short clip before playback. Permanent provider and Supabase server keys stay server-side. This interactive readback is separate from the submission video's prerecorded narration, which uses ElevenLabs only.",
          "x-finaltab-required-scope": "tabs:read",
          "x-finaltab-configuration-gated": true,
          "x-finaltab-authenticated-user-required": true,
          "x-finaltab-accepted-authentication": ["same-origin-supabase-cookie-session", "supabase-bearer-jwt"],
          "x-finaltab-opaque-bearer-accepted": false,
          "x-finaltab-durable-quota": {
            backend: "supabase-postgres-rpc",
            identity: "route-verified-supabase-user-id",
            databaseExecutionRole: "service_role_only",
            limit: 20,
            capability: "readback",
            window: "fixed-database-minute",
          },
          "x-finaltab-durable-budget": {
            reservation: "before-provider-request",
            unit: "characters",
            reservedPerRequest: "normalized-text-length-1-to-600",
            user: { daily: 2400, monthly: 12000 },
            project: { daily: 12000, monthly: 60000 },
            windows: "utc-calendar-day-and-month",
          },
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/voiceSpeakRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "ElevenLabs MP3 spoken readback",
              headers: VOICE_QUOTA_RESPONSE_HEADERS,
              content: {
                "audio/mpeg": {
                  schema: { type: "string", format: "binary" },
                },
              },
            },
            "400": { description: "Missing or invalid readback text" },
            "401": { $ref: "#/components/responses/authError" },
            "403": { description: "A Supabase user session/JWT is required, tabs:read is missing, or the session origin was rejected; opaque FINALTab API tokens cannot invoke paid voice" },
            "413": { description: "JSON body exceeds 2,048 bytes" },
            "429": { description: "Per-minute quota or user/project character budget exceeded", headers: VOICE_QUOTA_RESPONSE_HEADERS },
            "501": { description: "ElevenLabs readback is not configured on the server", headers: VOICE_QUOTA_RESPONSE_HEADERS },
            "502": { description: "ElevenLabs rejected or returned invalid/unavailable audio", headers: VOICE_QUOTA_RESPONSE_HEADERS },
            "503": { description: "Durable budget storage is unavailable before the provider call, or ElevenLabs rate-limited readback generation", headers: VOICE_QUOTA_RESPONSE_HEADERS },
          },
        },
      },
      "/api/settle/simulate": {
        post: {
          tags: ["Settlement", "KeeperHub"],
          operationId: "simulateV2Settlement",
          description: "Simulate the exact V2 plan-bound settlement through KeeperHub without broadcasting.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: SETTLEMENT_REQUEST_SCHEMA } },
          },
          responses: {
            "200": { description: "Simulation passed" },
            "409": { description: "Simulation would revert; nothing was broadcast" },
            "501": { description: "KeeperHub or the V2 contract address is not configured" },
          },
        },
      },
      "/api/settle/execute": {
        post: {
          tags: ["Settlement", "KeeperHub"],
          operationId: "executeV2Settlement",
          description:
            "Verify a principal-bound, short-lived debtor-wallet EIP-191 approval, durably prepare and simulate a new exact V2 plan, then submit through KeeperHub with deterministic idempotency. A prepared crash-recovery retry reuses the stored successful simulation and still requires a valid approval; V2 settlement state prevents duplicate settlement.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["signedSettlement", "approval"],
                  properties: {
                    signedSettlement: SETTLEMENT_REQUEST_SCHEMA,
                    approval: { $ref: "#/components/schemas/broadcastApproval" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "KeeperHub accepted the execution" },
            "409": { description: "Pre-broadcast simulation would revert" },
            "501": { description: "KeeperHub or the V2 contract address is not configured" },
          },
        },
      },
      "/api/settle/approval": {
        post: {
          tags: ["Settlement", "KeeperHub"],
          operationId: "createV2BroadcastApprovalChallenge",
          description:
            "Create a short-lived EIP-191 message bound to the authenticated principal, exact V2 contract, settlementId, ledgerHash, and debtor approver. This never broadcasts.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["settlementId", "ledgerHash", "approver"],
                  properties: {
                    settlementId: { $ref: "#/components/schemas/bytes32" },
                    ledgerHash: { $ref: "#/components/schemas/bytes32" },
                    approver: { $ref: "#/components/schemas/address" },
                    ttlSeconds: { type: "integer", minimum: 60, maximum: 900 },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Exact message and unsigned approval artifact" },
            "403": { description: "Submission scope is unavailable" },
            "501": { description: "The V2 contract is not configured" },
          },
        },
      },
      "/api/settle/status/{id}": {
        get: {
          tags: ["Settlement", "KeeperHub"],
          operationId: "getSettlementProof",
          description:
            "Fetch KeeperHub status and downgrade any claimed success that fails independent Base Sepolia receipt plus exact indexed settlementId and ledgerHash verification.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", pattern: "^[A-Za-z0-9_-]{6,128}$" },
            },
            {
              name: "settlementId",
              in: "query",
              required: true,
              schema: { $ref: "#/components/schemas/bytes32" },
            },
            {
              name: "ledgerHash",
              in: "query",
              required: true,
              schema: { $ref: "#/components/schemas/bytes32" },
            },
          ],
          responses: { "200": { description: "Fail-closed execution proof" } },
        },
      },
      "/api/integrations/keeperhub/events": {
        post: {
          tags: ["KeeperHub"],
          operationId: "observeKeeperHubExecution",
          description:
            "Read-only wake-up endpoint for KeeperHub Send Webhook. The payload is never treated as proof; FINALTab re-fetches KeeperHub and independently verifies the chain.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["event", "executionId", "settlementId", "ledgerHash"],
                  properties: {
                    event: { const: "keeperhub.execution.observe" },
                    executionId: { type: "string", pattern: "^[A-Za-z0-9_-]{6,128}$" },
                    settlementId: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" },
                    ledgerHash: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Terminal execution observed" },
            "202": { description: "Execution is still non-terminal" },
            "401": { $ref: "#/components/responses/authError" },
          },
        },
      },
    },
    components: {
      schemas: {
        address: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
        bytes32: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" },
        uintString: { type: "string", pattern: "^[0-9]+$" },
        voiceStreamingSession: {
          type: "object",
          additionalProperties: false,
          required: [
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
          ],
          properties: {
            token: {
              type: "string",
              minLength: 20,
              maxLength: 8192,
              description:
                "Short-lived AssemblyAI redemption credential. This is not the permanent provider API key.",
            },
            expiresInSeconds: { type: "integer", minimum: 1, maximum: 600 },
            maxSessionDurationSeconds: { type: "integer", const: 180 },
            websocketUrl: {
              type: "string",
              pattern: "^wss://",
              description: "Constrained AssemblyAI streaming URL; the browser appends only the short-lived token.",
            },
            sampleRate: { type: "integer", const: 16000 },
            encoding: { type: "string", const: "pcm_s16le" },
            model: { type: "string", const: "universal-3-5-pro" },
            mode: { type: "string", const: "balanced" },
            languageDetection: { type: "boolean", const: true },
            keyterms: { type: "array", items: { type: "string" } },
            voiceFocus: { type: "string", const: "far-field" },
          },
        },
        voiceSpeakRequest: {
          type: "object",
          additionalProperties: false,
          required: ["text"],
          properties: {
            text: {
              type: "string",
              minLength: 1,
              maxLength: 600,
              pattern: "\\S",
              description: "Readback text; FINALTab trims it before enforcing the 1-600 character bound.",
            },
          },
        },
        signedDebit: {
          type: "object",
          additionalProperties: false,
          required: [
            "from",
            "to",
            "value",
            "validAfter",
            "validBefore",
            "nonce",
            "authV",
            "authR",
            "authS",
            "consentV",
            "consentR",
            "consentS",
          ],
          properties: {
            from: { $ref: "#/components/schemas/address" },
            to: { $ref: "#/components/schemas/address" },
            value: { type: "string", pattern: "^[1-9][0-9]*$" },
            validAfter: { $ref: "#/components/schemas/uintString" },
            validBefore: { $ref: "#/components/schemas/uintString" },
            nonce: { $ref: "#/components/schemas/bytes32" },
            authV: { type: "integer", enum: [27, 28] },
            authR: { $ref: "#/components/schemas/bytes32" },
            authS: { $ref: "#/components/schemas/bytes32" },
            consentV: { type: "integer", enum: [27, 28] },
            consentR: { $ref: "#/components/schemas/bytes32" },
            consentS: { $ref: "#/components/schemas/bytes32" },
          },
        },
        payout: {
          type: "object",
          additionalProperties: false,
          required: ["creditor", "value"],
          properties: {
            creditor: { $ref: "#/components/schemas/address" },
            value: { type: "string", pattern: "^[1-9][0-9]*$" },
          },
        },
        broadcastApproval: {
          type: "object",
          additionalProperties: false,
          required: [
            "version",
            "approvalId",
            "principalSubject",
            "approver",
            "chainId",
            "contractAddress",
            "settlementId",
            "ledgerHash",
            "issuedAt",
            "expiresAt",
            "signature",
          ],
          properties: {
            version: { type: "integer", const: 1 },
            approvalId: { type: "string", format: "uuid" },
            principalSubject: { type: "string", minLength: 1, maxLength: 200 },
            approver: { $ref: "#/components/schemas/address" },
            chainId: { type: "integer", const: 84532 },
            contractAddress: { $ref: "#/components/schemas/address" },
            settlementId: { $ref: "#/components/schemas/bytes32" },
            ledgerHash: { $ref: "#/components/schemas/bytes32" },
            issuedAt: { $ref: "#/components/schemas/uintString" },
            expiresAt: { $ref: "#/components/schemas/uintString" },
            signature: { type: "string", pattern: "^0x[0-9a-fA-F]{130}$" },
          },
        },
      },
      responses: {
        authError: {
          description: "A scoped FINALTab bearer token or authenticated session is required",
        },
      },
      securitySchemes: {
        FinalTabBearer: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "opaque-token-or-supabase-jwt",
          description:
            "Most API routes accept either a scoped opaque FINALTab token (only its SHA-256 digest is stored) or a validated Supabase access JWT. Paid voice routes explicitly require Supabase user identity and reject opaque FINALTab tokens.",
        },
      },
    },
    "x-finaltab-mcp": {
      url: `${origin}/api/mcp`,
      transport: "streamable-http",
      authentication: "FinalTabBearer",
    },
    "x-finaltab-voice": {
      configurationGated: true,
      authentication: {
        requiredIdentity: "supabase-auth-uid",
        accepted: ["same-origin-supabase-cookie-session", "supabase-bearer-jwt"],
        opaqueFinalTabBearerAccepted: false,
      },
      durableQuota: {
        backend: "supabase-postgres-rpc",
        function: "reserve_voice_budget_service(uuid, text, bigint)",
        identity: "route-verified-supabase-user-id",
        databaseExecutionRole: "service_role_only",
        window: "fixed-database-minute",
        limitsPerMinute: { transcriptionSessions: 8, readbacks: 20 },
        budgets: {
          transcriptionSeconds: {
            user: { daily: 720, monthly: 3600 },
            project: { daily: 3600, monthly: 18000 },
            reservedPerMint: 180,
          },
          readbackCharacters: {
            user: { daily: 2400, monthly: 12000 },
            project: { daily: 12000, monthly: 60000 },
          },
        },
        assemblyAIConcurrency: { user: 1, project: 4, leaseSeconds: 240 },
        failClosedBeforeProvider: true,
        responseHeaders: [
          "x-voice-ratelimit-remaining",
          "x-voice-ratelimit-reset",
          "x-voice-ratelimit-durable",
          "x-voice-budget-durable",
          "x-voice-budget-unit",
          "x-voice-budget-reserved-units",
          "x-voice-budget-user-day-remaining",
          "x-voice-budget-user-month-remaining",
        ],
      },
      transcription: {
        provider: "AssemblyAI",
        mode: "live-streaming-stt",
        route: `${origin}/api/voice/token`,
      },
      readback: {
        provider: "ElevenLabs",
        mode: "buffered-browser-audio-mpeg",
        route: `${origin}/api/voice/speak`,
      },
      permanentProviderKeys: "server-only",
      submissionNarrationProvider: "ElevenLabs-only",
      deploymentAvailability: "configuration-dependent-not-asserted",
    },
    "x-keeperhub": {
      mode: "direct-execution-api",
      chainId: 84532,
      contractVersion: "FinalTabBatchSettlementV2",
      workflowTemplate: `${origin}/integrations/keeperhub/workflow`,
    },
  };
}
