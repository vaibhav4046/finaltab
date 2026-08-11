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
        "Authenticated receipt, allocation, V2 settlement, proof, and KeeperHub observer surfaces. Money movement is Base Sepolia testnet only.",
      license: { name: "MIT", identifier: "MIT" },
    },
    servers: [{ url: origin }],
    security: [{ FinalTabBearer: [] }],
    tags: [
      { name: "Discovery" },
      { name: "Receipts" },
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
            "Verify a principal-bound, short-lived debtor-wallet EIP-191 approval, re-simulate, then submit the exact V2 plan through KeeperHub with deterministic idempotency. Approval may be retried until expiry; V2 settlement state prevents duplicate settlement.",
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
            "Use a scoped FINALTab token. Only its SHA-256 digest is stored in FINALTAB_API_TOKENS_JSON.",
        },
      },
    },
    "x-finaltab-mcp": {
      url: `${origin}/api/mcp`,
      transport: "streamable-http",
      authentication: "FinalTabBearer",
    },
    "x-keeperhub": {
      mode: "direct-execution-api",
      chainId: 84532,
      contractVersion: "FinalTabBatchSettlementV2",
      workflowTemplate: `${origin}/integrations/keeperhub/workflow`,
    },
  };
}
