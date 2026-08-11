#!/usr/bin/env node
"use strict";

// RETIRED: direct Hardhat deployment reads a locally configured signer and
// bypasses FINALTab's simulate-first KeeperHub evidence path. V2 deployment is
// orchestrated from the repository root by scripts/deploy-v2-keeperhub.mjs.

console.error([
  "RETIRED: contracts/scripts/deploy.js does not deploy a contract.",
  "From the repository root, use the V2 KeeperHub workflow:",
  "  node scripts/deploy-v2-keeperhub.mjs",
].join("\n"));
process.exitCode = 3;
