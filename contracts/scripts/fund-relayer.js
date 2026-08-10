/**
 * Sweep native Base Sepolia ETH from the deployer to the KeeperHub relayer.
 *
 * Why this exists: KeeperHub sponsors `transfer` intents (`sponsored: true`) but
 * NOT `contract-call` intents (`sponsored: false`). The settle leg is a
 * contract-call, so the relayer must pay its own gas and currently holds zero.
 * The deployer already holds enough testnet dust to cover it many times over,
 * so no faucet is required — this just moves it.
 *
 * Run:
 *   cd contracts
 *   DEPLOYER_PRIVATE_KEY=0x... npx hardhat run scripts/fund-relayer.js --network base-sepolia
 *
 * The key is read from the environment and never logged. Testnet only.
 */
const hre = require("hardhat");

const RELAYER = "0x7AE891Ec51990684682a084381e97b59d787652B";

// KeeperHub quoted 0.000000231 BASE for the settle call. Send a wide margin so
// retries and gas-price drift do not re-block the gate, while leaving the
// deployer enough to still broadcast.
const SEND_ETH = "0.00005";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const provider = hre.ethers.provider;

  const before = await provider.getBalance(deployer.address);
  const relayerBefore = await provider.getBalance(RELAYER);

  console.log(`deployer  ${deployer.address}`);
  console.log(`  balance ${hre.ethers.formatEther(before)} ETH`);
  console.log(`relayer   ${RELAYER}`);
  console.log(`  balance ${hre.ethers.formatEther(relayerBefore)} ETH`);

  const value = hre.ethers.parseEther(SEND_ETH);
  if (before <= value) {
    throw new Error(
      `Deployer holds ${hre.ethers.formatEther(before)} ETH, needs more than ${SEND_ETH} ETH ` +
        `to send that amount plus gas. Fund ${deployer.address} from a Base Sepolia faucet first.`
    );
  }

  console.log(`\nsending ${SEND_ETH} ETH -> relayer ...`);
  const tx = await deployer.sendTransaction({ to: RELAYER, value });
  console.log(`tx ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`mined in block ${receipt.blockNumber}, status ${receipt.status}`);

  const relayerAfter = await provider.getBalance(RELAYER);
  console.log(`\nrelayer balance now ${hre.ethers.formatEther(relayerAfter)} ETH`);
  console.log(`explorer https://sepolia.basescan.org/tx/${tx.hash}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 1;
});
