const ethers = require('ethers');

const wallet = ethers.Wallet.createRandom();

console.log('');
console.log('=== NEW DEPLOYER KEYPAIR ===');
console.log('');
console.log('PRIVATE_KEY=' + wallet.privateKey);
console.log('ADDRESS=' + wallet.address);
console.log('');
console.log('Next:');
console.log('1. Fund this address with 0.1+ ETH on Base Sepolia');
console.log('2. Set env: $env:DEPLOYER_PRIVATE_KEY = "' + wallet.privateKey + '"');
console.log('3. Run: node scripts/finaltab-cli.js');
console.log('');
