#!/usr/bin/env bash
set -e

if [ -z "$1" ]; then
    echo "Usage: ./deploy_aevum.sh <PRIVATE_KEY>"
    exit 1
fi

PRIVATE_KEY=$1

echo "Deploying AgentVault to QDay Aevum Testnet (Chain ID 44005)..."
forge script script/DeployAevum.s.sol:DeployAevum \
    --rpc-url "https://rpc-test.qday.info" \
    --private-key "$PRIVATE_KEY" \
    --broadcast \
    --legacy

echo "Deployment completed. View transactions at: https://explorer-test.qday.info"
