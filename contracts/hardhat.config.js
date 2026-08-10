require("@nomicfoundation/hardhat-toolbox");

// No key literal lives in this file, not even a zero placeholder — a 64-hex string next to the word
// "PRIVATE_KEY" is indistinguishable from a real leak to any scanner reading the repo. With the env
// var unset, base-sepolia simply has no signers, which is the correct state for `hardhat test`
// (that runs against the in-memory network) and a clear failure for anything that needs to sign.
const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
const baseSepoliaAccounts = deployerKey ? [deployerKey] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    "base-sepolia": {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      accounts: baseSepoliaAccounts,
      chainId: 84532,
    },
  },
};
