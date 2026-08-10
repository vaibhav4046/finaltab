const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Base Sepolia USDC (verified from Circle documentation)
const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying FinalTabBatchSettlement from ${deployer.address}`);
  console.log(`USDC: ${BASE_SEPOLIA_USDC}`);

  const Settlement = await ethers.getContractFactory("FinalTabBatchSettlement");
  const settlement = await Settlement.deploy(BASE_SEPOLIA_USDC);
  await settlement.waitForDeployment();

  const contractAddress = await settlement.getAddress();
  console.log(`✓ FinalTabBatchSettlement deployed to ${contractAddress}`);

  // Save to .env.local
  const envPath = path.join(__dirname, "../apps/web/.env.local");
  let envContent = fs.readFileSync(envPath, "utf8");
  envContent = envContent.replace(
    /NEXT_PUBLIC_SETTLEMENT_CONTRACT=.*/,
    `NEXT_PUBLIC_SETTLEMENT_CONTRACT=${contractAddress}`
  );
  fs.writeFileSync(envPath, envContent);
  console.log(`✓ Updated apps/web/.env.local`);

  // Save deployment info
  const deploymentInfo = {
    contract: "FinalTabBatchSettlement",
    address: contractAddress,
    usdc: BASE_SEPOLIA_USDC,
    chain: "Base Sepolia",
    chainId: 84532,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    blockNumber: await ethers.provider.getBlockNumber(),
  };
  fs.writeFileSync(
    path.join(__dirname, "../deployment.json"),
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log(`✓ Saved deployment info to deployment.json`);

  return contractAddress;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
