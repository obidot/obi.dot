import { defineChain } from "viem";

/** Polkadot Hub TestNet chain definition for wagmi/viem */
export const polkadotHubTestnet = defineChain({
  id: 420420417,
  name: "Polkadot Hub TestNet",
  nativeCurrency: {
    name: "DOT",
    symbol: "DOT",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://eth-rpc-testnet.polkadot.io/"],
    },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://blockscout-testnet.polkadot.io",
    },
  },
  testnet: true,
});
