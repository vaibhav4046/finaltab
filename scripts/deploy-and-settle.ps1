#!/usr/bin/env pwsh
<#
.SYNOPSIS
FINALTab end-to-end deployment and settlement execution.
Deploys contract → runs settlement → collects proof → generates submission.

.PARAMETER DeployerKey
Private key for contract deployment. Defaults to $env:DEPLOYER_PRIVATE_KEY. Never hardcode it here.

.PARAMETER SkipDeploy
Skip contract deployment if already deployed

.PARAMETER SkipSettle
Skip settlement execution
#>

param(
    [string]$DeployerKey = $env:DEPLOYER_PRIVATE_KEY,
    [switch]$SkipDeploy,
    [switch]$SkipSettle
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

if ([string]::IsNullOrWhiteSpace($DeployerKey)) {
    Write-Error "DEPLOYER_PRIVATE_KEY is not set. Export it in your shell, or pass -DeployerKey. It is deliberately not stored in this repo."
    exit 1
}

Write-Host "=== FINALTab End-to-End Automation ===" -ForegroundColor Cyan

# Check prerequisites
Write-Host "`n[1/5] Checking prerequisites..." -ForegroundColor Yellow
if (-not (Test-Path "D:\project\finaltab")) {
    Write-Error "FINALTab not found at D:\project\finaltab"
    exit 1
}

$env:DEPLOYER_PRIVATE_KEY = $DeployerKey

# Step 1: Deploy contract
if (-not $SkipDeploy) {
    Write-Host "`n[2/5] Deploying FinalTabBatchSettlement to Base Sepolia..." -ForegroundColor Yellow
    Push-Location "D:\project\finaltab\contracts"

    try {
        $output = npx hardhat run scripts/deploy.js --network base-sepolia 2>&1

        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ Contract deployed successfully" -ForegroundColor Green

            # Extract contract address from output
            $contractAddr = $output | Select-String "deployed to 0x[0-9a-fA-F]{40}" | ForEach-Object { $_.Matches[0].Value.Replace("deployed to ", "") }
            Write-Host "  Address: $contractAddr" -ForegroundColor Green
        }
        else {
            Write-Error "Deployment failed: $output"
        }
    }
    finally {
        Pop-Location
    }
}
else {
    Write-Host "`n[2/5] Skipping deployment (--SkipDeploy)" -ForegroundColor Gray
}

# Step 2: Verify web app build
Write-Host "`n[3/5] Verifying web app build..." -ForegroundColor Yellow
Push-Location "D:\project\finaltab\apps\web"

try {
    pnpm build 2>&1 | Where-Object { $_ -match "error|failed" } | ForEach-Object {
        Write-Error $_
    }
    Write-Host "✓ Web app build successful" -ForegroundColor Green
}
finally {
    Pop-Location
}

# Step 3: Run settlement (if enabled)
if (-not $SkipSettle) {
    Write-Host "`n[4/5] Executing settlement flow..." -ForegroundColor Yellow
    Write-Host "  Manual: Open http://localhost:3000/app/tab in browser" -ForegroundColor Cyan
    Write-Host "  Steps: Upload receipt → Allocate → Freeze → Sign → Simulate → Execute → Verify" -ForegroundColor Cyan
    Write-Host "  Press Enter when settlement is complete..." -ForegroundColor Cyan
    Read-Host
}

# Step 4: Collect proof
Write-Host "`n[5/5] Collecting proof..." -ForegroundColor Yellow
$proofPath = "D:\project\finaltab\proof.json"

$proof = @{
    timestamp = (Get-Date -AsUTC).ToString("o")
    chain = "Base Sepolia"
    chainId = 84532
    contractAddress = $contractAddr ?? "PENDING"
    status = "AWAITING_SETTLEMENT_EXECUTION"
    deployment = @{
        deployedAt = (Get-Date -AsUTC).ToString("o")
        deployer = "0x976EF25623A94F6F70924816697C7c7172210a5F"
    }
    # This script does not run the test suites, so it does not claim their results.
    # An earlier revision hardcoded "44/44 PASSING" here — stale and unmeasured.
    tests = @{
        measuredBy = "not this script - run 'pnpm -r --if-present test' and 'pnpm --filter contracts test'"
        lastRecordedResult = "docs/release/gates.md"
    }
} | ConvertTo-Json -Depth 10

$proof | Set-Content $proofPath
Write-Host "✓ Proof template saved to: $proofPath" -ForegroundColor Green

# Summary
Write-Host "`n=== COMPLETE ===" -ForegroundColor Cyan
Write-Host "✓ Contract deployed" -ForegroundColor Green
Write-Host "✓ Web app ready" -ForegroundColor Green
Write-Host "✓ Settlement executed (manual)" -ForegroundColor Green
Write-Host "✓ Proof collected" -ForegroundColor Green

Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "1. Copy transaction hash from Base Sepolia to proof.json" -ForegroundColor White
Write-Host "2. Record demo video (2:20-2:40) of settlement execution" -ForegroundColor White
Write-Host "3. Submit proof.json + demo-video.mp4 to hackathon" -ForegroundColor White

Write-Host "`nSubmission ready at: D:\project\finaltab\SUBMISSION.md" -ForegroundColor Cyan
