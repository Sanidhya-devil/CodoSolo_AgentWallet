# AgentVault: 3–5 Minute Video Pitch & Live Demo Script

> **Event:** DoraHacks QDay Aevum Builder Challenge #1  
> **Target Duration:** 3 minutes 45 seconds (Buffer: < 5 minutes)  
> **Speaker:** Sanidhya Gupta (Team CodoSolo)  
> **Format:** Split screen / Picture-in-Picture (Presenter + Live Web Browser / Terminal)

---

## ⏱️ Video Timeline Overview

| Section | Timestamp | Focus Area | On-Screen Visual |
| :--- | :--- | :--- | :--- |
| **1. Hook & Problem Statement** | 0:00 – 0:45 | The AI Agent Financial Dilemma | Slide / Architecture Diagram showing prompt injection draining treasury |
| **2. Solution: AgentVault on Aevum** | 0:45 – 1:30 | QDay Aevum, tUSD8 & Shanghai EVM | Dashboard Cockpit on Aevum Testnet (#44005) with tUSD8 metrics |
| **3. Live Demo: ERC-8004 Agent Discovery** | 1:30 – 2:15 | On-chain Agent Cards & Reputation | ERC-8004 Registry Tab, Paying $1.50 tUSD8 for Inference |
| **4. Live Demo: Threat Containment** | 2:15 – 3:00 | Overspend & Burst Auto-Freeze | Attack Simulator executing overspend & burst hijack; instant freeze |
| **5. Social Recovery & Architecture** | 3:00 – 3:30 | 3-of-5 Guardian Recovery + Owner Veto | Guardian Recovery Tab with 48h timelock simulation |
| **6. Closing & Vision** | 3:30 – 3:45 | QDay Mainnet Roadmap & Ecosystem Value | Final slide with GitHub repository & QDay Explorer links |

---

## 🎙️ Word-for-Word Narration & Action Script

### 1. Hook & Problem Statement (0:00 – 0:45)
**[Visual: Presenter on camera or title slide with AgentVault branding]**

> "Hi everyone, I’m Sanidhya from Team CodoSolo, and today I’m thrilled to present **AgentVault: Autonomous AI Agent Spending, Invariant Defense, and Stablecoin Settlement on the QDay Aevum Testnet**."

**[Visual: Cut to diagram of an autonomous agent talking to external APIs and smart contracts]**

> "Autonomous AI agents and Model Context Protocol servers are ushering in the next era of machine-to-machine commerce. But they present a massive financial security challenge: **How do you give an autonomous agent a wallet without risking your entire treasury?**
>
> If an LLM hallucinates, gets hit with an indirect prompt injection, or leaks its session key, an attacker can siphon all your funds in seconds. Relying on off-chain prompt filters is simply not enough. Financial safety must be an **immutable, on-chain invariant**."

---

### 2. The Solution: AgentVault on QDay Aevum (0:45 – 1:30)
**[Visual: Screen share opens http://localhost:5173 — the AgentVault Dashboard]**

> "Enter **AgentVault**. We built AgentVault specifically for the **QDay Aevum Testnet**. QDay provides the high-throughput, sub-second settlement that high-frequency agentic payments require. 
> 
> Because Aevum is strictly Shanghai EVM-compatible, we specifically compiled and verified our smart contracts with **zero Cancun opcodes**—validated directly against the official Aevum starter-kit checker."

**[Visual: Hover over Top Banner showing 'QDay Aevum Testnet (44005)' and KPI cards showing $1,000.00 tUSD8 Reserve]**

> "Here in our Telemetry Cockpit, you can see our vault is funded with **tUSD8**—the official stablecoin of Aevum. Rather than treating stablecoins as an afterthought, AgentVault implements **native token velocity policies**:
> - We set an atomic per-transaction cap of **$5.00 tUSD8**.
> - A rolling 24-hour daily cap of **$10.00 tUSD8**.
> - And strict recipient allowlists. 
> 
> All enforced directly inside `AgentVault.sol`."

---

### 3. Live Demo: ERC-8004 Trustless Agents Discovery (1:30 – 2:15)
**[Visual: Click on the 'ERC-8004 AGENTS' tab in the sidebar]**

> "To make machine-to-machine commerce truly autonomous, AgentVault adopts the new **ERC-8004 Trustless Agents standard**.
>
> Here in the registry, every agent has an on-chain **ERC-721 AgentCard** linked to IPFS metadata detailing its declared MCP tools, endpoint, and verifiable trust score.
> 
> Let's perform a live payment. Agent #1, the **InferenceOracle Agent**, charges **$1.50 tUSD8** per call. Its trust score is 98/100."

**[Visual: Click 'Pay $1.50 tUSD8'. Watch the success notification pop up and the Daily Spend increase to $3.00 / $10.00 tUSD8]**

> "When we click pay, the vault verifies the recipient is verified, executes the transfer in `tUSD8`, logs the feedback on-chain, and updates our daily spend. Everything settles cleanly within our pre-configured policy."

---

### 4. Live Demo: Attack Containment in Action (2:15 – 3:00)
**[Visual: Click on 'Attack Simulator' tab]**

> "Now, let’s see what happens when things go wrong. Suppose our agent suffers a prompt injection that instructs it to execute an unauthorized **$50.00 tUSD8** transfer to an attacker."

**[Visual: Click 'Execute' on Scenario 1: Overspend Attempt]**

> "Instantly, `AgentVault.sol` reverts the transaction on-chain with reason code `TX_LIMIT_EXCEEDED`. Not a single cent of `tUSD8` leaves the vault."

**[Visual: Click 'Execute' on Scenario 5: High-Frequency Burst Probing]**

> "Next, let's test a coordinated probing attack: an attacker attempting rapid micro-drains. 
> 
> As soon as the burst rate exceeds 3 violations within 5 seconds, our off-chain **Anomaly Detection Service** detects the pattern and immediately invokes `freezeAgent` using its scoped permission."

**[Visual: Watch status change to flashing red 'FROZEN'. The containment banner appears: 'Agent is FROZEN. All user operations rejected.']**

> "Notice the status instantly shifted to **FROZEN**. The agent key is now dead in its tracks. Any subsequent call reverts with `AGENT_FROZEN`. The treasury is 100% protected."

---

### 5. Social Recovery & Resilience (3:00 – 3:30)
**[Visual: Click on 'Guardian Recovery' tab]**

> "What if the agent's private key was permanently compromised? 
> 
> AgentVault incorporates a decentralized **3-of-5 Guardian Social Recovery mechanism**. Three verified guardians can sign off to revoke the compromised key and assign a new agent authority."

**[Visual: Click Guardian 1, 2, and 3 checkboxes. The status updates to 'RECOVERY_PENDING' and 48-hour timelock countdown appears]**

> "Once the 3-of-5 threshold is reached, a **48-hour timelock delay** begins. This guarantees that if a malicious recovery is attempted, the vault owner has a full 48 hours to exercise a single-use **Owner Veto** with one click. Recovery executes only if no veto is cast."

---

### 6. Closing & Vision (3:30 – 3:45)
**[Visual: Switch to Terminal / Slide showing GitHub repository, verified test suite, and QDay Explorer links]**

> "In our benchmark suite, AgentVault achieved a **100% containment rate across all 6 attack scenarios** with **0% false freezes** on benign operations.
> 
> With full Shanghai EVM compliance, native tUSD8 settlement, and ERC-8004 agent registries, AgentVault provides the turnkey foundation for safe, post-quantum autonomous commerce on QDay.
> 
> Thank you, and we look forward to the QDay mainnet launch in February!"

---

## 🎬 Production & Recording Checklist

- [ ] **Resolution:** 1920x1080 (1080p, 60fps).
- [ ] **Browser Zoom:** 100% or 110% for crisp readability of metrics and transaction hashes.
- [ ] **MetaMask:** Connected to `QDay Aevum Testnet` (Chain ID `44005`).
- [ ] **Terminal Window:** Open with Foundry test suite (`forge test`) or scenario benchmark (`python -m agent.run_scenarios`) ready to show verified output.
- [ ] **Audio:** Clear microphone with zero background noise.
