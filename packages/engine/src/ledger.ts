import { keccak256, toHex, encodeAbiParameters } from "viem";

/**
 * Canonical frozen ledger. Once hashed, ANY edit changes ledgerHash and
 * invalidates every EIP-3009 signature bound to it (nonces derive from the hash).
 */

export interface LedgerParticipant {
  id: string; // stable lowercase id
  address: `0x${string}`; // checksummed input allowed; canonicalized to lowercase
  displayName: string;
}

export interface LedgerTransfer {
  from: `0x${string}`;
  to: `0x${string}`;
  /** USDC minor units */
  value: bigint;
}

export interface CanonicalLedger {
  version: 1;
  chainId: number;
  token: `0x${string}`;
  participants: LedgerParticipant[];
  transfers: LedgerTransfer[];
  /** receipt ids included, sorted */
  receiptIds: string[];
}

function lower(a: string): `0x${string}` {
  if (!/^0x[0-9a-fA-F]{40}$/.test(a)) throw new Error(`Invalid address: ${a}`);
  return a.toLowerCase() as `0x${string}`;
}

/** Deterministic canonical form: sorted participants/receipts, lowercase addresses, transfers in given order (order is meaningful). */
export function canonicalizeLedger(ledger: CanonicalLedger): CanonicalLedger {
  return {
    version: 1,
    chainId: ledger.chainId,
    token: lower(ledger.token),
    participants: [...ledger.participants]
      .map((p) => ({ id: p.id.trim().toLowerCase(), address: lower(p.address), displayName: p.displayName.trim() }))
      .sort((a, b) => (a.id < b.id ? -1 : 1)),
    transfers: ledger.transfers.map((t) => {
      if (t.value <= 0n) throw new Error("canonicalizeLedger: non-positive transfer value");
      return { from: lower(t.from), to: lower(t.to), value: t.value };
    }),
    receiptIds: [...ledger.receiptIds].map((r) => r.trim()).sort(),
  };
}

/** Canonical JSON: stable key order, bigint as decimal string. */
export function ledgerToCanonicalJson(ledger: CanonicalLedger): string {
  const c = canonicalizeLedger(ledger);
  return JSON.stringify({
    version: c.version,
    chainId: c.chainId,
    token: c.token,
    participants: c.participants.map((p) => ({ id: p.id, address: p.address, displayName: p.displayName })),
    transfers: c.transfers.map((t) => ({ from: t.from, to: t.to, value: t.value.toString() })),
    receiptIds: c.receiptIds,
  });
}

/** keccak256 of the canonical JSON bytes. This is THE ledger identity. */
export function ledgerHash(ledger: CanonicalLedger): `0x${string}` {
  return keccak256(toHex(ledgerToCanonicalJson(ledger)));
}

/** settlementId binds to the ledger: keccak256(abi.encode(ledgerHash)) — mirrored on-chain. */
export function settlementId(hash: `0x${string}`): `0x${string}` {
  return keccak256(encodeAbiParameters([{ type: "bytes32" }], [hash]));
}

/** Per-transfer EIP-3009 nonce: keccak256(abi.encode(ledgerHash, from, to, value, index)). Unique per ledger+transfer. */
export function transferNonce(
  hash: `0x${string}`,
  from: `0x${string}`,
  to: `0x${string}`,
  value: bigint,
  index: number,
): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }],
      [hash, from, to, value, BigInt(index)],
    ),
  );
}
