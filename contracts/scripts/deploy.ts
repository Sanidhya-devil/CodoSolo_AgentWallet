import { ethers, network } from "hardhat";

async function main() {
  console.log("==================================================");
  console.log(`Deploying AgentVault to Network: ${network.name} (Chain ID: ${network.config.chainId})`);
  console.log("==================================================");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer Address (Owner):", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer Balance:", ethers.formatEther(balance), "ETH");

  let entryPointAddress = process.env.ENTRYPOINT_ADDRESS;

  // If local network and no entrypoint specified, deploy MockEntryPoint
  if (network.name === "hardhat" || network.name === "localhost") {
    console.log("\n[1/4] Deploying Mock EntryPoint for local testing...");
    const EntryPoint = await ethers.getContractFactory("MockEntryPoint");
    const entryPoint = await EntryPoint.deploy();
    await entryPoint.waitForDeployment();
    entryPointAddress = await entryPoint.getAddress();
    console.log("MockEntryPoint deployed at:", entryPointAddress);
  } else {
    // Canonical ERC-4337 EntryPoint v0.7
    if (!entryPointAddress) {
      entryPointAddress = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
    }
    console.log(`\n[1/4] Using canonical ERC-4337 EntryPoint at: ${entryPointAddress}`);
  }

  // 2. Prepare 5 Guardians (For testnet, configure distinct addresses or derive them)
  const signers = await ethers.getSigners();
  let guardians: [string, string, string, string, string];

  if (signers.length >= 6) {
    guardians = [
      signers[1].address,
      signers[2].address,
      signers[3].address,
      signers[4].address,
      signers[5].address,
    ];
  } else {
    // Deterministic fallback test addresses for testnet deployment
    guardians = [
      "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955",
      "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
      "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720",
      "0xBcd4042DE499D14e55001CcbB24a551F3b954096",
      "0x71bE63f3384f5fb98995898A86B02Fb2426c5788",
    ];
  }

  const RECOVERY_DELAY = 48 * 3600; // 48 hours

  // 3. Deploy AgentVault
  console.log("\n[2/4] Deploying AgentVault Smart Account...");
  const AgentVaultFactory = await ethers.getContractFactory("AgentVault");
  const vault = await AgentVaultFactory.deploy(
    entryPointAddress,
    deployer.address,
    guardians,
    RECOVERY_DELAY
  );
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("AgentVault deployed at:", vaultAddress);

  // 4. Deploy Paymaster
  console.log("\n[3/4] Deploying AgentVaultPaymaster...");
  const PaymasterFactory = await ethers.getContractFactory("AgentVaultPaymaster");
  const paymaster = await PaymasterFactory.deploy(entryPointAddress, deployer.address);
  await paymaster.waitForDeployment();
  const paymasterAddress = await paymaster.getAddress();
  console.log("AgentVaultPaymaster deployed at:", paymasterAddress);

  // 5. Initial Configuration
  console.log("\n[4/4] Configuring initial policy parameters...");
  const latestBlock = await ethers.provider.getBlock("latest");
  const now = latestBlock ? latestBlock.timestamp : Math.floor(Date.now() / 1000);
  const expiry = now + 14 * 86400; // 14 days

  const agentAddress = signers.length > 1 ? signers[1].address : "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  await vault.setAgentKey(agentAddress, expiry);
  await vault.setPolicy(
    ethers.parseEther("0.1"), // 0.1 ETH perTxCap
    ethers.parseEther("0.3"), // 0.3 ETH dailyCap
    86400,                   // 24h window
    expiry
  );

  // Configure Paymaster Quota
  await paymaster.setQuota(vaultAddress, 100, 2000000, true);

  console.log("\n==================================================");
  console.log("DEPLOYMENT COMPLETED SUCCESSFULLY");
  console.log("==================================================");
  console.log("AgentVault:", vaultAddress);
  console.log("Paymaster :", paymasterAddress);
  console.log("EntryPoint:", entryPointAddress);
  console.log("Owner     :", deployer.address);
  console.log("Agent Key :", agentAddress);
  console.log("Guardians :");
  guardians.forEach((g, i) => console.log(`  [${i + 1}] ${g}`));
  console.log("==================================================");

  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("\nVerify with Etherscan:");
    console.log(`npx hardhat verify --network ${network.name} ${vaultAddress} "${entryPointAddress}" "${deployer.address}" '["${guardians.join('","')}"]' ${RECOVERY_DELAY}`);
    console.log(`npx hardhat verify --network ${network.name} ${paymasterAddress} "${entryPointAddress}" "${deployer.address}"`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
