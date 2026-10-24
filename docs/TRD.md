# AgentVault — Technical Requirements Document (TRD)

**Phase 1 + Phase 2 — Implementation Architecture & Verification**  
**Track:** W3-02 | **Team:** CodoSolo | **Author:** Sanidhya Gupta  

---

## 1. Technical Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Contracts** | Solidity 0.8.24 (Cancun EVM) | Smart account, policy engine, guardian recovery, paymaster quota, events |
| **Development** | Hardhat, TypeChain, Ethers.js v6 | Unit testing, fuzz/invariant verification, script deployments |
| **Account Abstraction** | ERC-4337 standard (`IAccount`, `IEntryPoint`, `IPaymaster`) | UserOperation validation and execution flow |
| **Agent Client** | Python 3.12, Web3.py, `eth_account` | Agent transaction intent generator, signing engine, attack scenarios |
| **Anomaly Detector** | Python 3.12 Rule Engine | Burst and rate violation monitoring with automated on-chain freeze |
| **Dashboard** | React 18, Vite, Tailwind CSS, Lucide | Real-time owner cockpit, policy editor, timelock tracker, scenario simulator |

---

## 2. Core Invariant & Validation Order

### Core Security Invariant
> **"Funds move only through valid owner authorization, an in-policy agent operation, or approved recovery."**

### Validation Order in `AgentVault.validateUserOp`:
1. **Sender Check:** Verify `msg.sender == address(entryPoint)`.
2. **Signer Recovery:** Recover signer address using EIP-191 ECDSA `userOpHash.toEthSignedMessageHash().recover(signature)`.
3. **Owner Bypass:** If signer is the owner, authorization succeeds immediately.
4. **Agent Authority Check:** Signer must equal active `agentKey`.
5. **Lifecycle State Checks:**
   - Revert if `agentStatus == FROZEN` (`AGENT_FROZEN`).
   - Revert if `agentStatus == REVOKED` (`AGENT_REVOKED`).
   - Revert if `agentStatus == RECOVERY_PENDING` (`RECOVERY_PENDING`).
   - Revert if `block.timestamp > policy.agentExpiry` (`AGENT_EXPIRED`).
6. **Payload Inspection & Policy Constraints:**
   - Decode destination `dest`, value `val`, and inner calldata `func`.
   - **Native ETH Transfers:**
     - Check `val <= policy.perTxCap` (`TX_LIMIT_EXCEEDED`).
     - Check `spentToday + val <= policy.dailyCap` (`DAILY_LIMIT_EXCEEDED`).
     - If pure transfer (`func.length == 0`): verify `allowedRecipients[dest]` (`RECIPIENT_NOT_ALLOWED`).
   - **Contract & Token Transfers (P0 Fix 2):**
     - If contract call: verify `allowedTargets[dest]` and `allowedSelectors[dest][selector]` (`TARGET_NOT_ALLOWED`).
     - If selector is ERC-20 `transfer(address,uint256)`: decode token recipient and token amount. Revert if token recipient is not in `allowedRecipients` (`RECIPIENT_NOT_ALLOWED`) or if token amount exceeds `tokenPerTxCap` (`TX_LIMIT_EXCEEDED`).
     - Rejects unapproved ERC-20 `approve(...)` calls (`TARGET_NOT_ALLOWED`).
7. **Atomic Accounting:** Update `spentInWindow` and window timestamps atomically.
8. **Prefund Settlement:** Fulfill `missingAccountFunds` if required by EntryPoint.

---

## 3. Cryptographic Owner Exception Flow (`executeWithApproval` - P0 Issue 4)
- When an operation falls outside standard policy parameters, the agent cannot execute it via standard `validateUserOp`.
- The owner can grant single-use permission by signing an authorization struct containing: `(vault, dest, value, dataHash, nonce, expiry, chainId)`.
- The contract enforces:
  - Exact digest EIP-191 signature recovery matching `owner`.
  - Expiration timestamp check (`block.timestamp <= expiry`).
  - Strict replay prevention: `usedApprovalNonces[nonce]` flag prevents replay.
  - Hard caps are never silently bypassed; approval is bound strictly to the specific `keccak256(data)`.

---

## 4. Paymaster Batch Atomic Reservations (P1 Issue 5)
- Prevents race conditions and quota bypass within multi-operation bundler batches:
  - In `validatePaymasterUserOp`, maximum potential gas cost (`maxCost = maxFeePerGas * (callGasLimit + verificationGasLimit + preVerificationGas)`) is checked against remaining quota AND immediately added to `reservedQuota[agentKey]`.
  - In `postOp`, actual gas used (`actualGasCost`) is deducted from the cumulative spent quota, and the temporary batch reservation is released.

---

## 5. Anomaly Detector Trust Boundary (P1 Issue 10)
- The detector key/role is strictly granted **freeze authority only**:
  - Callable functions: `freezeAgent()`.
  - Expressly forbidden: cannot transfer funds, cannot initiate guardian recovery, cannot unfreeze, cannot alter policy allowlists or spending caps.
  - False positive mitigation: owner retains instant on-chain `unfreezeAgent()` veto authority.
