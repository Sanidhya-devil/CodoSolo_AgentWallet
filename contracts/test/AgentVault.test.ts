import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { AgentVault, MockEntryPoint, AgentVaultPaymaster, MockUniswapRouter, MockERC20 } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("AgentVault - Comprehensive Security & Regression Test Suite", function () {
  let owner: HardhatEthersSigner;
  let agent: HardhatEthersSigner;
  let attacker: HardhatEthersSigner;
  let detector: HardhatEthersSigner;
  let allowedRecipient: HardhatEthersSigner;
  let unapprovedRecipient: HardhatEthersSigner;
  let guardians: HardhatEthersSigner[];

  let entryPoint: MockEntryPoint;
  let vault: AgentVault;
  let paymaster: AgentVaultPaymaster;
  let mockRouter: MockUniswapRouter;
  let mockToken: MockERC20;

  const PER_TX_CAP = ethers.parseEther("0.1");
  const DAILY_CAP = ethers.parseEther("0.3");
  const TOKEN_CAP = ethers.parseEther("100"); // 100 Tokens
  const ONE_DAY = 24 * 60 * 60;
  const RECOVERY_DELAY = 48 * 60 * 60;

  async function createSignedUserOp(
    signer: HardhatEthersSigner,
    vaultAddr: string,
    dest: string,
    val: bigint,
    innerFunc: string,
    nonce: bigint = 0n,
    paymasterData: string = "0x"
  ) {
    const executeData = vault.interface.encodeFunctionData("execute", [dest, val, innerFunc]);

    const op = {
      sender: vaultAddr,
      nonce: nonce,
      initCode: "0x",
      callData: executeData,
      callGasLimit: 200000n,
      verificationGasLimit: 150000n,
      preVerificationGas: 50000n,
      maxFeePerGas: ethers.parseUnits("1", "gwei"),
      maxPriorityFeePerGas: ethers.parseUnits("1", "gwei"),
      paymasterAndData: paymasterData,
      signature: "0x",
    };

    const opHash = await entryPoint.getUserOpHash(op);
    const signature = await signer.signMessage(ethers.getBytes(opHash));
    op.signature = signature;
    return op;
  }

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    owner = signers[0];
    agent = signers[1];
    attacker = signers[2];
    detector = signers[3];
    allowedRecipient = signers[4];
    unapprovedRecipient = signers[5];
    guardians = [signers[6], signers[7], signers[8], signers[9], signers[10]];

    // 1. Deploy Mock EntryPoint
    const EntryPointFactory = await ethers.getContractFactory("MockEntryPoint");
    entryPoint = await EntryPointFactory.deploy();

    // 2. Deploy AgentVault
    const guardianAddresses = guardians.map((g) => g.address) as [string, string, string, string, string];
    const VaultFactory = await ethers.getContractFactory("AgentVault");
    vault = await VaultFactory.deploy(await entryPoint.getAddress(), owner.address, guardianAddresses, RECOVERY_DELAY);

    // 3. Deploy Paymaster
    const PaymasterFactory = await ethers.getContractFactory("AgentVaultPaymaster");
    paymaster = await PaymasterFactory.deploy(await entryPoint.getAddress(), owner.address);

    // 4. Deploy Mock Router & ERC-20 Token
    const RouterFactory = await ethers.getContractFactory("MockUniswapRouter");
    mockRouter = await RouterFactory.deploy();

    const TokenFactory = await ethers.getContractFactory("MockERC20");
    mockToken = await TokenFactory.deploy("Mock Token", "MTK");

    // 5. Initial Configuration
    const expiry = (await time.latest()) + 7 * ONE_DAY;
    await vault.setAgentKey(agent.address, expiry);
    await vault.setPolicy(PER_TX_CAP, DAILY_CAP, ONE_DAY, expiry);
    await vault.setAllowedRecipient(allowedRecipient.address, true);
    await vault.setAllowedTarget(await mockRouter.getAddress(), true);
    await vault.setAllowedTarget(await mockToken.getAddress(), true);

    const swapSelector = mockRouter.interface.getFunction("swapExactTokensForTokens")!.selector;
    await vault.setAllowedSelector(await mockRouter.getAddress(), swapSelector, true);

    // Whitelist ERC-20 transfer selector for mockToken
    const transferSelector = "0xa9059cbb";
    await vault.setAllowedSelector(await mockToken.getAddress(), transferSelector, true);
    await vault.setTokenCap(await mockToken.getAddress(), TOKEN_CAP);

    await vault.setAuthorizedDetector(detector.address);

    // Fund the vault with 5 ETH and 1,000 MTK tokens
    await owner.sendTransaction({
      to: await vault.getAddress(),
      value: ethers.parseEther("5.0"),
    });

    await mockToken.mint(await vault.getAddress(), ethers.parseEther("1000"));
  });

  describe("1. Policy Engine & Spending Limits (FR-01, FR-02, FR-03)", function () {
    it("Allows agent transactions within perTxCap and dailyCap", async function () {
      const sendAmount = ethers.parseEther("0.05");
      const vaultAddr = await vault.getAddress();
      const op = await createSignedUserOp(agent, vaultAddr, allowedRecipient.address, sendAmount, "0x");

      const balanceBefore = await ethers.provider.getBalance(allowedRecipient.address);
      await entryPoint.handleOps([op], ethers.ZeroAddress);
      const balanceAfter = await ethers.provider.getBalance(allowedRecipient.address);

      expect(balanceAfter - balanceBefore).to.equal(sendAmount);
      expect(await vault.getSpentToday()).to.equal(sendAmount);
    });

    it("Rejects transaction exceeding per-transaction cap (TX_LIMIT_EXCEEDED)", async function () {
      const excessAmount = ethers.parseEther("0.15");
      const vaultAddr = await vault.getAddress();
      const op = await createSignedUserOp(agent, vaultAddr, allowedRecipient.address, excessAmount, "0x");

      await expect(entryPoint.handleOps([op], ethers.ZeroAddress)).to.be.revertedWith(
        "MockEntryPoint: account validation failed"
      );
    });

    it("Rejects cumulative spend exceeding daily cap (DAILY_LIMIT_EXCEEDED)", async function () {
      const vaultAddr = await vault.getAddress();

      const op1 = await createSignedUserOp(agent, vaultAddr, allowedRecipient.address, ethers.parseEther("0.1"), "0x", 0n);
      await entryPoint.handleOps([op1], ethers.ZeroAddress);

      const op2 = await createSignedUserOp(agent, vaultAddr, allowedRecipient.address, ethers.parseEther("0.1"), "0x", 1n);
      await entryPoint.handleOps([op2], ethers.ZeroAddress);

      const op3 = await createSignedUserOp(agent, vaultAddr, allowedRecipient.address, ethers.parseEther("0.1"), "0x", 2n);
      await entryPoint.handleOps([op3], ethers.ZeroAddress);

      const op4 = await createSignedUserOp(agent, vaultAddr, allowedRecipient.address, ethers.parseEther("0.05"), "0x", 3n);
      await expect(entryPoint.handleOps([op4], ethers.ZeroAddress)).to.be.revertedWith(
        "MockEntryPoint: account validation failed"
      );
    });

    it("Resets daily spending allowance after window duration (24h)", async function () {
      const vaultAddr = await vault.getAddress();

      const op1 = await createSignedUserOp(agent, vaultAddr, allowedRecipient.address, ethers.parseEther("0.1"), "0x", 0n);
      await entryPoint.handleOps([op1], ethers.ZeroAddress);
      const op2 = await createSignedUserOp(agent, vaultAddr, allowedRecipient.address, ethers.parseEther("0.1"), "0x", 1n);
      await entryPoint.handleOps([op2], ethers.ZeroAddress);
      const op3 = await createSignedUserOp(agent, vaultAddr, allowedRecipient.address, ethers.parseEther("0.1"), "0x", 2n);
      await entryPoint.handleOps([op3], ethers.ZeroAddress);

      await time.increase(ONE_DAY + 1);

      const op4 = await createSignedUserOp(agent, vaultAddr, allowedRecipient.address, ethers.parseEther("0.08"), "0x", 3n);
      await expect(entryPoint.handleOps([op4], ethers.ZeroAddress)).to.not.be.reverted;
      expect(await vault.getSpentToday()).to.equal(ethers.parseEther("0.08"));
    });

    it("Rejects unapproved recipients for ETH transfers (RECIPIENT_NOT_ALLOWED)", async function () {
      const vaultAddr = await vault.getAddress();
      const op = await createSignedUserOp(agent, vaultAddr, unapprovedRecipient.address, ethers.parseEther("0.05"), "0x");

      await expect(entryPoint.handleOps([op], ethers.ZeroAddress)).to.be.revertedWith(
        "MockEntryPoint: account validation failed"
      );
    });

    it("Allows approved contract target and approved function selector", async function () {
      const routerAddr = await mockRouter.getAddress();
      const swapData = mockRouter.interface.encodeFunctionData("swapExactTokensForTokens", [
        1000n,
        950n,
        [ethers.ZeroAddress, allowedRecipient.address],
        allowedRecipient.address,
        0n,
      ]);

      const vaultAddr = await vault.getAddress();
      const op = await createSignedUserOp(agent, vaultAddr, routerAddr, 0n, swapData);

      await expect(entryPoint.handleOps([op], ethers.ZeroAddress)).to.not.be.reverted;
    });

    it("Rejects unapproved function selector on approved contract (TARGET_NOT_ALLOWED)", async function () {
      const routerAddr = await mockRouter.getAddress();
      const dangerousData = mockRouter.interface.encodeFunctionData("unapprovedDangerousFunction", [
        attacker.address,
        1000n,
      ]);

      const vaultAddr = await vault.getAddress();
      const op = await createSignedUserOp(agent, vaultAddr, routerAddr, 0n, dangerousData);

      await expect(entryPoint.handleOps([op], ethers.ZeroAddress)).to.be.revertedWith(
        "MockEntryPoint: account validation failed"
      );
    });
  });

  describe("2. Token-Aware Security (P0 Issue 2 Regression Tests)", function () {
    it("Allows ERC-20 token transfer to approved recipient within tokenPerTxCap", async function () {
      const tokenAddr = await mockToken.getAddress();
      const transferData = mockToken.interface.encodeFunctionData("transfer", [
        allowedRecipient.address,
        ethers.parseEther("50"), // under 100 MTK cap
      ]);

      const vaultAddr = await vault.getAddress();
      const op = await createSignedUserOp(agent, vaultAddr, tokenAddr, 0n, transferData);

      const balBefore = await mockToken.balanceOf(allowedRecipient.address);
      await entryPoint.handleOps([op], ethers.ZeroAddress);
      const balAfter = await mockToken.balanceOf(allowedRecipient.address);

      expect(balAfter - balBefore).to.equal(ethers.parseEther("50"));
    });

    it("Rejects ERC-20 transfer to unapproved recipient (RECIPIENT_NOT_ALLOWED)", async function () {
      const tokenAddr = await mockToken.getAddress();
      const transferData = mockToken.interface.encodeFunctionData("transfer", [
        unapprovedRecipient.address,
        ethers.parseEther("20"),
      ]);

      const vaultAddr = await vault.getAddress();
      const op = await createSignedUserOp(agent, vaultAddr, tokenAddr, 0n, transferData);

      await expect(entryPoint.handleOps([op], ethers.ZeroAddress)).to.be.revertedWith(
        "MockEntryPoint: account validation failed"
      );
    });

    it("Rejects ERC-20 transfer exceeding tokenPerTxCap (TX_LIMIT_EXCEEDED)", async function () {
      const tokenAddr = await mockToken.getAddress();
      const transferData = mockToken.interface.encodeFunctionData("transfer", [
        allowedRecipient.address,
        ethers.parseEther("150"), // Cap is 100 MTK
      ]);

      const vaultAddr = await vault.getAddress();
      const op = await createSignedUserOp(agent, vaultAddr, tokenAddr, 0n, transferData);

      await expect(entryPoint.handleOps([op], ethers.ZeroAddress)).to.be.revertedWith(
        "MockEntryPoint: account validation failed"
      );
    });

    it("Rejects arbitrary unapproved ERC-20 approve calls (TARGET_NOT_ALLOWED)", async function () {
      const tokenAddr = await mockToken.getAddress();
      const approveData = mockToken.interface.encodeFunctionData("approve", [
        attacker.address,
        ethers.parseEther("1000"),
      ]);

      const vaultAddr = await vault.getAddress();
      const op = await createSignedUserOp(agent, vaultAddr, tokenAddr, 0n, approveData);

      await expect(entryPoint.handleOps([op], ethers.ZeroAddress)).to.be.revertedWith(
        "MockEntryPoint: account validation failed"
      );
    });
  });

  describe("3. Lifecycle, Containment & Recovery Pending (P0 Issue 1)", function () {
    it("P0 FIX: Rejects agent transactions when RECOVERY_PENDING", async function () {
      // 3-of-5 guardians initiate recovery
      await vault.connect(guardians[0]).requestRecovery(owner.address, agent.address);
      await vault.connect(guardians[1]).approveRecovery(1);
      await vault.connect(guardians[2]).approveRecovery(1); // 3rd vote triggers RECOVERY_PENDING

      expect(await vault.getStatus()).to.equal(4); // AgentStatus.RECOVERY_PENDING

      // Agent transaction MUST be blocked during recovery pending
      const vaultAddr = await vault.getAddress();
      const op = await createSignedUserOp(agent, vaultAddr, allowedRecipient.address, ethers.parseEther("0.05"), "0x");

      await expect(entryPoint.handleOps([op], ethers.ZeroAddress)).to.be.revertedWith(
        "MockEntryPoint: account validation failed"
      );
    });

    it("Allows authorized detector to freeze compromised agent (AGENT_FROZEN)", async function () {
      await vault.connect(detector).freezeAgent("Suspicious burst traffic detected");
      expect(await vault.getStatus()).to.equal(1); // AgentStatus.FROZEN

      const vaultAddr = await vault.getAddress();
      const op = await createSignedUserOp(agent, vaultAddr, allowedRecipient.address, ethers.parseEther("0.05"), "0x");

      await expect(entryPoint.handleOps([op], ethers.ZeroAddress)).to.be.revertedWith(
        "MockEntryPoint: account validation failed"
      );
    });

    it("Allows owner to unfreeze and restore agent operations", async function () {
      await vault.connect(detector).freezeAgent("False alarm inspection");
      expect(await vault.getStatus()).to.equal(1);

      await vault.connect(owner).unfreezeAgent();
      expect(await vault.getStatus()).to.equal(0); // AgentStatus.ACTIVE

      const vaultAddr = await vault.getAddress();
      const op = await createSignedUserOp(agent, vaultAddr, allowedRecipient.address, ethers.parseEther("0.05"), "0x");
      await expect(entryPoint.handleOps([op], ethers.ZeroAddress)).to.not.be.reverted;
    });

    it("Permanently revokes agent authority on revokeAgent (AGENT_REVOKED)", async function () {
      await vault.connect(owner).revokeAgent();
      expect(await vault.getStatus()).to.equal(2); // AgentStatus.REVOKED
      expect(await vault.agentKey()).to.equal(ethers.ZeroAddress);

      const vaultAddr = await vault.getAddress();
      const op = await createSignedUserOp(agent, vaultAddr, allowedRecipient.address, ethers.parseEther("0.05"), "0x");

      await expect(entryPoint.handleOps([op], ethers.ZeroAddress)).to.be.revertedWith(
        "MockEntryPoint: account validation failed"
      );
    });
  });

  describe("4. 3-of-5 Guardian Recovery, 48h Delay & Owner Veto", function () {
    let newOwner: HardhatEthersSigner;
    let newAgent: HardhatEthersSigner;

    beforeEach(async function () {
      const signers = await ethers.getSigners();
      newOwner = signers[11];
      newAgent = signers[12];
    });

    it("Fails recovery execution with only 2 approvals", async function () {
      await vault.connect(guardians[0]).requestRecovery(newOwner.address, newAgent.address);
      await vault.connect(guardians[1]).approveRecovery(1);

      await time.increase(RECOVERY_DELAY + 10);
      await expect(vault.executeRecovery(1)).to.be.revertedWith("AgentVault: guardian threshold not met");
    });

    it("Rejects duplicate approvals from the same guardian", async function () {
      await vault.connect(guardians[0]).requestRecovery(newOwner.address, newAgent.address);
      await expect(vault.connect(guardians[0]).approveRecovery(1)).to.be.revertedWith(
        "AgentVault: guardian already approved"
      );
    });

    it("Prevents premature execution before 48-hour delay elapses (RECOVERY_DELAY_ACTIVE)", async function () {
      await vault.connect(guardians[0]).requestRecovery(newOwner.address, newAgent.address);
      await vault.connect(guardians[1]).approveRecovery(1);
      await vault.connect(guardians[2]).approveRecovery(1);

      await time.increase(24 * 60 * 60);
      await expect(vault.executeRecovery(1)).to.be.revertedWith("RECOVERY_DELAY_ACTIVE");
    });

    it("Allows owner to veto recovery within 48h window (RECOVERY_VETOED)", async function () {
      await vault.connect(guardians[0]).requestRecovery(newOwner.address, newAgent.address);
      await vault.connect(guardians[1]).approveRecovery(1);
      await vault.connect(guardians[2]).approveRecovery(1);

      await vault.connect(owner).vetoRecovery(1);
      await time.increase(RECOVERY_DELAY + 10);

      await expect(vault.executeRecovery(1)).to.be.revertedWith("RECOVERY_VETOED");
    });

    it("Executes recovery successfully after 3 approvals and 48h delay", async function () {
      await vault.connect(guardians[0]).requestRecovery(newOwner.address, newAgent.address);
      await vault.connect(guardians[1]).approveRecovery(1);
      await vault.connect(guardians[2]).approveRecovery(1);

      await time.increase(RECOVERY_DELAY + 1);
      await vault.executeRecovery(1);

      expect(await vault.owner()).to.equal(newOwner.address);
      expect(await vault.agentKey()).to.equal(newAgent.address);
      expect(await vault.getStatus()).to.equal(0);
    });
  });

  describe("5. Cryptographic Single-Use Owner Exception Approval (P0 Issue 4)", function () {
    it("Authorizes an out-of-policy exception via single-use owner signature", async function () {
      const vaultAddr = await vault.getAddress();
      const largeAmount = ethers.parseEther("0.5"); // Exceeds perTxCap (0.1)
      const nonce = 9999n;
      const expiry = (await time.latest()) + 3600; // 1 hour

      // Compute approval hash matching abi.encode in contract
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const approvalHash = ethers.keccak256(
        abiCoder.encode(
          ["address", "address", "uint256", "bytes32", "uint256", "uint256", "uint256"],
          [vaultAddr, allowedRecipient.address, largeAmount, ethers.keccak256("0x"), nonce, expiry, 31337n]
        )
      );

      const ownerSignature = await owner.signMessage(ethers.getBytes(approvalHash));

      const balBefore = await ethers.provider.getBalance(allowedRecipient.address);

      await vault.executeWithApproval(
        allowedRecipient.address,
        largeAmount,
        "0x",
        nonce,
        expiry,
        ownerSignature
      );

      const balAfter = await ethers.provider.getBalance(allowedRecipient.address);
      expect(balAfter - balBefore).to.equal(largeAmount);
      expect(await vault.usedOwnerApprovals(approvalHash)).to.be.true;
    });

    it("Rejects replay of an already-used owner approval (APPROVAL_ALREADY_USED)", async function () {
      const vaultAddr = await vault.getAddress();
      const amount = ethers.parseEther("0.2");
      const nonce = 8888n;
      const expiry = (await time.latest()) + 3600;

      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const approvalHash = ethers.keccak256(
        abiCoder.encode(
          ["address", "address", "uint256", "bytes32", "uint256", "uint256", "uint256"],
          [vaultAddr, allowedRecipient.address, amount, ethers.keccak256("0x"), nonce, expiry, 31337n]
        )
      );
      const ownerSignature = await owner.signMessage(ethers.getBytes(approvalHash));

      await vault.executeWithApproval(allowedRecipient.address, amount, "0x", nonce, expiry, ownerSignature);

      // Replay must revert
      await expect(
        vault.executeWithApproval(allowedRecipient.address, amount, "0x", nonce, expiry, ownerSignature)
      ).to.be.revertedWith("APPROVAL_ALREADY_USED");
    });
  });

  describe("6. Paymaster Atomic Batch Reservation (P1 Issue 5)", function () {
    const MAX_OPS = 2n;
    const MAX_GAS_VALUE = 200000n;

    beforeEach(async function () {
      const vaultAddr = await vault.getAddress();
      await paymaster.setQuota(vaultAddr, MAX_OPS, MAX_GAS_VALUE, true);
    });

    it("Atomically reserves quota in validation and reconciles in postOp", async function () {
      const vaultAddr = await vault.getAddress();
      const paymasterAddr = await paymaster.getAddress();
      const pmData = ethers.concat([paymasterAddr, "0x"]);

      const op1 = await createSignedUserOp(
        agent,
        vaultAddr,
        allowedRecipient.address,
        ethers.parseEther("0.01"),
        "0x",
        0n,
        pmData
      );

      await expect(entryPoint.handleOps([op1], ethers.ZeroAddress)).to.not.be.reverted;

      const quota = await paymaster.getQuota(vaultAddr);
      expect(quota.opsUsed).to.equal(1n);
      expect(quota.reservedOps).to.equal(0n); // Reservation released in postOp
    });

    it("Rejects batch when cumulative operations exceed maxOps during validation", async function () {
      const vaultAddr = await vault.getAddress();
      const paymasterAddr = await paymaster.getAddress();
      const pmData = ethers.concat([paymasterAddr, "0x"]);

      const op1 = await createSignedUserOp(agent, vaultAddr, allowedRecipient.address, ethers.parseEther("0.01"), "0x", 0n, pmData);
      const op2 = await createSignedUserOp(agent, vaultAddr, allowedRecipient.address, ethers.parseEther("0.01"), "0x", 1n, pmData);
      const op3 = await createSignedUserOp(agent, vaultAddr, allowedRecipient.address, ethers.parseEther("0.01"), "0x", 2n, pmData);

      // Batch of 3 operations when maxOps is 2
      await expect(entryPoint.handleOps([op1, op2, op3], ethers.ZeroAddress)).to.be.revertedWith(
        "MockEntryPoint: paymaster validation failed"
      );
    });
  });
});
