import { defineChain } from "viem";

/** Polkadot Hub Testnet (Paseo) chain definition for wagmi/viem */
export const polkadotHubTestnet = defineChain({
  id: 420420417,
  name: "Polkadot Hub Testnet",
  nativeCurrency: {
    name: "Paseo DOT",
    symbol: "PAS",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://services.polkadothub-rpc.com/testnet"],
    },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://blockscout-paseo.parity-chains.parity.io",
    },
  },
  testnet: true,
});
