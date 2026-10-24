// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IEntryPoint.sol";
import "./interfaces/IAgentVault.sol";

/**
 * @title AgentVaultPaymaster
 * @notice ERC-4337 Paymaster that enforces per-agent gas sponsorship quotas with atomic batch reservation,
 *         preventing multi-operation batch quota bypass and spam drain attacks.
 */
contract AgentVaultPaymaster is IPaymaster {
    string public constant SPONSOR_QUOTA_EXCEEDED = "SPONSOR_QUOTA_EXCEEDED";

    struct Quota {
        uint256 maxOps;
        uint256 opsUsed;
        uint256 maxGasValue;
        uint256 gasValueUsed;
        uint256 reservedOps;      // Atomic in-flight batch reservations
        uint256 reservedGasValue;  // Atomic in-flight cost reservations
        bool enabled;
    }

    address public owner;
    IEntryPoint public immutable entryPoint;

    mapping(address => Quota) public quotas;

    event QuotaConfigured(address indexed vault, uint256 maxOps, uint256 maxGasValue, bool enabled);
    event QuotaReserved(address indexed vault, uint256 maxCost, uint256 totalReservedOps);
    event GasSponsored(address indexed vault, uint256 actualGasCost, uint256 opsUsed);
    event SponsorshipRejected(address indexed vault, string reason);

    modifier onlyOwner() {
        require(msg.sender == owner, "Paymaster: caller is not owner");
        _;
    }

    modifier onlyEntryPoint() {
        require(msg.sender == address(entryPoint), "Paymaster: caller not EntryPoint");
        _;
    }

    constructor(IEntryPoint _entryPoint, address _owner) {
        entryPoint = _entryPoint;
        owner = _owner;
    }

    receive() external payable {}

    function setQuota(
        address vault,
        uint256 maxOps,
        uint256 maxGasValue,
        bool enabled
    ) external onlyOwner {
        quotas[vault] = Quota({
            maxOps: maxOps,
            opsUsed: 0,
            maxGasValue: maxGasValue,
            gasValueUsed: 0,
            reservedOps: 0,
            reservedGasValue: 0,
            enabled: enabled
        });
        emit QuotaConfigured(vault, maxOps, maxGasValue, enabled);
    }

    function deposit() external payable {
        entryPoint.depositTo{value: msg.value}(address(this));
    }

    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 /* userOpHash */,
        uint256 maxCost
    ) external override onlyEntryPoint returns (bytes memory context, uint256 validationData) {
        address vault = userOp.sender;
        Quota storage q = quotas[vault];

        if (!q.enabled) {
            emit SponsorshipRejected(vault, "SPONSORSHIP_DISABLED");
            return ("", 1); // SIG_VALIDATION_FAILED
        }

        // Check if vault agent is frozen, revoked, expired, or recovery pending
        try IAgentVault(vault).getStatus() returns (IAgentVault.AgentStatus status) {
            if (status != IAgentVault.AgentStatus.ACTIVE) {
                emit SponsorshipRejected(vault, "AGENT_INACTIVE_OR_CONTAINED");
                return ("", 1);
            }
        } catch {
            emit SponsorshipRejected(vault, "INVALID_VAULT");
            return ("", 1);
        }

        // P1 FIX: Atomic reservation check taking in-flight batch ops into account
        if (q.opsUsed + q.reservedOps + 1 > q.maxOps) {
            emit SponsorshipRejected(vault, SPONSOR_QUOTA_EXCEEDED);
            return ("", 1);
        }

        // Atomic reservation check for gas cost
        if (q.gasValueUsed + q.reservedGasValue + maxCost > q.maxGasValue) {
            emit SponsorshipRejected(vault, SPONSOR_QUOTA_EXCEEDED);
            return ("", 1);
        }

        // Atomically lock reservations during validation
        q.reservedOps += 1;
        q.reservedGasValue += maxCost;

        emit QuotaReserved(vault, maxCost, q.reservedOps);

        context = abi.encode(vault, maxCost);
        return (context, 0); // Validation success
    }

    function postOp(
        uint8 /* mode */,
        bytes calldata context,
        uint256 actualGasCost
    ) external override onlyEntryPoint {
        (address vault, uint256 maxCost) = abi.decode(context, (address, uint256));
        Quota storage q = quotas[vault];

        // Release reservation
        if (q.reservedOps > 0) {
            q.reservedOps -= 1;
        }
        if (q.reservedGasValue >= maxCost) {
            q.reservedGasValue -= maxCost;
        } else {
            q.reservedGasValue = 0;
        }

        // Apply actual reconciled cost
        q.opsUsed += 1;
        q.gasValueUsed += actualGasCost;

        emit GasSponsored(vault, actualGasCost, q.opsUsed);
    }

    function getQuota(address vault) external view returns (
        uint256 maxOps,
        uint256 opsUsed,
        uint256 maxGasValue,
        uint256 gasValueUsed,
        uint256 reservedOps,
        uint256 reservedGasValue,
        bool enabled
    ) {
        Quota memory q = quotas[vault];
        return (q.maxOps, q.opsUsed, q.maxGasValue, q.gasValueUsed, q.reservedOps, q.reservedGasValue, q.enabled);
    }
}
