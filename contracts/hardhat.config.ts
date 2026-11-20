import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const accounts = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "shanghai",
    },
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    hardhat: {
      chainId: 31337,
      hardfork: "shanghai",
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    aevumTestnet: {
      url: "https://rpc-test.qday.info",
      chainId: 44005,
      accounts: accounts.length > 0 ? accounts : undefined,
    },
    aevumFork: {
      url: "http://127.0.0.1:8555",
      chainId: 440050,
      accounts: accounts.length > 0 ? accounts : undefined,
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
      chainId: 11155111,
      accounts: accounts.length > 0 ? accounts : undefined,
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      chainId: 84532,
      accounts: accounts.length > 0 ? accounts : undefined,
    },
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      baseSepolia: process.env.BASESCAN_API_KEY || "",
    },
  },
};

export default config;
