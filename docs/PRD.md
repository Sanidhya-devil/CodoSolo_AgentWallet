# AgentVault — Product Requirements Document (PRD)

**Phase 1 + Phase 2 — Safe AI-agent spending, containment, and recovery**  
**Track:** W3-02 | **Team:** CodoSolo | **Author:** Sanidhya Gupta  
**Status:** Implemented Specification & Verified Test Suite  

---

## 1. Executive Summary
AgentVault is an ERC-4337-compatible smart-account wallet that lets an AI agent transact strictly within owner-defined policy limits. 
- **Phase 1** enforces constrained spending authority (per-transaction caps, daily allowances, recipient allowlists, contract and selector allowlists, and time-based permission expiry).
- **Phase 2** assumes the agent key or environment may become compromised and introduces rule-based anomaly detection, bounded automated freeze/revocation, 3-of-5 guardian recovery with a 48-hour timelock and owner veto, gas-sponsorship quotas, and security-invariant testing.

---

## 2. Problem and Vision
AI agents increasingly manage real-world micro-transactions (purchasing API credits, compute, compute tickets, booking travel, or interacting with DeFi protocols). Granting an agent unrestricted wallet access is catastrophic if:
1. The agent's private key is leaked or stolen.
2. The agent is misled via prompt injection or rogue instructions.
3. An external integration or dependency behaves maliciously.

**Vision:** Give AI agents constrained, auditable transaction authority while guaranteeing that the human owner retains cryptographic control before, during, and after a compromise.

---

## 3. Scope & Requirements

### Phase 1: Safe Spending
- **FR-01 (Spending Caps):** Enforces per-transaction caps and cumulative daily spending caps in the smart account's authorization layer.
- **FR-02 (Recipient Allowlist):** Disallows transfers to any destination not present in the verified recipient allowlist (`RECIPIENT_NOT_ALLOWED`).
- **FR-03 (Contract / Selector Allowlist):** Restricts contract invocations to authorized contract addresses and specific 4-byte function selectors (`TARGET_NOT_ALLOWED`).
- **FR-04 (Permission Expiry):** Enforces automated time expiration on agent keys (`AGENT_EXPIRED`).
- **FR-05 (Context Validation):** Validates signatures, replay-protected nonces, chain ID, and EntryPoint address.

### Phase 2: Compromise Containment & Recovery
- **FR-06 (Freeze / Revoke):** Immediate containment state (`FROZEN`) and permanent key cancellation (`REVOKED`).
- **FR-07 (Automated Detection):** Rule-based anomaly detector monitoring burst rates and consecutive policy rejections to trigger automated containment.
- **FR-08 (3-of-5 Guardian Threshold):** Requires 3 distinct guardian approvals out of 5 configured guardians to initiate account recovery.
- **FR-09 (48-Hour Delay & Owner Veto):** Mandatory 48-hour timelock countdown before recovery execution, during which the owner can exercise an immediate veto.
- **FR-10 (Gas Quota / Paymaster):** Per-agent operation and gas quotas preventing spam draining.
- **FR-11 (Owner Dashboard):** Web dashboard displaying real-time policy state, spending progress, alert feeds, and recovery controls.
- **FR-12 (Security Invariant Fuzzing):** Rigorous verification that funds move exclusively via owner authorization, in-policy agent operations, or approved recovery.
