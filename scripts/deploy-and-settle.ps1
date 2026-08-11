#!/usr/bin/env pwsh

# RETIRED: this legacy orchestrator accepted a raw deployer private key and
# mixed deployment, mutable local configuration, and placeholder evidence.
# Keeping it as a fail-closed stub prevents old runbooks from doing harm.

[Console]::Error.WriteLine(@"
RETIRED: scripts/deploy-and-settle.ps1 cannot deploy or settle.
Use the simulate-first V2 KeeperHub deployment path instead:
  node scripts/deploy-v2-keeperhub.mjs
Use independently verified KeeperHub/RPC output for evidence; never templates.
"@)
exit 3
