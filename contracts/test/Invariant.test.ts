import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { AgentVault, MockEntryPoint } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("AgentVault - Fuzz & Invariant Verification Suite", function () {
  let owner: HardhatEthersSigner;
  let agent: HardhatEthersSigner;
  let detector: HardhatEthersSigner;
  let allowedRecipient: HardhatEthersSigner;
  let randomAccounts: HardhatEthersSigner[];
  let entryPoint: MockEntryPoint;
  let vault: AgentVault;

  const PER_TX_CAP = ethers.parseEther("0.1");
  const DAILY_CAP = ethers.parseEther("0.5");
  const ONE_DAY = 24 * 60 * 60;

  async function createSignedUserOp(
    signer: HardhatEthersSigner,
    vaultAddr: string,
    dest: string,
    val: bigint,
    innerFunc: string = "0x",
    nonce: bigint = 0n
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
      paymasterAndData: "0x",
      signature: "0x",
    };
    const opHash = await entryPoint.getUserOpHash(op);
    op.signature = await signer.signMessage(ethers.getBytes(opHash));
    return op;
  }

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    owner = signers[0];
    agent = signers[1];
    detector = signers[2];
    allowedRecipient = signers[3];
    randomAccounts = signers.slice(4, 15);

    const EntryPointFactory = await ethers.getContractFactory("MockEntryPoint");
    entryPoint = await EntryPointFactory.deploy();

    const guardianAddresses = [
      signers[15].address,
      signers[16].address,
      signers[17].address,
      signers[18].address,
      signers[19].address,
    ] as [string, string, string, string, string];

    const VaultFactory = await ethers.getContractFactory("AgentVault");
    vault = await VaultFactory.deploy(
      await entryPoint.getAddress(),
      owner.address,
      guardianAddresses,
      48 * 3600
    );

    const expiry = (await time.latest()) + 30 * ONE_DAY;
    await vault.setAgentKey(agent.address, expiry);
    await vault.setPolicy(PER_TX_CAP, DAILY_CAP, ONE_DAY, expiry);
    await vault.setAllowedRecipient(allowedRecipient.address, true);
    await vault.setAuthorizedDetector(detector.address);

    await owner.sendTransaction({
      to: await vault.getAddress(),
      value: ethers.parseEther("10.0"),
    });
  });

  it("Fuzz invariant: 100 randomized transaction sequences strictly preserve balance conservation and policy limits", async function () {
    const vaultAddr = await vault.getAddress();
    let expectedVaultBalance = await ethers.provider.getBalance(vaultAddr);
    let expectedRecipientBalance = await ethers.provider.getBalance(allowedRecipient.address);
    let cumulativeSpentToday = 0n;

    let opNonce = 0n;

    // Run 100 randomized actions
    for (let i = 0; i < 100; i++) {
      const isAgentSigner = Math.random() > 0.3; // 70% agent, 30% random attacker
      const signer = isAgentSigner ? agent : randomAccounts[Math.floor(Math.random() * randomAccounts.length)];
      
      const isAllowedRecipient = Math.random() > 0.4; // 60% allowed, 40% random recipient
      const recipient = isAllowedRecipient
        ? allowedRecipient.address
        : randomAccounts[Math.floor(Math.random() * randomAccounts.length)].address;

      // Random amount between 0.001 ETH and 0.25 ETH (sometimes above perTxCap 0.1)
      const randomEth = (Math.floor(Math.random() * 250) + 1) / 1000;
      const amount = ethers.parseEther(randomEth.toFixed(4));

      const isOverPerTxCap = amount > PER_TX_CAP;
      const isOverDailyCap = cumulativeSpentToday + amount > DAILY_CAP;
      const shouldSucceed = isAgentSigner && isAllowedRecipient && !isOverPerTxCap && !isOverDailyCap;

      const op = await createSignedUserOp(signer, vaultAddr, recipient, amount, "0x", opNonce);

      const balBefore = await ethers.provider.getBalance(vaultAddr);

      if (shouldSucceed) {
        await entryPoint.handleOps([op], ethers.ZeroAddress);
        expectedVaultBalance -= amount;
        expectedRecipientBalance += amount;
        cumulativeSpentToday += amount;
        opNonce++;
      } else {
        await expect(entryPoint.handleOps([op], ethers.ZeroAddress)).to.be.reverted;
      }

      // Assert invariant after EVERY randomized iteration
      const currentVaultBalance = await ethers.provider.getBalance(vaultAddr);
      expect(currentVaultBalance).to.equal(expectedVaultBalance);

      // Verify daily spend accounting matches state
      expect(await vault.getSpentToday()).to.equal(cumulativeSpentToday);
      expect(cumulativeSpentToday).to.be.lte(DAILY_CAP);
    }
  });
});
