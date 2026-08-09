import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { once } from "node:events";

/**
 * Scripted fake KeeperHub server. Each route pops responses off a queue so tests
 * can script sequences (pending -> pending -> completed). Records every request
 * (method, path, headers, body) for assertions.
 */

export interface ScriptedResponse {
  status: number;
  headers?: Record<string, string>;
  body: unknown;
}

export interface RecordedRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

export class FakeKeeperHub {
  private server: Server | null = null;
  private routes = new Map<string, ScriptedResponse[]>();
  public requests: RecordedRequest[] = [];
  public url = "";

  script(method: string, path: string, responses: ScriptedResponse[]): void {
    this.routes.set(`${method} ${path}`, [...responses]);
  }

  async start(): Promise<string> {
    this.server = createServer((req, res) => void this.handle(req, res));
    this.server.listen(0, "127.0.0.1");
    await once(this.server, "listening");
    const addr = this.server.address();
    if (addr === null || typeof addr === "string") throw new Error("no address");
    this.url = `http://127.0.0.1:${addr.port}`;
    return this.url;
  }

  async stop(): Promise<void> {
    if (this.server) {
      this.server.close();
      await once(this.server, "close");
      this.server = null;
    }
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    let body: unknown = null;
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
    }
    const path = req.url ?? "/";
    this.requests.push({ method: req.method ?? "GET", path, headers: req.headers, body });

    const key = `${req.method} ${path}`;
    const queue = this.routes.get(key);
    if (!queue || queue.length === 0) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `fake server: no scripted response for ${key}` }));
      return;
    }
    const next = queue.length === 1 ? queue[0]! : queue.shift()!;
    res.writeHead(next.status, { "Content-Type": "application/json", ...(next.headers ?? {}) });
    res.end(JSON.stringify(next.body));
  }
}
