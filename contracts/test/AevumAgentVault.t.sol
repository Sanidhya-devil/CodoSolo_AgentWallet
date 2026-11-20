// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AgentVault.sol";
import "../src/ERC8004Identity.sol";
import "../src/ERC8004Reputation.sol";
import "../src/mocks/MockUSD8.sol";
import "../src/mocks/MockEntryPoint.sol";

contract AevumAgentVaultTest is Test {
    AgentVault public vault;
    ERC8004Identity public identity;
    ERC8004Reputation public reputation;
    MockUSD8 public tusd8;
    MockEntryPoint public entryPoint;

    address public owner = address(0x1111);
    address public agent = address(0x2222);
    address public detector = address(0x3333);
    address public merchant = address(0x4444);
    address public hacker = address(0x9999);
    address[5] public guardians = [
        address(0x5001),
        address(0x5002),
        address(0x5003),
        address(0x5004),
        address(0x5005)
    ];

    // tUSD8 amounts with 6 decimals ($1.50, $5.00, $10.00, $50.00)
    uint256 public constant TUSD8_UNIT = 1e6;
    uint256 public constant PER_TX_CAP = 5 * TUSD8_UNIT;    // $5.00
    uint256 public constant DAILY_CAP = 10 * TUSD8_UNIT;   // $10.00

    function setUp() public {
        vm.startPrank(owner);

        entryPoint = new MockEntryPoint();
        tusd8 = new MockUSD8();
        identity = new ERC8004Identity();
        reputation = new ERC8004Reputation();

        vault = new AgentVault(
            IEntryPoint(address(entryPoint)),
            owner,
            guardians,
            48 hours
        );

        // Configure Policy & Roles
        vault.setAgentKey(agent, block.timestamp + 30 days);
        vault.setAuthorizedDetector(detector);

        // Configure tUSD8 policy
        vault.setAllowedTarget(address(tusd8), true);
        vault.setAllowedSelector(address(tusd8), vault.ERC20_TRANSFER(), true);
        vault.setAllowedRecipient(merchant, true);
        vault.setTokenPolicy(address(tusd8), PER_TX_CAP, DAILY_CAP);

        // Fund vault with 1,000 tUSD8
        tusd8.mint(address(vault), 1000 * TUSD8_UNIT);

        vm.stopPrank();
    }

    function test_BenignPayment_Allowed() public {
        uint256 payAmount = 1500000; // $1.50 tUSD8
        bytes memory callData = abi.encodeWithSelector(
            vault.ERC20_TRANSFER(),
            merchant,
            payAmount
        );

        vm.prank(agent);
        vault.executeByAgent(address(tusd8), 0, callData);

        assertEq(tusd8.balanceOf(merchant), payAmount);
        assertEq(vault.getTokenSpentToday(address(tusd8)), payAmount);
    }

    function test_Overspend_Blocked() public {
        uint256 overspendAmount = 50 * TUSD8_UNIT; // $50.00 > $5.00 cap
        bytes memory callData = abi.encodeWithSelector(
            vault.ERC20_TRANSFER(),
            merchant,
            overspendAmount
        );

        vm.prank(agent);
        vm.expectRevert("AgentVault: TOKEN_TX_LIMIT_EXCEEDED");
        vault.executeByAgent(address(tusd8), 0, callData);
    }

    function test_DailyCapDrain_Blocked() public {
        bytes memory callData = abi.encodeWithSelector(
            vault.ERC20_TRANSFER(),
            merchant,
            4 * TUSD8_UNIT // $4.00
        );

        vm.startPrank(agent);
        // Tx 1: $4.00 -> total $4.00 (OK)
        vault.executeByAgent(address(tusd8), 0, callData);
        // Tx 2: $4.00 -> total $8.00 (OK)
        vault.executeByAgent(address(tusd8), 0, callData);

        // Tx 3: $4.00 -> total $12.00 > $10.00 daily cap -> REVERT
        vm.expectRevert("AgentVault: TOKEN_DAILY_LIMIT_EXCEEDED");
        vault.executeByAgent(address(tusd8), 0, callData);
        vm.stopPrank();

        assertEq(tusd8.balanceOf(merchant), 8 * TUSD8_UNIT);
    }

    function test_UnapprovedRecipient_Blocked() public {
        bytes memory callData = abi.encodeWithSelector(
            vault.ERC20_TRANSFER(),
            hacker, // not on allowlist
            1 * TUSD8_UNIT
        );

        vm.prank(agent);
        vm.expectRevert("AgentVault: RECIPIENT_NOT_ALLOWED");
        vault.executeByAgent(address(tusd8), 0, callData);
    }

    function test_DetectorAutoFreeze_Contained() public {
        // Detector detects burst attack or prompt injection and freezes agent
        vm.prank(detector);
        vault.freezeAgent("BURST_RATE_EXCEEDED_PROMPT_INJECTION");

        assertEq(uint8(vault.getStatus()), uint8(IAgentVault.AgentStatus.FROZEN));

        // Subsequent agent actions must revert immediately
        bytes memory callData = abi.encodeWithSelector(
            vault.ERC20_TRANSFER(),
            merchant,
            1 * TUSD8_UNIT
        );

        vm.prank(agent);
        vm.expectRevert("AgentVault: AGENT_FROZEN");
        vault.executeByAgent(address(tusd8), 0, callData);
    }

    function test_ERC8004_IdentityAndReputation() public {
        vm.prank(agent);
        uint256 agentId = identity.register("ipfs://bafkreiaims435hmzeg3l6ixlrlvnei7wept5kmfd6c2ncz3ucl466xhucu");
        assertEq(agentId, 1);
        assertEq(identity.ownerOf(agentId), agent);

        // Client gives verifiable feedback after task completion
        bytes32 taskHash = keccak256("task-payment-001");
        reputation.giveFeedback(agentId, 95, taskHash, "Fast LLM inference delivery");

        (uint256 totalFeedback, uint256 averageScore, uint256 disputeCount) = reputation.getSummary(agentId);
        assertEq(totalFeedback, 1);
        assertEq(averageScore, 95);
        assertEq(disputeCount, 0);
    }

    function test_GaslessDeposit_WithAuthorization() public {
        uint256 depositKey = 0xA11CE;
        address depositor = vm.addr(depositKey);
        uint256 depositAmount = 25 * TUSD8_UNIT;

        tusd8.mint(depositor, depositAmount);
        assertEq(tusd8.balanceOf(depositor), depositAmount);

        bytes32 nonce = keccak256("nonce-deposit-1");
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;

        bytes32 structHash = keccak256(
            abi.encode(
                tusd8.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                depositor,
                address(vault),
                depositAmount,
                validAfter,
                validBefore,
                nonce
            )
        );

        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", tusd8.DOMAIN_SEPARATOR(), structHash)
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(depositKey, digest);

        // Relayer submits gaslessly on behalf of depositor
        address relayer = address(0x7777);
        vm.prank(relayer);
        vault.depositWithAuthorization(
            address(tusd8),
            depositor,
            depositAmount,
            validAfter,
            validBefore,
            nonce,
            v,
            r,
            s
        );

        assertEq(tusd8.balanceOf(address(vault)), (1000 + 25) * TUSD8_UNIT);
        assertEq(tusd8.balanceOf(depositor), 0);
    }
}
