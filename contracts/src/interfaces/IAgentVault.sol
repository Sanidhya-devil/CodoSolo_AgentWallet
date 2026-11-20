// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IAgentVault
 * @notice Interface for AgentVault ERC-4337 smart account with policy enforcement, auto-freeze, and guardian recovery
 */
interface IAgentVault {
    enum AgentStatus {
        ACTIVE,
        FROZEN,
        REVOKED,
        EXPIRED,
        RECOVERY_PENDING,
        RECOVERED
    }

    struct Policy {
        uint256 perTxCap;
        uint256 dailyCap;
        uint256 spentInWindow;
        uint256 windowStart;
        uint256 windowDuration;
        uint256 agentExpiry;
    }

    struct RecoveryRequest {
        uint256 id;
        address proposedNewOwner;
        address proposedNewAgent;
        uint256 approvalCount;
        uint256 thresholdMetTimestamp;
        bool vetoed;
        bool executed;
    }

    // Events
    event PolicyUpdated(uint256 perTxCap, uint256 dailyCap, uint256 windowDuration, uint256 agentExpiry);
    event AgentKeySet(address indexed agentKey, uint256 expiry);
    event AgentFrozen(string reason, address indexed triggeredBy);
    event AgentRevoked(address indexed triggeredBy);
    event AgentUnfrozen(address indexed triggeredBy);
    event TargetApprovalUpdated(address indexed target, bool allowed);
    event SelectorApprovalUpdated(address indexed target, bytes4 indexed selector, bool allowed);
    event RecipientApprovalUpdated(address indexed recipient, bool allowed);
    event DetectorUpdated(address indexed detector);
    event TransactionExecuted(address indexed dest, uint256 value, bytes data);
    event TransactionBlocked(string reasonCode, address indexed dest, uint256 value);
    event RecoveryRequested(uint256 indexed recoveryId, address indexed proposedNewOwner, address indexed proposedNewAgent);
    event RecoveryApproved(uint256 indexed recoveryId, address indexed guardian, uint256 totalApprovals);
    event RecoveryVetoed(uint256 indexed recoveryId, address indexed owner);
    event RecoveryExecuted(uint256 indexed recoveryId, address newOwner, address newAgent);
    event TokenPolicyUpdated(address indexed token, uint256 perTxCap, uint256 dailyCap);
    event VaultDeposited(address indexed token, address indexed from, uint256 amount);

    // Core Management
    function setPolicy(uint256 perTxCap, uint256 dailyCap, uint256 windowDuration, uint256 agentExpiry) external;
    function setTokenPolicy(address token, uint256 perTxCap, uint256 dailyCap) external;
    function setAgentKey(address _agentKey, uint256 _expiry) external;
    function setAllowedRecipient(address recipient, bool allowed) external;
    function setAllowedTarget(address target, bool allowed) external;
    function setAllowedSelector(address target, bytes4 selector, bool allowed) external;
    function setAuthorizedDetector(address detector) external;

    // Freeze & Containment
    function freezeAgent(string calldata reason) external;
    function unfreezeAgent() external;
    function revokeAgent() external;

    // Execution
    function execute(address dest, uint256 value, bytes calldata func) external;
    function executeByAgent(address dest, uint256 value, bytes calldata func) external returns (bytes memory);
    function executeBatch(address[] calldata dests, uint256[] calldata values, bytes[] calldata funcs) external;

    // Recovery
    function requestRecovery(address proposedNewOwner, address proposedNewAgent) external returns (uint256 recoveryId);
    function approveRecovery(uint256 recoveryId) external;
    function vetoRecovery(uint256 recoveryId) external;
    function executeRecovery(uint256 recoveryId) external;

    // Views
    function getStatus() external view returns (AgentStatus);
    function isRecipientAllowed(address recipient) external view returns (bool);
    function isTargetAllowed(address target) external view returns (bool);
    function isSelectorAllowed(address target, bytes4 selector) external view returns (bool);
    function getSpentToday() external view returns (uint256);
    function getTokenSpentToday(address token) external view returns (uint256);
}
