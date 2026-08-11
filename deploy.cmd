@echo off
setlocal

REM This wrapper previously invoked the retired V1 deployment automation.
REM It must stop before inspecting environment variables or loading a signer.
echo ERROR: deploy.cmd is retired and will not read a private key or deploy a contract.
echo Use scripts\deploy-v2-keeperhub.mjs for the reviewed V2 KeeperHub deployment flow.
echo Run its simulation and verification gates before any Base Sepolia broadcast.
exit /b 2
