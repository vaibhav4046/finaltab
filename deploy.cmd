@echo off
REM FINALTab One-Click Deployment
REM One-shot deploy wrapper. Requires DEPLOYER_PRIVATE_KEY in the environment.

echo.
echo ===================================
echo   FINALTab Autonomous Deployment
echo ===================================
echo.

REM Set deployer key
REM Supply the key at runtime: set DEPLOYER_PRIVATE_KEY=0x... before running this script.
if "%DEPLOYER_PRIVATE_KEY%"=="" (
  echo ERROR: DEPLOYER_PRIVATE_KEY is not set. Export it in your shell before running.
  exit /b 1
)

REM Check if wallet is funded
echo Checking wallet balance...
powershell -Command "^
  $wallet = '0x976EF25623A94F6F70924816697C7c7172210a5F'; ^
  try { ^
    $response = curl.exe -s -X POST 'https://base-sepolia.g.alchemy.com/v2/<YOUR_ALCHEMY_KEY>' ^
      -H 'Content-Type: application/json' ^
      -d '{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBalance\",\"params\":[\"'$wallet'\",\"latest\"],\"id\":1}'; ^
    $json = $response | ConvertFrom-Json; ^
    $balance = [Convert]::ToInt64($json.result, 16) / 1e18; ^
    if ($balance -gt 0) { ^
      Write-Host \"✓ Wallet funded: $balance ETH\" -ForegroundColor Green; ^
      exit 0 ^
    } else { ^
      Write-Host \"✗ Wallet has 0 ETH\" -ForegroundColor Red; ^
      Write-Host \"Fund via: https://www.alchemy.com/faucets/base-sepolia\" -ForegroundColor Yellow; ^
      exit 1 ^
    } ^
  } catch { ^
    Write-Host \"⚠ Could not check balance. Proceeding anyway...\" -ForegroundColor Yellow; ^
    exit 0 ^
  }^
"

if errorlevel 1 (
  echo.
  echo BLOCKED: Wallet not funded
  echo.
  echo Fund wallet: 0x976EF25623A94F6F70924816697C7c7172210a5F
  echo Faucet: https://www.alchemy.com/faucets/base-sepolia
  echo.
  pause
  exit /b 1
)

REM Run CLI deployment
echo.
echo Starting deployment...
echo.

cd /d D:\project\finaltab
node scripts/finaltab-cli.js

if errorlevel 1 (
  echo.
  echo Deployment failed. Check error above.
  pause
  exit /b 1
)

REM Start dev server
echo.
echo Deployment complete. Starting dev server...
echo.

cd apps\web
pnpm dev

pause
