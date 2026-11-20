param(
    [Parameter(Mandatory=$true)]
    [string]$PrivateKey
)

$foundryBin = Join-Path $HOME ".foundry\bin"
if (Test-Path $foundryBin) {
    $env:PATH += ";$foundryBin"
}

Write-Host "Deploying AgentVault to QDay Aevum Testnet (Chain ID 44005)..." -ForegroundColor Cyan
forge script script/DeployAevum.s.sol:DeployAevum `
    --rpc-url "https://rpc-test.qday.info" `
    --private-key $PrivateKey `
    --broadcast `
    --legacy

Write-Host "Deployment completed. View transactions at: https://explorer-test.qday.info" -ForegroundColor Green
