// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IAgentVault.sol";
import "./interfaces/IEntryPoint.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @notice EIP-3009 (USDC/tUSD8-style) signed transfer authorization interface
interface IERC3009 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

/**
 * @title AgentVault
 * @notice ERC-4337 compatible smart account wallet with policy-constrained AI agent authority,
 *         automated detector containment, token-aware spending limits, single-use owner approval exceptions,
 *         and 3-of-5 guardian recovery with 48h timelock and owner veto.
 * @author CodoSolo / Sanidhya Gupta (AgentVault W3-02)
 */
contract AgentVault is IAgentVault, IAccount {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    uint256 internal constant SIG_VALIDATION_FAILED = 1;
    uint256 internal constant SIG_VALIDATION_SUCCESS = 0;

    // Standard Reason Codes
    string public constant TX_LIMIT_EXCEEDED = "TX_LIMIT_EXCEEDED";
    string public constant DAILY_LIMIT_EXCEEDED = "DAILY_LIMIT_EXCEEDED";
    string public constant RECIPIENT_NOT_ALLOWED = "RECIPIENT_NOT_ALLOWED";
    string public constant TARGET_NOT_ALLOWED = "TARGET_NOT_ALLOWED";
    string public constant AGENT_EXPIRED = "AGENT_EXPIRED";
    string public constant AGENT_FROZEN = "AGENT_FROZEN";
    string public constant AGENT_REVOKED = "AGENT_REVOKED";
    string public constant RECOVERY_PENDING = "RECOVERY_PENDING";
    string public constant RECOVERY_DELAY_ACTIVE = "RECOVERY_DELAY_ACTIVE";
    string public constant RECOVERY_VETOED = "RECOVERY_VETOED";
    string public constant SPONSOR_QUOTA_EXCEEDED = "SPONSOR_QUOTA_EXCEEDED";
    string public constant APPROVAL_EXPIRED = "APPROVAL_EXPIRED";
    string public constant APPROVAL_ALREADY_USED = "APPROVAL_ALREADY_USED";
    string public constant INVALID_OWNER_APPROVAL = "INVALID_OWNER_APPROVAL";

    // Standard ERC-20 Selectors
    bytes4 public constant ERC20_TRANSFER = 0xa9059cbb; // transfer(address,uint256)
    bytes4 public constant ERC20_APPROVE = 0x095ea7b3;  // approve(address,uint256)

    // Standard recovery timelock delay: 48 hours
    uint256 public recoveryDelay = 48 hours;

    // Roles
    address public owner;
    address public agentKey;
    address public authorizedDetector;
    IEntryPoint public entryPoint;

    // State & Policy
    AgentStatus public agentStatus;
    Policy public policy;

    // Allowlists
    mapping(address => bool) public allowedRecipients;
    mapping(address => bool) public allowedTargets;
    mapping(address => mapping(bytes4 => bool)) public allowedSelectors;

    // Token-specific per-tx caps and daily caps (e.g. for tUSD8)
    mapping(address => uint256) public tokenPerTxCap;
    mapping(address => uint256) public tokenDailyCap;
    mapping(address => uint256) public tokenSpentInWindow;
    mapping(address => uint256) public tokenWindowStart;

    // Guardians & Recovery
    address[5] public guardians;
    mapping(address => bool) public isGuardian;
    uint256 public recoveryRequestCount;
    mapping(uint256 => RecoveryRequest) public recoveryRequests;
    mapping(uint256 => mapping(address => bool)) public guardianApproved;

    // Single-use Owner Approval Exceptions
    mapping(bytes32 => bool) public usedOwnerApprovals;

    event TokenCapUpdated(address indexed token, uint256 perTxCap);
    event OwnerApprovalConsumed(bytes32 indexed approvalHash, address indexed dest, uint256 value);

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "AgentVault: caller is not owner");
        _;
    }

    modifier onlyEntryPointOrOwner() {
        require(msg.sender == address(entryPoint) || msg.sender == owner, "AgentVault: caller not EntryPoint or owner");
        _;
    }

    modifier onlyDetectorOrOwner() {
        require(
            msg.sender == owner || (authorizedDetector != address(0) && msg.sender == authorizedDetector),
            "AgentVault: caller not detector or owner"
        );
        _;
    }

    modifier onlyGuardian() {
        require(isGuardian[msg.sender], "AgentVault: caller is not guardian");
        _;
    }

    constructor(
        IEntryPoint _entryPoint,
        address _owner,
        address[5] memory _guardians,
        uint256 _recoveryDelay
    ) {
        require(_owner != address(0), "AgentVault: invalid owner");
        entryPoint = _entryPoint;
        owner = _owner;
        agentStatus = AgentStatus.ACTIVE;

        if (_recoveryDelay > 0) {
            recoveryDelay = _recoveryDelay;
        }

        for (uint256 i = 0; i < 5; i++) {
            require(_guardians[i] != address(0), "AgentVault: invalid guardian");
            guardians[i] = _guardians[i];
            isGuardian[_guardians[i]] = true;
        }

        policy.windowDuration = 1 days;
        policy.windowStart = block.timestamp;
    }

    receive() external payable {}

    // =========================================================================
    // Policy Configuration (Owner Only)
    // =========================================================================

    function setPolicy(
        uint256 perTxCap,
        uint256 dailyCap,
        uint256 windowDuration,
        uint256 agentExpiry
    ) external override onlyOwner {
        require(perTxCap <= dailyCap, "AgentVault: perTxCap exceeds dailyCap");
        policy.perTxCap = perTxCap;
        policy.dailyCap = dailyCap;
        policy.windowDuration = windowDuration > 0 ? windowDuration : 1 days;
        policy.agentExpiry = agentExpiry;
        if (policy.windowStart == 0) {
            policy.windowStart = block.timestamp;
        }
        emit PolicyUpdated(perTxCap, dailyCap, policy.windowDuration, agentExpiry);
    }

    function setAgentKey(address _agentKey, uint256 _expiry) external override onlyOwner {
        require(_agentKey != address(0), "AgentVault: invalid agent key");
        require(_agentKey != owner, "AgentVault: agent key cannot be owner");
        agentKey = _agentKey;
        policy.agentExpiry = _expiry;
        agentStatus = AgentStatus.ACTIVE;
        emit AgentKeySet(_agentKey, _expiry);
    }

    function setAllowedRecipient(address recipient, bool allowed) external override onlyOwner {
        allowedRecipients[recipient] = allowed;
        emit RecipientApprovalUpdated(recipient, allowed);
    }

    function setAllowedTarget(address target, bool allowed) external override onlyOwner {
        allowedTargets[target] = allowed;
        emit TargetApprovalUpdated(target, allowed);
    }

    function setAllowedSelector(address target, bytes4 selector, bool allowed) external override onlyOwner {
        allowedSelectors[target][selector] = allowed;
        emit SelectorApprovalUpdated(target, selector, allowed);
    }

    function setTokenCap(address token, uint256 perTxCap) external onlyOwner {
        tokenPerTxCap[token] = perTxCap;
        emit TokenCapUpdated(token, perTxCap);
    }

    function setTokenPolicy(address token, uint256 perTxCap, uint256 dailyCap) external override onlyOwner {
        require(perTxCap <= dailyCap, "AgentVault: token perTxCap exceeds dailyCap");
        tokenPerTxCap[token] = perTxCap;
        tokenDailyCap[token] = dailyCap;
        if (tokenWindowStart[token] == 0) {
            tokenWindowStart[token] = block.timestamp;
        }
        emit TokenPolicyUpdated(token, perTxCap, dailyCap);
    }

    function setAuthorizedDetector(address detector) external override onlyOwner {
        authorizedDetector = detector;
        emit DetectorUpdated(detector);
    }

    // =========================================================================
    // Freeze, Revocation & Containment
    // =========================================================================

    function freezeAgent(string calldata reason) external override onlyDetectorOrOwner {
        require(agentStatus != AgentStatus.REVOKED, "AgentVault: cannot freeze revoked agent");
        agentStatus = AgentStatus.FROZEN;
        emit AgentFrozen(reason, msg.sender);
    }

    function unfreezeAgent() external override onlyOwner {
        require(agentStatus == AgentStatus.FROZEN, "AgentVault: agent is not frozen");
        agentStatus = AgentStatus.ACTIVE;
        emit AgentUnfrozen(msg.sender);
    }

    function revokeAgent() external override onlyOwner {
        agentStatus = AgentStatus.REVOKED;
        agentKey = address(0);
        emit AgentRevoked(msg.sender);
    }

    // =========================================================================
    // ERC-4337 Account Validation
    // =========================================================================

    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external override returns (uint256 validationData) {
        require(msg.sender == address(entryPoint), "AgentVault: caller not EntryPoint");

        bytes32 ethHash = userOpHash.toEthSignedMessageHash();
        address signer = ethHash.recover(userOp.signature);

        if (signer == owner) {
            _payPrefund(missingAccountFunds);
            return SIG_VALIDATION_SUCCESS;
        }

        if (signer != agentKey || agentKey == address(0)) {
            return SIG_VALIDATION_FAILED;
        }

        // P0 FIX: Explicitly reject agent operations if RECOVERY_PENDING, FROZEN, REVOKED, or EXPIRED
        if (agentStatus == AgentStatus.RECOVERY_PENDING) {
            emit TransactionBlocked(RECOVERY_PENDING, address(0), 0);
            return SIG_VALIDATION_FAILED;
        }
        if (agentStatus == AgentStatus.FROZEN) {
            emit TransactionBlocked(AGENT_FROZEN, address(0), 0);
            return SIG_VALIDATION_FAILED;
        }
        if (agentStatus == AgentStatus.REVOKED) {
            emit TransactionBlocked(AGENT_REVOKED, address(0), 0);
            return SIG_VALIDATION_FAILED;
        }
        if (block.timestamp > policy.agentExpiry && policy.agentExpiry != 0) {
            emit TransactionBlocked(AGENT_EXPIRED, address(0), 0);
            return SIG_VALIDATION_FAILED;
        }

        // Decode callData to enforce policy rules atomically
        (bool inPolicy, string memory reason, address dest, uint256 val) = _validateAgentCallData(userOp.callData);
        if (!inPolicy) {
            emit TransactionBlocked(reason, dest, val);
            return SIG_VALIDATION_FAILED;
        }

        // Record spending window accounting
        _recordSpend(val);

        _payPrefund(missingAccountFunds);
        return SIG_VALIDATION_SUCCESS;
    }

    function _validateAgentCallData(bytes calldata callData) internal view returns (bool, string memory, address, uint256) {
        if (callData.length < 4) {
            return (false, TARGET_NOT_ALLOWED, address(0), 0);
        }

        bytes4 selector = bytes4(callData[:4]);

        if (selector == this.execute.selector) {
            (address dest, uint256 val, bytes memory innerFunc) = abi.decode(callData[4:], (address, uint256, bytes));
            
            // Per-transaction ETH limit
            if (policy.perTxCap > 0 && val > policy.perTxCap) {
                return (false, TX_LIMIT_EXCEEDED, dest, val);
            }

            // Daily ETH limit
            uint256 currentSpend = _calculateCurrentWindowSpend();
            if (policy.dailyCap > 0 && currentSpend + val > policy.dailyCap) {
                return (false, DAILY_LIMIT_EXCEEDED, dest, val);
            }

            // Pure ETH transfer -> destination must be in allowedRecipients
            if (innerFunc.length == 0) {
                if (!allowedRecipients[dest]) {
                    return (false, RECIPIENT_NOT_ALLOWED, dest, val);
                }
                return (true, "", dest, val);
            }

            // Contract call -> target address must be in allowedTargets
            if (!allowedTargets[dest]) {
                return (false, TARGET_NOT_ALLOWED, dest, val);
            }

            if (innerFunc.length < 4) {
                return (false, TARGET_NOT_ALLOWED, dest, val);
            }

            bytes4 innerSelector = bytes4(innerFunc);

            // Function selector must be explicitly allowed
            if (!allowedSelectors[dest][innerSelector]) {
                return (false, TARGET_NOT_ALLOWED, dest, val);
            }

            // P0 FIX: Token-aware inspection for ERC-20 transfer(address,uint256)
            if (innerSelector == ERC20_TRANSFER) {
                if (innerFunc.length < 68) {
                    return (false, TARGET_NOT_ALLOWED, dest, val);
                }
                address tokenRecipient;
                uint256 tokenAmount;
                assembly {
                    tokenRecipient := mload(add(innerFunc, 36))
                    tokenAmount := mload(add(innerFunc, 68))
                }
                
                // Recipient must be in allowedRecipients
                if (!allowedRecipients[tokenRecipient]) {
                    return (false, RECIPIENT_NOT_ALLOWED, tokenRecipient, 0);
                }

                // If a token per-tx cap is configured, enforce it
                if (tokenPerTxCap[dest] > 0 && tokenAmount > tokenPerTxCap[dest]) {
                    return (false, TX_LIMIT_EXCEEDED, dest, tokenAmount);
                }

                // If a token daily cap is configured, enforce it
                uint256 currentTokenSpend = _calculateTokenWindowSpend(dest);
                if (tokenDailyCap[dest] > 0 && currentTokenSpend + tokenAmount > tokenDailyCap[dest]) {
                    return (false, DAILY_LIMIT_EXCEEDED, dest, tokenAmount);
                }
            }

            // Prohibit arbitrary ERC-20 approve by default to prevent allowance drains
            if (innerSelector == ERC20_APPROVE) {
                if (!allowedSelectors[dest][ERC20_APPROVE]) {
                    return (false, TARGET_NOT_ALLOWED, dest, val);
                }
            }

            return (true, "", dest, val);
        }

        return (false, TARGET_NOT_ALLOWED, address(0), 0);
    }

    function _calculateCurrentWindowSpend() internal view returns (uint256) {
        if (block.timestamp >= policy.windowStart + policy.windowDuration) {
            return 0; // Window has reset
        }
        return policy.spentInWindow;
    }

    function _calculateTokenWindowSpend(address token) internal view returns (uint256) {
        uint256 duration = policy.windowDuration > 0 ? policy.windowDuration : 1 days;
        if (block.timestamp >= tokenWindowStart[token] + duration) {
            return 0;
        }
        return tokenSpentInWindow[token];
    }

    function _recordSpend(uint256 amount) internal {
        if (amount == 0) return;
        if (block.timestamp >= policy.windowStart + policy.windowDuration) {
            policy.windowStart = block.timestamp;
            policy.spentInWindow = amount;
        } else {
            policy.spentInWindow += amount;
        }
    }

    function _recordTokenSpend(address token, uint256 amount) internal {
        if (amount == 0) return;
        uint256 duration = policy.windowDuration > 0 ? policy.windowDuration : 1 days;
        if (block.timestamp >= tokenWindowStart[token] + duration) {
            tokenWindowStart[token] = block.timestamp;
            tokenSpentInWindow[token] = amount;
        } else {
            tokenSpentInWindow[token] += amount;
        }
    }

    function getTokenSpentToday(address token) external view override returns (uint256) {
        return _calculateTokenWindowSpend(token);
    }

    function _payPrefund(uint256 missingAccountFunds) internal {
        if (missingAccountFunds > 0) {
            (bool success, ) = payable(msg.sender).call{value: missingAccountFunds}("");
            (success);
        }
    }

    // =========================================================================
    // Execution Functions
    // =========================================================================

    function execute(address dest, uint256 value, bytes calldata func) external override onlyEntryPointOrOwner {
        require(address(this).balance >= value, "AgentVault: insufficient balance");
        
        (bool success, bytes memory result) = dest.call{value: value}(func);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
        emit TransactionExecuted(dest, value, func);
    }

    /// @notice Direct execution path for agentKey or owner on Aevum testnet (bypasses bundler dependency while preserving all policy and freeze guardrails)
    function executeByAgent(
        address dest,
        uint256 value,
        bytes calldata func
    ) external override returns (bytes memory) {
        require(msg.sender == agentKey || msg.sender == owner, "AgentVault: caller not agentKey or owner");

        if (agentStatus == AgentStatus.RECOVERY_PENDING) {
            emit TransactionBlocked(RECOVERY_PENDING, dest, value);
            revert("AgentVault: RECOVERY_PENDING");
        }
        if (agentStatus == AgentStatus.FROZEN) {
            emit TransactionBlocked(AGENT_FROZEN, dest, value);
            revert("AgentVault: AGENT_FROZEN");
        }
        if (agentStatus == AgentStatus.REVOKED) {
            emit TransactionBlocked(AGENT_REVOKED, dest, value);
            revert("AgentVault: AGENT_REVOKED");
        }
        if (block.timestamp > policy.agentExpiry && policy.agentExpiry != 0) {
            emit TransactionBlocked(AGENT_EXPIRED, dest, value);
            revert("AgentVault: AGENT_EXPIRED");
        }

        // Validate value (native/ETH) policy
        if (value > 0) {
            require(address(this).balance >= value, "AgentVault: insufficient balance");
            if (policy.perTxCap > 0 && value > policy.perTxCap) {
                emit TransactionBlocked(TX_LIMIT_EXCEEDED, dest, value);
                revert("AgentVault: TX_LIMIT_EXCEEDED");
            }
            uint256 currentSpend = _calculateCurrentWindowSpend();
            if (policy.dailyCap > 0 && currentSpend + value > policy.dailyCap) {
                emit TransactionBlocked(DAILY_LIMIT_EXCEEDED, dest, value);
                revert("AgentVault: DAILY_LIMIT_EXCEEDED");
            }
        }

        // Validate destination
        if (func.length == 0) {
            if (!allowedRecipients[dest]) {
                emit TransactionBlocked(RECIPIENT_NOT_ALLOWED, dest, value);
                revert("AgentVault: RECIPIENT_NOT_ALLOWED");
            }
            if (value > 0) _recordSpend(value);
            (bool ok, bytes memory res) = dest.call{value: value}("");
            require(ok, "AgentVault: transfer failed");
            emit TransactionExecuted(dest, value, func);
            return res;
        }

        if (!allowedTargets[dest]) {
            emit TransactionBlocked(TARGET_NOT_ALLOWED, dest, value);
            revert("AgentVault: TARGET_NOT_ALLOWED");
        }

        bytes4 innerSelector = bytes4(func[:4]);
        if (!allowedSelectors[dest][innerSelector]) {
            emit TransactionBlocked(TARGET_NOT_ALLOWED, dest, value);
            revert("AgentVault: SELECTOR_NOT_ALLOWED");
        }

        // Token inspection for ERC20_TRANSFER
        if (innerSelector == ERC20_TRANSFER && func.length >= 68) {
            (address tokenRecipient, uint256 tokenAmount) = abi.decode(func[4:], (address, uint256));

            if (!allowedRecipients[tokenRecipient]) {
                emit TransactionBlocked(RECIPIENT_NOT_ALLOWED, tokenRecipient, tokenAmount);
                revert("AgentVault: RECIPIENT_NOT_ALLOWED");
            }

            if (tokenPerTxCap[dest] > 0 && tokenAmount > tokenPerTxCap[dest]) {
                emit TransactionBlocked(TX_LIMIT_EXCEEDED, dest, tokenAmount);
                revert("AgentVault: TOKEN_TX_LIMIT_EXCEEDED");
            }

            uint256 currentTokenSpend = _calculateTokenWindowSpend(dest);
            if (tokenDailyCap[dest] > 0 && currentTokenSpend + tokenAmount > tokenDailyCap[dest]) {
                emit TransactionBlocked(DAILY_LIMIT_EXCEEDED, dest, tokenAmount);
                revert("AgentVault: TOKEN_DAILY_LIMIT_EXCEEDED");
            }

            _recordTokenSpend(dest, tokenAmount);
        }

        if (value > 0) {
            _recordSpend(value);
        }

        (bool success, bytes memory result) = dest.call{value: value}(func);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
        emit TransactionExecuted(dest, value, func);
        return result;
    }

    /// @notice Gasless top-up via EIP-3009 (tUSD8 on Aevum testnet)
    function depositWithAuthorization(
        address token,
        address from,
        uint256 amount,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        IERC3009(token).receiveWithAuthorization(
            from,
            address(this),
            amount,
            validAfter,
            validBefore,
            nonce,
            v,
            r,
            s
        );
        emit VaultDeposited(token, from, amount);
    }

    // P0 FIX: Cryptographic single-use Owner Exception Approval Path
    function executeWithApproval(
        address dest,
        uint256 value,
        bytes calldata func,
        uint256 nonce,
        uint256 expiry,
        bytes calldata ownerSignature
    ) external {
        require(block.timestamp <= expiry, APPROVAL_EXPIRED);

        // Bind approval to vault, dest, value, calldataHash, nonce, expiry, and chainId
        bytes32 approvalHash = keccak256(
            abi.encode(address(this), dest, value, keccak256(func), nonce, expiry, block.chainid)
        );

        require(!usedOwnerApprovals[approvalHash], APPROVAL_ALREADY_USED);

        bytes32 ethHash = approvalHash.toEthSignedMessageHash();
        address signer = ethHash.recover(ownerSignature);
        require(signer == owner, INVALID_OWNER_APPROVAL);

        usedOwnerApprovals[approvalHash] = true;

        (bool success, bytes memory result) = dest.call{value: value}(func);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }

        emit OwnerApprovalConsumed(approvalHash, dest, value);
        emit TransactionExecuted(dest, value, func);
    }

    function executeBatch(
        address[] calldata dests,
        uint256[] calldata values,
        bytes[] calldata funcs
    ) external override onlyOwner {
        require(dests.length == values.length && values.length == funcs.length, "AgentVault: length mismatch");
        for (uint256 i = 0; i < dests.length; i++) {
            (bool success, bytes memory result) = dests[i].call{value: values[i]}(funcs[i]);
            if (!success) {
                assembly {
                    revert(add(result, 32), mload(result))
                }
            }
            emit TransactionExecuted(dests[i], values[i], funcs[i]);
        }
    }

    // =========================================================================
    // 3-of-5 Guardian Recovery with 48h Delay & Owner Veto
    // =========================================================================

    function requestRecovery(
        address proposedNewOwner,
        address proposedNewAgent
    ) external override returns (uint256 recoveryId) {
        require(isGuardian[msg.sender] || msg.sender == owner, "AgentVault: unauthorized initiator");
        require(proposedNewOwner != address(0) || proposedNewAgent != address(0), "AgentVault: empty recovery payload");

        recoveryId = ++recoveryRequestCount;
        RecoveryRequest storage req = recoveryRequests[recoveryId];
        req.id = recoveryId;
        req.proposedNewOwner = proposedNewOwner;
        req.proposedNewAgent = proposedNewAgent;

        emit RecoveryRequested(recoveryId, proposedNewOwner, proposedNewAgent);

        // Guardian initiator auto-casts 1st distinct approval
        if (isGuardian[msg.sender]) {
            guardianApproved[recoveryId][msg.sender] = true;
            req.approvalCount = 1;
            emit RecoveryApproved(recoveryId, msg.sender, 1);
        }
    }

    function approveRecovery(uint256 recoveryId) external override onlyGuardian {
        RecoveryRequest storage req = recoveryRequests[recoveryId];
        require(req.id != 0, "AgentVault: nonexistent recovery");
        require(!req.vetoed, RECOVERY_VETOED);
        require(!req.executed, "AgentVault: already executed");
        require(!guardianApproved[recoveryId][msg.sender], "AgentVault: guardian already approved");

        guardianApproved[recoveryId][msg.sender] = true;
        req.approvalCount += 1;

        emit RecoveryApproved(recoveryId, msg.sender, req.approvalCount);

        // Threshold reached (3-of-5): starts 48-hour delay window and blocks agent operations
        if (req.approvalCount == 3) {
            req.thresholdMetTimestamp = block.timestamp;
            agentStatus = AgentStatus.RECOVERY_PENDING;
        }
    }

    function vetoRecovery(uint256 recoveryId) external override onlyOwner {
        RecoveryRequest storage req = recoveryRequests[recoveryId];
        require(req.id != 0, "AgentVault: nonexistent recovery");
        require(!req.executed, "AgentVault: already executed");
        require(!req.vetoed, "AgentVault: already vetoed");

        req.vetoed = true;
        if (agentStatus == AgentStatus.RECOVERY_PENDING) {
            agentStatus = AgentStatus.ACTIVE;
        }

        emit RecoveryVetoed(recoveryId, msg.sender);
    }

    function executeRecovery(uint256 recoveryId) external override {
        RecoveryRequest storage req = recoveryRequests[recoveryId];
        require(req.id != 0, "AgentVault: nonexistent recovery");
        require(!req.executed, "AgentVault: already executed");
        require(!req.vetoed, RECOVERY_VETOED);
        require(req.approvalCount >= 3, "AgentVault: guardian threshold not met");
        require(req.thresholdMetTimestamp != 0, "AgentVault: threshold timestamp unset");
        require(block.timestamp >= req.thresholdMetTimestamp + recoveryDelay, RECOVERY_DELAY_ACTIVE);

        req.executed = true;

        if (req.proposedNewOwner != address(0)) {
            owner = req.proposedNewOwner;
        }

        // Revoke old compromised agent key and provision new key if provided
        agentKey = req.proposedNewAgent;
        if (req.proposedNewAgent != address(0)) {
            agentStatus = AgentStatus.ACTIVE;
            emit AgentKeySet(req.proposedNewAgent, policy.agentExpiry);
        } else {
            agentStatus = AgentStatus.RECOVERED;
            emit AgentRevoked(msg.sender);
        }

        emit RecoveryExecuted(recoveryId, req.proposedNewOwner, req.proposedNewAgent);
    }

    // =========================================================================
    // View Functions
    // =========================================================================

    function getStatus() external view override returns (AgentStatus) {
        if (agentStatus == AgentStatus.ACTIVE && policy.agentExpiry != 0 && block.timestamp > policy.agentExpiry) {
            return AgentStatus.EXPIRED;
        }
        return agentStatus;
    }

    function isRecipientAllowed(address recipient) external view override returns (bool) {
        return allowedRecipients[recipient];
    }

    function isTargetAllowed(address target) external view override returns (bool) {
        return allowedTargets[target];
    }

    function isSelectorAllowed(address target, bytes4 selector) external view override returns (bool) {
        return allowedSelectors[target][selector];
    }

    function getSpentToday() external view override returns (uint256) {
        return _calculateCurrentWindowSpend();
    }
}
