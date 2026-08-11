import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, mkdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const requireFromWeb = createRequire(path.join(repoRoot, "apps", "web", "package.json"));
const { chromium } = requireFromWeb("@playwright/test");
const videoRoot = path.join(repoRoot, "video", "finaltab-winner");
const captureDir = path.join(videoRoot, "assets", "capture");
const workDir = path.join(repoRoot, "proof-output", "video-evidence-capture");
const tokenFile = path.join(repoRoot, "proof-output", "finaltab-mcp-token.local.json");
const retainedFile = path.join(repoRoot, "proof-output", "v2-live-settlement-2026-08-11T04-28-59-530Z.json");
const releaseProofFile = path.join(videoRoot, "data", "release-proof.json");

const endpoint = "https://finaltab.vercel.app/api/mcp";
const developersUrl = "https://finaltab.vercel.app/developers";
const rpcUrl = "https://sepolia.base.org";
const expectedTools = [
  "split_equal",
  "split_weighted",
  "net_debts",
  "allocate_receipt",
  "prepare_receipt_settlement",
  "simulate_signed_settlement",
  "create_broadcast_approval_challenge",
  "submit_signed_settlement",
  "settlement_status",
];

const WIDTH = 3840;
const HEIGHT = 2160;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function short(value, head = 10, tail = 8) {
  const text = String(value);
  return text.length <= head + tail + 1 ? text : `${text.slice(0, head)}…${text.slice(-tail)}`;
}

function decimalHex(value) {
  return Number.parseInt(value, 16);
}

function parseSseJson(text) {
  const payloads = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  invariant(payloads.length > 0, "MCP response did not contain an SSE data payload");
  return payloads.at(-1);
}

function toolStructured(response) {
  const result = response?.payload?.result;
  invariant(result && !result.isError, `MCP tool call ${response.label} failed`);
  if (result.structuredContent) return result.structuredContent;
  const text = result.content?.find((item) => item.type === "text")?.text;
  invariant(text, `MCP tool call ${response.label} returned no structured content`);
  return JSON.parse(text);
}

async function mcpRequest(token, id, method, params, label) {
  const startedAt = new Date().toISOString();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }),
  });
  const body = await response.text();
  invariant(response.ok, `${label} returned HTTP ${response.status}`);
  const payload = parseSseJson(body);
  invariant(payload?.id === id, `${label} returned an unexpected JSON-RPC id`);
  invariant(!payload.error, `${label} returned JSON-RPC error ${JSON.stringify(payload.error)}`);
  return {
    label,
    startedAt,
    completedAt: new Date().toISOString(),
    status: response.status,
    contentType: response.headers.get("content-type"),
    payload,
  };
}

function baseStyles() {
  return `
    @font-face { font-family: "CaptureMono"; src: local("Cascadia Mono"), local("Consolas"); }
    :root {
      --canvas:#050807; --surface:#0a100e; --surface2:#0d1713; --line:#21352c;
      --paper:#f2f8f4; --muted:#9eb3a7; --green:#5cff9d; --green2:#28d978;
      --blue:#56b8ff; --amber:#ffd479; --red:#ff7f88;
    }
    * { box-sizing:border-box; }
    html, body { width:${WIDTH}px; height:${HEIGHT}px; margin:0; overflow:hidden; }
    body {
      color:var(--paper); background:
        radial-gradient(circle at 86% 2%, rgba(35,157,255,.17), transparent 34%),
        radial-gradient(circle at 7% 88%, rgba(42,238,127,.13), transparent 37%),
        var(--canvas);
      font-family: Inter, "Segoe UI", Arial, sans-serif;
    }
    body::before {
      content:""; position:absolute; inset:0; pointer-events:none; opacity:.22;
      background-image:linear-gradient(rgba(92,255,157,.08) 1px, transparent 1px),linear-gradient(90deg,rgba(86,184,255,.06) 1px,transparent 1px);
      background-size:96px 96px;
      mask-image:linear-gradient(to bottom,rgba(0,0,0,.8),transparent 82%);
    }
    .frame { position:relative; width:100%; height:100%; padding:128px 150px 104px; display:flex; flex-direction:column; }
    .topbar { display:flex; align-items:center; justify-content:space-between; gap:40px; }
    .brand { font-size:42px; font-weight:760; letter-spacing:-.045em; }
    .brand span { color:var(--green); }
    .source { max-width:2350px; text-align:right; color:var(--muted); font:26px/1.35 CaptureMono,Consolas,monospace; text-transform:uppercase; letter-spacing:.07em; }
    .eyebrow { color:var(--green); font:28px/1.2 CaptureMono,Consolas,monospace; text-transform:uppercase; letter-spacing:.12em; }
    h1 { margin:36px 0 16px; max-width:3300px; font-size:112px; line-height:.98; letter-spacing:-.052em; }
    .lede { color:var(--muted); font-size:38px; line-height:1.42; max-width:3000px; }
    .grid { display:grid; gap:34px; flex:1; min-height:0; margin-top:66px; }
    .grid.two { grid-template-columns:1fr 1fr; }
    .grid.wide-left { grid-template-columns:1.12fr .88fr; }
    .panel { position:relative; overflow:hidden; border:2px solid var(--line); border-radius:30px; background:linear-gradient(145deg,rgba(15,25,21,.97),rgba(7,12,10,.94)); padding:42px 46px; box-shadow:0 34px 90px rgba(0,0,0,.3); }
    .panel::before { content:""; position:absolute; inset:0 auto auto 0; width:100%; height:3px; background:linear-gradient(90deg,var(--green),var(--blue),transparent 80%); opacity:.9; }
    .label { color:var(--muted); font:24px/1.2 CaptureMono,Consolas,monospace; text-transform:uppercase; letter-spacing:.1em; }
    .panel h2 { margin:18px 0 30px; font-size:52px; letter-spacing:-.03em; }
    .row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:26px; align-items:start; border-top:1px solid rgba(158,179,167,.17); padding:24px 0; }
    .row:first-of-type { border-top:0; }
    .row .k { color:var(--muted); font-size:29px; line-height:1.35; }
    .row .v { text-align:right; font:700 30px/1.35 CaptureMono,Consolas,monospace; }
    .ok { color:var(--green); } .info { color:var(--blue); } .warn { color:var(--amber); }
    .hash { margin-top:22px; padding:24px 26px; border:1px solid rgba(86,184,255,.25); border-radius:20px; background:rgba(1,7,10,.68); }
    .hash .k { color:var(--muted); font:22px/1.2 CaptureMono,Consolas,monospace; text-transform:uppercase; letter-spacing:.09em; }
    .hash code { display:block; margin-top:13px; color:var(--paper); font:27px/1.5 CaptureMono,Consolas,monospace; word-break:break-all; }
    .banner { margin-top:34px; display:flex; align-items:center; justify-content:space-between; gap:30px; border:2px solid rgba(92,255,157,.5); border-radius:22px; padding:24px 30px; background:rgba(23,92,55,.18); }
    .banner strong { color:var(--green); font:32px/1.25 CaptureMono,Consolas,monospace; letter-spacing:.03em; }
    .banner span { color:var(--muted); font-size:27px; }
    .footer { display:flex; justify-content:space-between; gap:30px; align-items:flex-end; margin-top:38px; color:#758d80; font:22px/1.35 CaptureMono,Consolas,monospace; }
    .footer .right { text-align:right; }
    .pill { display:inline-flex; align-items:center; gap:12px; border:1px solid rgba(92,255,157,.38); border-radius:999px; padding:11px 19px; color:var(--green); background:rgba(92,255,157,.08); font:24px/1 CaptureMono,Consolas,monospace; }
    .pill::before { content:""; width:11px; height:11px; border-radius:50%; background:currentColor; box-shadow:0 0 20px currentColor; }
    .tools { display:grid; grid-template-columns:1fr 1fr; gap:13px; margin-top:24px; }
    .tool { display:flex; justify-content:space-between; align-items:center; gap:24px; min-width:0; border:1px solid rgba(158,179,167,.17); border-radius:14px; padding:15px 18px; background:rgba(5,8,7,.7); }
    .tool code { overflow:hidden; text-overflow:ellipsis; color:var(--paper); font:22px/1.25 CaptureMono,Consolas,monospace; }
    .tool b { color:var(--green); font:19px/1 CaptureMono,Consolas,monospace; }
    .terminal { background:#040706; border-color:#2a4939; }
    .terminal-head { display:flex; justify-content:space-between; gap:30px; align-items:center; padding-bottom:25px; border-bottom:1px solid rgba(158,179,167,.17); }
    .dots { display:flex; gap:12px; }.dots i{width:16px;height:16px;border-radius:50%;background:#31473c}.dots i:nth-child(1){background:#ff7f88}.dots i:nth-child(2){background:#ffd479}.dots i:nth-child(3){background:#5cff9d}
    .terminal-body { margin-top:28px; color:#d8e5dd; font:25px/1.48 CaptureMono,Consolas,monospace; }
    .prompt { color:var(--green); }.dim { color:#789184; }.blue { color:var(--blue); }
    .proofmark { font:800 86px/1 CaptureMono,Consolas,monospace; letter-spacing:-.045em; color:var(--green); text-shadow:0 0 40px rgba(92,255,157,.23); }
    .page-shot { width:100%; height:100%; object-fit:cover; object-position:top center; border-radius:20px; border:1px solid rgba(158,179,167,.25); }
    .source-chip { position:absolute; left:58px; bottom:54px; padding:15px 20px; border-radius:13px; background:rgba(3,7,6,.92); border:1px solid rgba(92,255,157,.35); color:var(--green); font:21px/1.2 CaptureMono,Consolas,monospace; }
  `;
}

function pageDocument(body, extraStyles = "") {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${baseStyles()}${extraStyles}</style></head><body>${body}</body></html>`;
}

function shell({ eyebrow, title, lede, source, content, footerLeft, footerRight }) {
  return `<main class="frame">
    <div class="topbar"><div class="brand">FINAL<span>Tab</span></div><div class="source">${escapeHtml(source)}</div></div>
    <div class="eyebrow">${escapeHtml(eyebrow)}</div>
    <h1>${title}</h1>
    <div class="lede">${lede}</div>
    ${content}
    <div class="footer"><div>${footerLeft}</div><div class="right">${footerRight}</div></div>
  </main>`;
}

function signaturePanel(title, check, digestMatchText = "Signer recovered") {
  return `<section class="panel">
    <div class="label">Signed payload verification</div><h2>${escapeHtml(title)}</h2>
    <div class="row"><div class="k">Signature recovery</div><div class="v ok">VERIFIED</div></div>
    <div class="row"><div class="k">Recovered signer</div><div class="v info">${escapeHtml(short(check.recoveredSigner, 12, 10))}</div></div>
    <div class="row"><div class="k">${escapeHtml(digestMatchText)}</div><div class="v ok">${check.digestMatchesContract === false ? "NO" : "YES"}</div></div>
    <div class="hash"><div class="k">Digest · public verification field</div><code>${escapeHtml(check.digest)}</code></div>
  </section>`;
}

async function screenshotHtml(page, html, outputPath) {
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({ path: outputPath, type: "png" });
}

function stageRail(active) {
  const stages = ["initialize", "tools/list", "allocate_receipt", "prepare_receipt_settlement", "create_broadcast_approval_challenge", "HARD STOP"];
  return `<div class="stage-rail">${stages.map((stage, index) => {
    const state = index < active ? "done" : index === active ? "active" : "future";
    return `<div class="stage ${state}"><b>${String(index + 1).padStart(2, "0")}</b><span>${escapeHtml(stage)}</span></div>`;
  }).join("")}</div>`;
}

function mcpStageDocument({ active, title, subtitle, responseHtml, timestamp }) {
  const extra = `
    .frame{padding:92px 118px 76px}.eyebrow{margin-top:32px}h1{font-size:86px;margin-top:24px}.lede{font-size:31px}
    .stage-layout{display:grid;grid-template-columns:820px 1fr;gap:34px;flex:1;min-height:0;margin-top:44px}
    .stage-rail{display:flex;flex-direction:column;gap:14px}.stage{display:grid;grid-template-columns:72px 1fr;gap:18px;align-items:center;padding:22px 24px;border:1px solid rgba(158,179,167,.15);border-radius:16px;background:rgba(5,8,7,.62);color:#657b70;font:24px/1.25 CaptureMono,Consolas,monospace}.stage b{font-size:18px}.stage.done{color:#8ca599;border-color:rgba(92,255,157,.18)}.stage.done b{color:var(--green)}.stage.active{color:var(--paper);border-color:rgba(92,255,157,.65);background:linear-gradient(90deg,rgba(92,255,157,.13),rgba(86,184,255,.07));box-shadow:0 0 42px rgba(92,255,157,.08)}.stage.active b{color:var(--green)}
    .stage-output{padding:36px 40px}.stage-output h2{font-size:40px;margin:18px 0 22px}.stage-output .terminal-body{font-size:24px;line-height:1.44}.stage-output .hash code{font-size:24px}.stage-output .row{padding:17px 0}.stage-output .row .k{font-size:24px}.stage-output .row .v{font-size:24px}
    .hard-stop{display:flex;flex-direction:column;justify-content:center;height:100%;text-align:center}.hard-stop .proofmark{font-size:150px}.hard-stop p{font:34px/1.5 CaptureMono,Consolas,monospace;color:var(--muted)}.hard-stop strong{color:var(--green)}
    .footer{margin-top:26px}
  `;
  return pageDocument(shell({
    eyebrow: "LIVE CANONICAL MCP · NON-BROADCAST WITNESS",
    title,
    lede: subtitle,
    source: `FINALTab Release Witness 1.0 · ${endpoint}`,
    content: `<div class="stage-layout">${stageRail(active)}<section class="panel terminal stage-output">${responseHtml}</section></div>`,
    footerLeft: `<span class="pill">AUTHENTICATED · HEADER REDACTED</span>`,
    footerRight: `${escapeHtml(timestamp)} · Streamable HTTP · sanitized response fields only`,
  }), extra);
}

async function main() {
  await mkdir(captureDir, { recursive: true });
  await mkdir(workDir, { recursive: true });

  const tokenRecord = JSON.parse(await readFile(tokenFile, "utf8"));
  const token = tokenRecord.token;
  invariant(typeof token === "string" && token.startsWith("ft_"), "missing gitignored MCP token");

  const retained = JSON.parse(await readFile(retainedFile, "utf8"));
  const releaseProof = JSON.parse(await readFile(releaseProofFile, "utf8"));
  const settled = releaseProof.settlement;
  invariant(retained.result === "VERIFIED_SETTLED", "retained record is not VERIFIED_SETTLED");
  invariant(retained.onchain.transactionHash === settled.transactionHash, "retained/public transaction mismatch");
  invariant(retained.plan.settlementId === settled.settlementId, "retained/public settlement ID mismatch");
  invariant(retained.plan.ledgerHash === settled.ledgerHash, "retained/public ledger hash mismatch");

  const rpcResponse = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [settled.transactionHash] }),
  });
  invariant(rpcResponse.ok, `Base Sepolia RPC returned HTTP ${rpcResponse.status}`);
  const rpcPayload = await rpcResponse.json();
  const receipt = rpcPayload.result;
  invariant(receipt?.status === "0x1", "public receipt is not successful");
  invariant(decimalHex(receipt.blockNumber) === settled.blockNumber, "public receipt block mismatch");
  const settlementLog = receipt.logs.find((log) =>
    log.address.toLowerCase() === releaseProof.v2Contract.toLowerCase()
    && log.topics?.[1]?.toLowerCase() === settled.settlementId.toLowerCase()
    && log.topics?.[2]?.toLowerCase() === settled.ledgerHash.toLowerCase());
  invariant(settlementLog, "public receipt does not contain the matching V2 settlement event");

  const allocationArgs = {
    receipt: {
      id: "release-witness-c08a",
      currency: "USD",
      lines: [{ id: "table_total", label: "Caller-supplied receipt total", amountUsd: "54.01" }],
      statedTotalUsd: "54.01",
    },
    participants: [
      { id: "participant_a", name: "Participant A" },
      { id: "participant_b", name: "Participant B" },
    ],
    assignments: [{
      lineId: "table_total",
      weights: [
        { participantId: "participant_a", weight: 1 },
        { participantId: "participant_b", weight: 1 },
      ],
    }],
  };
  const prepareArgs = {
    ...allocationArgs,
    participants: [
      { id: "participant_a", name: "Participant A", address: settled.debtor },
      { id: "participant_b", name: "Participant B", address: settled.creditor },
    ],
    payerId: "participant_a",
  };

  // This is the complete live capture sequence. There is deliberately no signing,
  // simulation, submit call, status mutation, or value-moving request in this script.
  const initialize = await mcpRequest(token, 101, "initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "FINALTab Release Witness", version: "1.0.0" },
  }, "initialize");
  const toolsList = await mcpRequest(token, 102, "tools/list", {}, "tools/list");
  const liveTools = toolsList.payload.result.tools.map((tool) => tool.name);
  invariant(JSON.stringify(liveTools) === JSON.stringify(expectedTools), "live MCP tool list is not the locked nine-tool manifest");
  const allocate = await mcpRequest(token, 103, "tools/call", {
    name: "allocate_receipt",
    arguments: allocationArgs,
  }, "allocate_receipt");
  const allocated = toolStructured(allocate);
  invariant(allocated.total === "54.01" && allocated.sumsToTotal === true, "live allocation did not reconcile");
  const prepare = await mcpRequest(token, 104, "tools/call", {
    name: "prepare_receipt_settlement",
    arguments: prepareArgs,
  }, "prepare_receipt_settlement");
  const prepared = toolStructured(prepare);
  invariant(prepared.v2 === true && prepared.chainId === 84532, "live prepare did not return Base Sepolia V2");
  invariant(prepared.contract.toLowerCase() === releaseProof.v2Contract.toLowerCase(), "live prepare returned the wrong V2 contract");
  invariant(prepared.signatureRequests.length === 1, "live prepare returned an unexpected signature request count");
  const approver = prepared.signatureRequests[0].debtor;
  const challenge = await mcpRequest(token, 105, "tools/call", {
    name: "create_broadcast_approval_challenge",
    arguments: {
      settlementId: prepared.settlementId,
      ledgerHash: prepared.ledgerHash,
      approver,
      ttlSeconds: 120,
    },
  }, "create_broadcast_approval_challenge");
  const challenged = toolStructured(challenge);
  invariant(challenged.broadcast === false, "approval challenge unexpectedly reports a broadcast");
  invariant(challenged.signingMethod === "personal_sign / EIP-191", "approval challenge signing boundary changed");

  const sanitizedTrace = {
    initialize: {
      status: initialize.status,
      protocolVersion: initialize.payload.result.protocolVersion,
      serverInfo: initialize.payload.result.serverInfo,
      completedAt: initialize.completedAt,
    },
    toolsList: { status: toolsList.status, names: liveTools, completedAt: toolsList.completedAt },
    allocate: {
      status: allocate.status,
      receiptId: allocated.receiptId,
      total: allocated.total,
      shares: allocated.shares,
      sumsToTotal: allocated.sumsToTotal,
      completedAt: allocate.completedAt,
    },
    prepare: {
      status: prepare.status,
      chainId: prepared.chainId,
      contract: prepared.contract,
      settlementId: prepared.settlementId,
      ledgerHash: prepared.ledgerHash,
      signatureRequestCount: prepared.signatureRequests.length,
      completedAt: prepare.completedAt,
    },
    challenge: {
      status: challenge.status,
      approvalId: challenged.artifact.approvalId,
      chainId: challenged.artifact.chainId,
      contractAddress: challenged.artifact.contractAddress,
      settlementId: challenged.artifact.settlementId,
      ledgerHash: challenged.artifact.ledgerHash,
      issuedAt: challenged.artifact.issuedAt,
      expiresAt: challenged.artifact.expiresAt,
      broadcast: challenged.broadcast,
      signingMethod: challenged.signingMethod,
      completedAt: challenge.completedAt,
    },
  };
  const sanitizedText = JSON.stringify(sanitizedTrace);
  invariant(!sanitizedText.includes(token), "sanitized trace contains the MCP token");
  invariant(!sanitizedText.includes("principalSubject"), "sanitized trace contains the token principal");
  invariant(!sanitizedText.includes("@"), "sanitized trace contains an email-shaped value");

  const browser = await chromium.launch({ headless: true });
  try {
    const evidenceContext = await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 1,
      colorScheme: "dark",
      reducedMotion: "reduce",
    });
    const page = await evidenceContext.newPage();

    const c05 = pageDocument(shell({
      eyebrow: "C05 · DUAL CONSENT + PRE-BROADCAST SIMULATION",
      title: "Consent recovered.<br>Exact call simulated.",
      lede: "Sanitized evidence from the retained, single authorized Base Sepolia V2 settlement. No signature bytes are displayed and nothing is being re-signed or replayed.",
      source: "SOURCE · SANITIZED RETAINED PROOF RECORD · 2026-08-11",
      content: `<div class="grid two">
        ${signaturePanel("ReceiveWithAuthorization", retained.signatureChecks.receiveWithAuthorization)}
        ${signaturePanel("SettlementConsent", retained.signatureChecks.settlementConsent, "Digest matches V2 contract")}
      </div>
      <div class="banner"><strong>KEEPERHUB SIMULATION · HTTP ${retained.keeperHub.simulation.httpStatus} · SUCCESS TRUE · WOULD REVERT FALSE</strong><span>Gas estimate ${escapeHtml(retained.keeperHub.simulation.gasEstimate)} · occurred before the one authorized broadcast</span></div>
      <div class="banner"><strong>FINAL STATE · SETTLEMENT CONSUMED · AUTHORIZATION NONCE CONSUMED</strong><span>RETAINED RUN · READ ONLY · NEVER RE-SIGN OR REPLAY</span></div>`,
      footerLeft: `Source file: ${escapeHtml(path.basename(retainedFile))} · signature bytes omitted`,
      footerRight: `Settlement ${escapeHtml(short(settled.settlementId))} · Ledger ${escapeHtml(short(settled.ledgerHash))}`,
    }));
    await screenshotHtml(page, c05, path.join(captureDir, "C05-retained-signature-simulation.png"));

    const terminalReceipt = retained.keeperHub.terminal.receipts[0];
    const c06a = pageDocument(shell({
      eyebrow: "C06A · RETAINED KEEPERHUB TERMINAL RECEIPT",
      title: "Execution completed.<br>Receipt verified.",
      lede: "KeeperHub's terminal receipt for the retained one-atomic-unit settlement. This run came from the separately authorized simulate-then-single-broadcast runner — not from MCP.",
      source: "SOURCE · RETAINED KEEPERHUB TERMINAL RECEIPT · READ ONLY",
      content: `<div class="grid wide-left">
        <section class="panel"><div class="label">KeeperHub execution</div><h2>${escapeHtml(retained.keeperHub.executionId)}</h2>
          <div class="row"><div class="k">Terminal state</div><div class="v ok">${escapeHtml(retained.keeperHub.terminal.status.toUpperCase())}</div></div>
          <div class="row"><div class="k">Receipt status</div><div class="v ok">${escapeHtml(terminalReceipt.receiptStatus.toUpperCase())}</div></div>
          <div class="row"><div class="k">Receipt independently verified</div><div class="v ok">${terminalReceipt.verified ? "TRUE" : "FALSE"}</div></div>
          <div class="row"><div class="k">KeeperHub sponsored</div><div class="v info">${retained.keeperHub.terminal.sponsored ? "TRUE" : "FALSE"}</div></div>
        </section>
        <section class="panel"><div class="label">Public receipt binding</div><h2>Base Sepolia · block ${settled.blockNumber}</h2>
          <div class="hash"><div class="k">Transaction hash</div><code>${escapeHtml(settled.transactionHash)}</code></div>
          <div class="row"><div class="k">Chain ID</div><div class="v">${terminalReceipt.chainId}</div></div>
          <div class="row"><div class="k">Gas used</div><div class="v">${escapeHtml(terminalReceipt.gasUsed)}</div></div>
          <div class="row"><div class="k">Verified at</div><div class="v info">${escapeHtml(terminalReceipt.verifiedAt)}</div></div>
        </section>
      </div>
      <div class="banner"><strong>RETAINED RUN · NOT AN MCP SUBMISSION</strong><span>Execution ID and transaction hash match the sanitized retained record</span></div>`,
      footerLeft: "No authorization header · no private key · no signature bytes",
      footerRight: `Retained proof captured ${escapeHtml(retained.finishedAt)}`,
    }));
    await screenshotHtml(page, c06a, path.join(captureDir, "C06-retained-keeperhub-receipt.png"));

    const counts = settlementLog.data.slice(2).match(/.{64}/g)?.map((word) => BigInt(`0x${word}`).toString()) ?? [];
    const c06b = pageDocument(shell({
      eyebrow: "C06B · INDEPENDENT BASE SEPOLIA JSON-RPC",
      title: "The chain matches<br>the frozen plan.",
      lede: "A fresh public eth_getTransactionReceipt read returned a successful receipt and the exact V2 SettlementExecuted event. KeeperHub is not the source of this witness.",
      source: "SOURCE · https://sepolia.base.org · eth_getTransactionReceipt",
      content: `<div class="grid two">
        <section class="panel"><div class="label">Public transaction receipt</div><h2>SUCCESS · status 0x1</h2>
          <div class="row"><div class="k">Block</div><div class="v ok">${settled.blockNumber}</div></div>
          <div class="row"><div class="k">Block hex</div><div class="v info">${escapeHtml(receipt.blockNumber)}</div></div>
          <div class="row"><div class="k">V2 event contract</div><div class="v">${escapeHtml(short(settlementLog.address, 12, 10))}</div></div>
          <div class="row"><div class="k">Pulls · payouts · total atomic</div><div class="v ok">${counts.join(" · ")}</div></div>
          <div class="hash"><div class="k">Transaction hash</div><code>${escapeHtml(receipt.transactionHash)}</code></div>
        </section>
        <section class="panel"><div class="label">SettlementExecuted indexed binding</div><h2>EXACT V2 EVENT MATCH</h2>
          <div class="hash"><div class="k">Settlement ID · topic[1]</div><code>${escapeHtml(settlementLog.topics[1])}</code></div>
          <div class="hash"><div class="k">Ledger hash · topic[2]</div><code>${escapeHtml(settlementLog.topics[2])}</code></div>
          <div class="row"><div class="k">Contract matches release</div><div class="v ok">TRUE</div></div>
          <div class="row"><div class="k">Independent RPC event match</div><div class="v ok">TRUE</div></div>
        </section>
      </div>
      <div class="banner"><strong>VERIFIED_SETTLED · BLOCK ${settled.blockNumber}</strong><span>Deployment transaction was not used</span></div>`,
      footerLeft: `Public RPC read performed ${escapeHtml(new Date().toISOString())}`,
      footerRight: `Network Base Sepolia · chain ${releaseProof.chainId}`,
    }));
    await screenshotHtml(page, c06b, path.join(captureDir, "C06-base-sepolia-proof.png"));

    const devContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      colorScheme: "dark",
      reducedMotion: "reduce",
    });
    const devPage = await devContext.newPage();
    await devPage.goto(developersUrl, { waitUntil: "networkidle", timeout: 60_000 });
    invariant((await devPage.title()).toLowerCase().includes("developers"), "canonical developers page did not load");
    const devShot = await devPage.screenshot({ type: "png" });
    const devShotData = `data:image/png;base64,${devShot.toString("base64")}`;
    await devContext.close();

    const toolRows = liveTools.map((tool, index) => `<div class="tool"><code>${escapeHtml(tool)}</code><b>${String(index + 1).padStart(2, "0")}</b></div>`).join("");
    const c07 = pageDocument(shell({
      eyebrow: "C07 · CANONICAL DEVELOPERS PAGE + LIVE AUTHENTICATED tools/list",
      title: "Nine production tools.<br>One external-wallet boundary.",
      lede: "The public developer contract and the authenticated production endpoint agree exactly. Authorization stayed outside the frame.",
      source: "SOURCE · https://finaltab.vercel.app/developers + LIVE MCP HTTP 200",
      content: `<div class="grid wide-left">
        <section class="panel" style="padding:22px"><img class="page-shot" src="${devShotData}" alt="Canonical FINALTab developers page"><div class="source-chip">CANONICAL PAGE · LIVE CAPTURE</div></section>
        <section class="panel terminal"><div class="terminal-head"><div class="dots"><i></i><i></i><i></i></div><span class="pill">AUTHENTICATED · HTTP ${toolsList.status}</span></div>
          <div class="terminal-body"><span class="prompt">$</span> POST ${escapeHtml(endpoint)}<br><span class="dim">Authorization: Bearer [REDACTED]</span><br><span class="blue">← tools/list · ${liveTools.length} tools</span></div>
          <div class="tools">${toolRows}</div>
        </section>
      </div>
      <div class="banner"><strong>EXTERNAL WALLET BOUNDARY</strong><span>FINALTab holds no arbitrary user keys · wallet signatures are never produced by this MCP server · submit remains separately gated</span></div>`,
      footerLeft: `Client: FINALTab Release Witness 1.0 · ${escapeHtml(toolsList.completedAt)}`,
      footerRight: "Bearer token absent from image · retired fixed-wallet tools absent",
    }));
    await screenshotHtml(page, c07, path.join(captureDir, "C07-live-tools-list.png"));

    const c08b = pageDocument(shell({
      eyebrow: "C08B · SEPARATE RETAINED-RUN READ-ONLY PROOF",
      title: "RETAINED RUN ·<br>NOT THIS MCP SUBMISSION",
      lede: "C08A stops before any wallet action. This separate panel references the earlier, explicitly authorized one-atomic-unit run and its independently verified chain receipt.",
      source: "SOURCE · RETAINED PROOF RECORD + PUBLIC BASE SEPOLIA RPC",
      content: `<div class="grid two">
        <section class="panel"><div class="label">Retained execution</div><h2>${escapeHtml(retained.keeperHub.executionId)}</h2>
          <div class="row"><div class="k">Verdict</div><div class="v ok">VERIFIED_SETTLED</div></div>
          <div class="row"><div class="k">Block</div><div class="v ok">${settled.blockNumber}</div></div>
          <div class="row"><div class="k">Receipt status</div><div class="v ok">SUCCESS</div></div>
          <div class="hash"><div class="k">Transaction</div><code>${escapeHtml(settled.transactionHash)}</code></div>
        </section>
        <section class="panel"><div class="label">Exact frozen-plan identity</div><h2>Public event match</h2>
          <div class="hash"><div class="k">Settlement ID</div><code>${escapeHtml(settled.settlementId)}</code></div>
          <div class="hash"><div class="k">Ledger hash</div><code>${escapeHtml(settled.ledgerHash)}</code></div>
          <div class="row"><div class="k">Independent RPC</div><div class="v ok">MATCHED</div></div>
        </section>
      </div>
      <div class="banner"><strong>NO SUBMISSION OCCURRED IN C08A</strong><span>The retained run originated from the authorized standalone simulate-then-single-broadcast runner, not MCP</span></div>`,
      footerLeft: `Execution ${escapeHtml(retained.keeperHub.executionId)} · retained read only`,
      footerRight: `Settlement ${escapeHtml(short(settled.settlementId))} · Ledger ${escapeHtml(short(settled.ledgerHash))}`,
    }));
    await screenshotHtml(page, c08b, path.join(captureDir, "C08-retained-status.png"));

    const stageDocuments = [
      mcpStageDocument({
        active: 0,
        title: "Initialize the witness.",
        subtitle: "A named MCP client opens an authenticated Streamable HTTP session against canonical production.",
        timestamp: sanitizedTrace.initialize.completedAt,
        responseHtml: `<div class="terminal-head"><div class="dots"><i></i><i></i><i></i></div><span class="pill">LIVE RESPONSE · HTTP ${sanitizedTrace.initialize.status}</span></div>
          <div class="terminal-body"><span class="prompt">$</span> initialize<br><span class="dim">clientInfo.name</span> = <span class="blue">"FINALTab Release Witness"</span><br><span class="dim">protocolVersion</span> = ${escapeHtml(sanitizedTrace.initialize.protocolVersion)}<br><span class="dim">serverInfo</span> = ${escapeHtml(sanitizedTrace.initialize.serverInfo.name)} v${escapeHtml(sanitizedTrace.initialize.serverInfo.version)}<br><br><span class="ok">✓ authenticated canonical endpoint</span><br><span class="dim">Authorization: Bearer [REDACTED]</span></div>`,
      }),
      mcpStageDocument({
        active: 1,
        title: "List the production surface.",
        subtitle: "The live endpoint returns the locked nine-tool manifest; no retired fixed-wallet tool is present.",
        timestamp: sanitizedTrace.toolsList.completedAt,
        responseHtml: `<div class="terminal-head"><div class="dots"><i></i><i></i><i></i></div><span class="pill">LIVE RESPONSE · ${sanitizedTrace.toolsList.names.length} TOOLS</span></div><div class="tools" style="margin-top:34px">${toolRows}</div><div class="banner"><strong>EXACT MANIFEST MATCH</strong><span>Authenticated endpoint · HTTP ${sanitizedTrace.toolsList.status}</span></div>`,
      }),
      mcpStageDocument({
        active: 2,
        title: "Allocate caller-supplied receipt data.",
        subtitle: "Deterministic integer arithmetic reconciles USD 54.01 across two caller-supplied participants.",
        timestamp: sanitizedTrace.allocate.completedAt,
        responseHtml: `<div class="terminal-head"><div class="dots"><i></i><i></i><i></i></div><span class="pill">LIVE RESPONSE · HTTP ${sanitizedTrace.allocate.status}</span></div><h2>allocate_receipt</h2>
          <div class="row"><div class="k">Receipt</div><div class="v info">${escapeHtml(sanitizedTrace.allocate.receiptId)}</div></div>
          <div class="row"><div class="k">Participant A</div><div class="v">USD ${escapeHtml(sanitizedTrace.allocate.shares[0].amount)}</div></div>
          <div class="row"><div class="k">Participant B</div><div class="v">USD ${escapeHtml(sanitizedTrace.allocate.shares[1].amount)}</div></div>
          <div class="row"><div class="k">Exact total</div><div class="v ok">USD ${escapeHtml(sanitizedTrace.allocate.total)}</div></div>
          <div class="banner"><strong>SUMS TO TOTAL · TRUE</strong><span>No model-authored rounding</span></div>`,
      }),
      mcpStageDocument({
        active: 3,
        title: "Prepare — never sign.",
        subtitle: "Production freezes a Base Sepolia V2 plan and returns the external-wallet signature requests. The client does not sign them.",
        timestamp: sanitizedTrace.prepare.completedAt,
        responseHtml: `<div class="terminal-head"><div class="dots"><i></i><i></i><i></i></div><span class="pill">LIVE RESPONSE · V2 · CHAIN ${sanitizedTrace.prepare.chainId}</span></div>
          <div class="row"><div class="k">Contract</div><div class="v info">${escapeHtml(short(sanitizedTrace.prepare.contract, 12, 10))}</div></div>
          <div class="row"><div class="k">External-wallet request count</div><div class="v">${sanitizedTrace.prepare.signatureRequestCount}</div></div>
          <div class="hash"><div class="k">Settlement ID</div><code>${escapeHtml(sanitizedTrace.prepare.settlementId)}</code></div>
          <div class="hash"><div class="k">Ledger hash</div><code>${escapeHtml(sanitizedTrace.prepare.ledgerHash)}</code></div>
          <div class="banner"><strong>NO SIGNATURE PRODUCED</strong><span>Prepared payload only</span></div>`,
      }),
      mcpStageDocument({
        active: 4,
        title: "Create the approval challenge.",
        subtitle: "The live server creates a short-lived EIP-191 message bound to this exact plan. It still cannot broadcast without a human wallet signature.",
        timestamp: sanitizedTrace.challenge.completedAt,
        responseHtml: `<div class="terminal-head"><div class="dots"><i></i><i></i><i></i></div><span class="pill">LIVE RESPONSE · BROADCAST FALSE</span></div><h2>create_broadcast_approval_challenge</h2>
          <div class="row"><div class="k">Approval ID</div><div class="v info">${escapeHtml(sanitizedTrace.challenge.approvalId)}</div></div>
          <div class="row"><div class="k">Signing method</div><div class="v">${escapeHtml(sanitizedTrace.challenge.signingMethod)}</div></div>
          <div class="row"><div class="k">Validity</div><div class="v">${Number(sanitizedTrace.challenge.expiresAt) - Number(sanitizedTrace.challenge.issuedAt)} seconds</div></div>
          <div class="row"><div class="k">Broadcast</div><div class="v ok">FALSE</div></div>
          <div class="banner"><strong>HUMAN WALLET ACTION REQUIRED NEXT</strong><span>Not performed in this capture</span></div>`,
      }),
      mcpStageDocument({
        active: 5,
        title: "Stop at the money boundary.",
        subtitle: "The live production run is complete at challenge creation. The value-moving path is deliberately untouched.",
        timestamp: sanitizedTrace.challenge.completedAt,
        responseHtml: `<div class="hard-stop"><div class="proofmark">HARD STOP</div><p><strong>NO WALLET SIGNATURE</strong><br>NO submit_signed_settlement<br>NO BROADCAST<br>NO VALUE MOVE</p><div class="banner"><strong>CHALLENGE CREATED · BROADCAST FALSE</strong><span>Retained proof appears separately in C08B</span></div></div>`,
      }),
    ];

    const stagePaths = [];
    for (let index = 0; index < stageDocuments.length; index += 1) {
      const stagePath = path.join(workDir, `C08-stage-${String(index + 1).padStart(2, "0")}.png`);
      await screenshotHtml(page, stageDocuments[index], stagePath);
      stagePaths.push(stagePath);
    }
    await evidenceContext.close();

    const stillDuration = 2.2;
    const transition = 0.35;
    const finalDuration = stillDuration + (stagePaths.length - 1) * (stillDuration - transition);
    const ffmpegArgs = ["-y"];
    for (const stagePath of stagePaths) ffmpegArgs.push("-loop", "1", "-t", String(stillDuration), "-i", stagePath);
    const filters = stagePaths.map((_, index) => `[${index}:v]fps=60,scale=${WIDTH}:${HEIGHT}:flags=lanczos,format=yuv420p,settb=AVTB[v${index}]`);
    let previous = "v0";
    for (let index = 1; index < stagePaths.length; index += 1) {
      const output = index === stagePaths.length - 1 ? "vout" : `x${index}`;
      const offset = (stillDuration - transition) * index;
      filters.push(`[${previous}][v${index}]xfade=transition=fade:duration=${transition}:offset=${offset.toFixed(2)}[${output}]`);
      previous = output;
    }
    ffmpegArgs.push(
      "-filter_complex", filters.join(";"),
      "-map", "[vout]",
      "-t", finalDuration.toFixed(2),
      "-an",
      "-r", "60",
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "16",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      path.join(captureDir, "C08-mcp-nonbroadcast.mp4"),
    );
    await execFileAsync("ffmpeg", ffmpegArgs, { maxBuffer: 8 * 1024 * 1024 });
  } finally {
    await browser.close();
  }

  const outputs = [
    "C05-retained-signature-simulation.png",
    "C06-retained-keeperhub-receipt.png",
    "C06-base-sepolia-proof.png",
    "C07-live-tools-list.png",
    "C08-mcp-nonbroadcast.mp4",
    "C08-retained-status.png",
  ];
  const summary = [];
  for (const name of outputs) {
    const outputPath = path.join(captureDir, name);
    const bytes = await readFile(outputPath);
    invariant(!bytes.includes(Buffer.from(token)), `${name} contains the raw MCP token`);
    const fileStat = await stat(outputPath);
    summary.push({
      name,
      bytes: fileStat.size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  process.stdout.write(`${JSON.stringify({ ok: true, outputs: summary }, null, 2)}\n`);
}

await main();
