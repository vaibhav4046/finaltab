const message = [
  "Automated capture is intentionally disabled for the V3 source lock.",
  "This command made no browser, MCP, wallet, network, or value-moving request.",
  "Capture C05 through C08 only after following data/capture-contracts.json.",
  "The MCP recording must stop after create_broadcast_approval_challenge and must never sign, submit, broadcast, or move money.",
].join(" ");

process.stderr.write(`${message}\n`);
process.exitCode = 1;
