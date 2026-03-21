import type { Chain } from "@rainbow-me/rainbowkit";
import { defineChain } from "viem";

/** Polkadot Hub TestNet chain definition for wagmi/viem */
export const polkadotHubTestnet: Chain = defineChain({
  id: 420_420_417,
  name: "Polkadot Hub TestNet",
  iconUrl: "/images/polkadot.png",
  iconBackground: "transparent",
  nativeCurrency: {
    name: "PAS",
    symbol: "PAS",
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

export const polkadotHub: Chain = defineChain({
  id: 420_420_419,
  name: "Polkadot Hub",
  iconUrl: "/images/polkadot.png",
  iconBackground: "transparent",
  nativeCurrency: {
    name: "DOT",
    symbol: "DOT",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://eth-rpc.polkadot.io/"],
    },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://blockscout.polkadot.io/",
    },
  },
  testnet: true,
});

export const supportedChains: Chain[] = [polkadotHubTestnet, polkadotHub];
