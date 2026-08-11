/**
 * RETIRED SECURITY STUB
 *
 * The former helper loaded the configured Hardhat signer and transferred its
 * native balance to a fixed address. Keeping that behavior available makes a
 * stale command or misconfigured network materially dangerous.
 *
 * Relayer funding is now an explicit operator action: confirm the chain and
 * destination in KeeperHub, use a faucet or controlled testnet treasury, and
 * retain the public transaction receipt. This file deliberately never imports
 * Hardhat, reads a key, constructs a signer, or broadcasts a transaction.
 */

console.error(
  "RETIRED: contracts/scripts/fund-relayer.js will not load a signer or move funds. " +
    "Fund only the KeeperHub-confirmed Base Sepolia relayer through an approved operator workflow."
);
process.exitCode = 2;
