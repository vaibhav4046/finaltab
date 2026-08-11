#!/usr/bin/env node
"use strict";

// RETIRED: the previous implementation synthesized a proof-shaped JSON file
// with placeholder hashes, balances, and verification claims. Evidence must be
// derived from a real KeeperHub execution and independently checked onchain.

console.error([
  "RETIRED: scripts/collect-proof.js will not synthesize evidence.",
  "Use the KeeperHub flight recorder against a real execution:",
  "  pnpm kh:proof -- <execution-id>",
  "Keep the raw KeeperHub response and independent RPC verification together.",
].join("\n"));
process.exitCode = 3;
