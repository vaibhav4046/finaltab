#!/usr/bin/env node
"use strict";

// RETIRED: the former all-in-one CLI loaded raw secrets, deployed the legacy
// contract directly, rewrote .env.local/SUBMISSION.md, and created placeholder
// proof. It remains as a fail-closed stub so old entry points cannot mutate a
// checkout or publish unverified claims.

console.error([
  "RETIRED: scripts/finaltab-cli.js performs no actions.",
  "Use the simulate-first V2 KeeperHub deployment path:",
  "  node scripts/deploy-v2-keeperhub.mjs",
  "Collect evidence only from KeeperHub receipts plus independent RPC verification.",
].join("\n"));
process.exitCode = 3;
