// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import "../src/AgentVault.sol";
import "../src/ERC8004Identity.sol";
import "../src/ERC8004Reputation.sol";
import "../src/mocks/MockUSD8.sol";
import "../src/mocks/MockEntryPoint.sol";

/// @notice Deploys AgentVault, ERC8004Identity, and ERC8004Reputation to QDay Aevum Testnet (chain 44005) or fork (440050).
contract DeployAevum is Script {
    address constant AEVUM_TUSD8 = 0x456569838f1d43009A91ebA4263147Afd7233483;
    uint256 constant ANVIL_CHAIN = 31337;
    uint256 constant FORK_CHAIN = 440050;
    uint256 constant AEVUM_CHAIN = 44005;

    function run()
        external
        returns (
            AgentVault vault,
            ERC8004Identity identity,
            ERC8004Reputation reputation,
            address token
        )
    {
        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();

        // 1. Identify or deploy token
        if (AEVUM_TUSD8.code.length > 0) {
            token = AEVUM_TUSD8;
        } else {
            MockUSD8 mock = new MockUSD8();
            mock.mint(deployer, 1_000 * 1e6);
            token = address(mock);
        }

        // 2. Deploy ERC-8004 Registries
        identity = new ERC8004Identity();
        reputation = new ERC8004Reputation();

        // 3. Configure Guardians (5 distinct addresses)
        address[5] memory guardians = [
            0x14dC79964da2C08b23698B3D3cc7Ca32193d9955,
            0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f,
            0xa0Ee7A142d267C1f36714E4a8F75612F20a79720,
            0xBcd4042DE499D14e55001CcbB24a551F3b954096,
            0x71bE63f3384f5fb98995898A86B02Fb2426c5788
        ];

        // 4. Deploy EntryPoint (mock if local/testnet without official bundler)
        MockEntryPoint entryPoint = new MockEntryPoint();

        // 5. Deploy AgentVault Smart Account
        vault = new AgentVault(
            IEntryPoint(address(entryPoint)),
            deployer,
            guardians,
            48 hours
        );

        // 6. Initial Policy Configuration for tUSD8:
        // Set agent key (defaulting to separate agent account, or AGENT_KEY env)
        address agentKey = vm.envOr("AGENT_KEY", address(0x70997970C51812dc3A010C7d01b50e0d17dc79C8));
        vault.setAgentKey(agentKey, block.timestamp + 30 days);

        // Allow tUSD8 target and ERC20 transfer selector
        vault.setAllowedTarget(token, true);
        vault.setAllowedSelector(token, vault.ERC20_TRANSFER(), true);

        // Set allowed merchant recipient
        address merchant = vm.envOr("MERCHANT", deployer);
        vault.setAllowedRecipient(merchant, true);

        // Configure $5.00 tUSD8 per-tx cap (5,000,000) and $10.00 daily cap (10,000,000)
        vault.setTokenPolicy(token, 5 * 1e6, 10 * 1e6);

        vm.stopBroadcast();

        console.log("==================================================");
        console.log("AEVUM DEPLOYMENT COMPLETED");
        console.log("==================================================");
        console.log("Chain ID         :", block.chainid);
        console.log("Deployer / Owner :", deployer);
        console.log("AgentVault       :", address(vault));
        console.log("ERC8004Identity  :", address(identity));
        console.log("ERC8004Reputation:", address(reputation));
        console.log("tUSD8 Token      :", token);
        console.log("Merchant Recipient:", merchant);
        console.log("Agent Key        :", agentKey);
        console.log("==================================================");
    }
}
