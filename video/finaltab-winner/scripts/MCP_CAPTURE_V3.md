# C07 MCP evidence capture

This utility records only sanitized facts for the V3 authenticated MCP lane. It reads the existing ignored capability from `proof-output/finaltab-mcp-token.local.json` in memory and never accepts a token through command-line arguments, stdout, or an output file.

Run the local safety suite without network access:

```powershell
npm run test:mcp-capture
```

After a human has confirmed the capture window is ready, run the one live sequence:

```powershell
npm run capture:mcp:v3 -- --live
```

Use `--force` only to intentionally replace an earlier sanitized C07 transcript and lock file. The live sequence is fixed in code:

1. `initialize`
2. `tools/list`
3. `allocate_receipt`
4. `prepare_receipt_settlement`
5. `create_broadcast_approval_challenge`
6. `HARD STOP`

The utility cannot request a simulation, signature, submission, broadcast, execution, status lookup, or value movement. It writes only whitelisted counts, public plan identifiers, a tool catalog, explicit false safety flags, and hashes. Raw JSON-RPC bodies, authorization headers, typed-data requests, challenge text, approval artifacts, signatures, and credential values are discarded. C08 is a separate retained public/read-only proof lane and is never queried by this utility.
