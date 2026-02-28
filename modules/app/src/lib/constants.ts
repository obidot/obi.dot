// ── Contract Addresses (Paseo Testnet) ────────────────────────────────────

export const CONTRACTS = {
  VAULT: "0x37D7959f5f97D37799E0d04b7684c41CB2Ff878d",
  ORACLE_REGISTRY: "0x8b7C7345d6cF9de45f4aacC61F56F0241d47e88B",
  KEEPER_ORACLE: "0xf64d93DC125AC1B366532BBbA165615f6D566C7F",
  CROSS_CHAIN_ROUTER: "0xE65D7B65a1972A82bCF65f6711a43355Faa3f490",
  BIFROST_ADAPTER: "0x265Cb785De0fF2e5BcebDEb53095aDCAE9175527",
  TEST_DOT: "0x2402C804aD8a6217BF73D8483dA7564065c56083",
} as const;

export const CHAIN = {
  id: 420420417,
  name: "Polkadot Hub Testnet (Paseo)",
  rpcUrl: "https://services.polkadothub-rpc.com/testnet",
  blockExplorer: "https://blockscout-paseo.parity-chains.parity.io",
} as const;

/** API base URL — proxied via Next.js rewrites in dev */
export const API_BASE = "/api";

/** WebSocket URL for real-time events */
export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001/ws";
