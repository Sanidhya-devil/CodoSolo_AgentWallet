# AgentVault — System Design Specification

**Phase 1 + Phase 2 — UX, States, Threats & Reason Codes**  
**Track:** W3-02 | **Team:** CodoSolo | **Author:** Sanidhya Gupta  

---

## 1. State Model

| State | Meaning | Agent Permitted? | Transition Trigger |
| :--- | :--- | :---: | :--- |
| `ACTIVE` | Normal operating status | Yes (within policy) | Owner provisions key or unfreezes account |
| `FROZEN` | Emergency containment | **No** | Anomaly detector trigger or manual owner freeze |
| `REVOKED` | Key permanently revoked | **No** | Owner revokes or guardian recovery completes |
| `EXPIRED` | Permission lifetime ended | **No** | Timestamp passes `agentExpiry` |
| `RECOVERY_PENDING` | Timelock delay in progress | **No** | 3-of-5 distinct guardian approvals collected |
| `RECOVERED` | Account ownership rotated | Old key: **No** | 48h delay passes without owner veto |

---

## 2. Standard Policy Reason Codes

| Reason Code | Meaning | Outcome |
| :--- | :--- | :--- |
| `TX_LIMIT_EXCEEDED` | Value exceeds per-transaction cap | Blocked at validation |
| `DAILY_LIMIT_EXCEEDED` | Cumulative spend exceeds daily window allowance | Blocked at validation |
| `RECIPIENT_NOT_ALLOWED` | Recipient address not present in allowlist | Blocked at validation |
| `TARGET_NOT_ALLOWED` | Target contract or function selector unapproved | Blocked at validation |
| `AGENT_EXPIRED` | Agent key permission timestamp has elapsed | Blocked at validation |
| `AGENT_FROZEN` | Agent key is suspended in containment | Blocked at validation |
| `AGENT_REVOKED` | Agent key was permanently revoked | Blocked at validation |
| `RECOVERY_DELAY_ACTIVE` | Execution attempted before 48h delay has passed | Reverted |
| `RECOVERY_VETOED` | Recovery was cancelled by the owner | Reverted |
| `SPONSOR_QUOTA_EXCEEDED` | Paymaster gas/operation quota exhausted | Paymaster rejected |

---

## 3. Visual & UX Direction
- **Verbs:** `DETECT` → `FREEZE` → `RECOVER`
- **Color Palette:** Navy/Dark base (`#0b132b`, `#1c2541`), Cyan/Blue for normal/active states, Purple for guardian recovery, Red/Amber for alerts and containment.
