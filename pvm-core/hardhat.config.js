require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-foundry");
require("@nomicfoundation/hardhat-ignition");
require("@parity/hardhat-polkadot");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.28",

  // PolkaVM resolc compiler configuration
  resolc: {
    compilerSource: "npm",
    settings: {
      optimizer: {
        enabled: true,
        parameters: "z",
        fallbackOz: true,
        runs: 200,
      },
      standardJson: true,
    },
  },

  networks: {
    // Local PolkaVM node (default for `hardhat test` / `hardhat node`)
    hardhat: {
      polkadot: true,
      nodeConfig: {
        useAnviL: true,
        nodeBinaryPath: "./bin/anvil-polkadot",
      },
    },

    local: {
      polkadot: true,
      url: "http://localhost:8545",
    },

    forking: {
      url: "wss://testnet-passet-hub.polkadot.io",
    },

    // Polkadot Hub TestNet (Asset Hub Testnet)
    polkadotHubTestnet: {
      polkavm: true,
      url: "https://services.polkadothub-rpc.com/testnet",
      accounts: PRIVATE_KEY
        ? [PRIVATE_KEY]
        : ["271ad9a5e1e0178acebdb572f8755aac3463d863ddfc70e32e7d5eb0b334e687"],
      chainId: 420420422,
    },

    // Westend Asset Hub (public testnet)
    westendHub: {
      polkadot: true,
      url: "https://westend-asset-hub-eth-rpc.polkadot.io",
      accounts: PRIVATE_KEY
        ? [PRIVATE_KEY]
        : ["271ad9a5e1e0178acebdb572f8755aac3463d863ddfc70e32e7d5eb0b334e687"],
      chainId: 420420421,
    },

    // Kusama Asset Hub
    kusamaHub: {
      polkadot: true,
      url: "https://kusama-asset-hub-eth-rpc.polkadot.io",
      polkadotUrl: "wss://kusama-asset-hub-rpc.polkadot.io",
      accounts: PRIVATE_KEY
        ? [PRIVATE_KEY]
        : ["271ad9a5e1e0178acebdb572f8755aac3463d863ddfc70e32e7d5eb0b334e687"],
      chainId: 420420418,
    },
  },
};
