import {
  KeeperHubError,
  SimulationRevertError,
  type ContractCallRequest,
  type ExecuteAccepted,
  type ExecutionStatusResponse,
  type KeeperHubErrorBody,
  type SimulateRevert,
  type SimulateSuccess,
  type TransferRequest,
} from "./types.js";

export interface KeeperHubClientOptions {
  baseUrl?: string;
  apiKey: string;
  /** injectable for tests */
  fetchImpl?: typeof fetch;
  /** injectable clock for tests */
  sleep?: (ms: number) => Promise<void>;
  /** hard cap on poll iterations to avoid infinite loops */
  maxPollAttempts?: number;
  /** used when server sends no X-Poll-Interval-Hint */
  defaultPollIntervalMs?: number;
}

const TERMINAL: ReadonlySet<string> = new Set(["completed", "failed", "cancelled"]);

export class KeeperHubClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxPollAttempts: number;
  private readonly defaultPollIntervalMs: number;

  constructor(opts: KeeperHubClientOptions) {
    if (!opts.apiKey) throw new Error("KeeperHubClient: apiKey required");
    this.baseUrl = (opts.baseUrl ?? "https://app.keeperhub.com").replace(/\/$/, "");
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.maxPollAttempts = opts.maxPollAttempts ?? 120;
    this.defaultPollIntervalMs = opts.defaultPollIntervalMs ?? 3000;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<{ status: number; json: unknown; headers: Headers }> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers(extraHeaders),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = { error: text };
      }
    }
    return { status: res.status, json, headers: res.headers };
  }

  /** Auth probe: 200 = valid org key, 401 = invalid. GET /api/chains is public — no credential signal. */
  async probeAuth(): Promise<{ ok: boolean; status: number }> {
    const { status } = await this.request("GET", "/api/keys");
    return { ok: status === 200, status };
  }

  async listChains(): Promise<Array<{ chainId: number; isEnabled: boolean; isTestnet: boolean; [k: string]: unknown }>> {
    const { status, json } = await this.request("GET", "/api/chains");
    if (status !== 200) throw new KeeperHubError(`GET /api/chains -> ${status}`, status, json as KeeperHubErrorBody);
    const arr = Array.isArray(json) ? json : ((json as Record<string, unknown>)?.chains as unknown[]);
    if (!Array.isArray(arr)) throw new KeeperHubError("Unexpected /api/chains shape", status, null);
    return arr as Array<{ chainId: number; isEnabled: boolean; isTestnet: boolean }>;
  }

  /**
   * Simulate. Returns success detail or THROWS SimulationRevertError.
   * Would-revert answers arrive as HTTP 400 with wouldRevert:true — read wouldRevert
   * BEFORE classifying the 400 as a plain error.
   */
  private async simulate(path: string, body: Record<string, unknown>): Promise<SimulateSuccess> {
    const { status, json } = await this.request("POST", path, { ...body, simulate: true });
    const obj = (json ?? {}) as Record<string, unknown>;
    if (obj.wouldRevert === true) {
      const detail = obj as unknown as SimulateRevert;
      throw new SimulationRevertError(
        `Simulation would revert: ${detail.revertReason ?? detail.code ?? "unknown reason"}`,
        detail,
      );
    }
    if (status >= 400) {
      throw new KeeperHubError(`POST ${path} (simulate) -> ${status}`, status, obj as KeeperHubErrorBody);
    }
    if (obj.success !== true) {
      throw new KeeperHubError(`Simulation did not return success:true`, status, obj as KeeperHubErrorBody);
    }
    return obj as unknown as SimulateSuccess;
  }

  simulateTransfer(req: TransferRequest): Promise<SimulateSuccess> {
    return this.simulate("/api/execute/transfer", req as unknown as Record<string, unknown>);
  }

  simulateContractCall(req: ContractCallRequest): Promise<SimulateSuccess> {
    return this.simulate("/api/execute/contract-call", req as unknown as Record<string, unknown>);
  }

  /**
   * Broadcast once with Idempotency-Key. Handles documented 409s:
   * - idempotency_conflict with originalExecutionId -> that IS the answer, return it for polling
   * - idempotency_conflict with null originalExecutionId -> caller must canonicalize + retry same key
   * - idempotency_in_progress -> brief wait, retry (bounded)
   */
  private async execute(path: string, body: Record<string, unknown>, idempotencyKey: string): Promise<ExecuteAccepted> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { status, json } = await this.request("POST", path, body, { "Idempotency-Key": idempotencyKey });
      const obj = (json ?? {}) as Record<string, unknown>;
      if (status === 409) {
        const code = obj.code ?? obj.error;
        if (code === "idempotency_in_progress") {
          await this.sleep(1000);
          continue;
        }
        if (code === "idempotency_conflict") {
          const orig = obj.originalExecutionId;
          if (typeof orig === "string" && orig) {
            return { executionId: orig, status: "pending", idempotentReplay: true };
          }
          throw new KeeperHubError(
            "idempotency_conflict with null originalExecutionId — canonicalize request body and retry with same key",
            status,
            obj as KeeperHubErrorBody,
          );
        }
      }
      if (status >= 400) {
        throw new KeeperHubError(`POST ${path} -> ${status}`, status, obj as KeeperHubErrorBody);
      }
      const executionId = obj.executionId;
      if (typeof executionId !== "string" || !executionId) {
        throw new KeeperHubError("Execute response missing executionId", status, obj as KeeperHubErrorBody);
      }
      return obj as unknown as ExecuteAccepted;
    }
    throw new KeeperHubError("idempotency_in_progress persisted after retries", 409, null);
  }

  executeTransfer(req: TransferRequest, idempotencyKey: string): Promise<ExecuteAccepted> {
    return this.execute("/api/execute/transfer", req as unknown as Record<string, unknown>, idempotencyKey);
  }

  executeContractCall(req: ContractCallRequest, idempotencyKey: string): Promise<ExecuteAccepted> {
    return this.execute("/api/execute/contract-call", req as unknown as Record<string, unknown>, idempotencyKey);
  }

  /** Single status fetch. Honors 429 Retry-After by throwing a retryable marker the poller catches. */
  async getStatus(executionId: string): Promise<{ body: ExecutionStatusResponse; pollHintMs: number | null }> {
    const { status, json, headers } = await this.request("GET", `/api/execute/${executionId}/status`);
    if (status === 429) {
      const retryAfter = Number(headers.get("Retry-After") ?? "5");
      throw new RateLimited(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 5000);
    }
    if (status >= 400) {
      throw new KeeperHubError(`GET status -> ${status}`, status, json as KeeperHubErrorBody);
    }
    const hintRaw = headers.get("X-Poll-Interval-Hint");
    const hint = hintRaw === null ? null : Number(hintRaw);
    return {
      body: json as ExecutionStatusResponse,
      pollHintMs: hint === null || !Number.isFinite(hint) ? null : hint * 1000,
    };
  }

  /**
   * Poll until terminal. Honors X-Poll-Interval-Hint (0 = terminal, stop),
   * 429 Retry-After, and the status field. Never spins faster than the server asks.
   */
  async pollUntilTerminal(executionId: string): Promise<ExecutionStatusResponse> {
    let last: ExecutionStatusResponse | null = null;
    for (let i = 0; i < this.maxPollAttempts; i++) {
      let res: { body: ExecutionStatusResponse; pollHintMs: number | null };
      try {
        res = await this.getStatus(executionId);
      } catch (e) {
        if (e instanceof RateLimited) {
          await this.sleep(e.retryAfterMs);
          continue;
        }
        throw e;
      }
      last = res.body;
      if (TERMINAL.has(res.body.status) || res.pollHintMs === 0) {
        return res.body;
      }
      await this.sleep(res.pollHintMs ?? this.defaultPollIntervalMs);
    }
    throw new PollTimeout(executionId, last);
  }
}

export class RateLimited extends Error {
  constructor(public readonly retryAfterMs: number) {
    super(`Rate limited; retry after ${retryAfterMs}ms`);
    this.name = "RateLimited";
  }
}

export class PollTimeout extends Error {
  constructor(
    public readonly executionId: string,
    public readonly lastStatus: ExecutionStatusResponse | null,
  ) {
    super(`Polling ${executionId} did not reach a terminal state within the attempt budget`);
    this.name = "PollTimeout";
  }
}
