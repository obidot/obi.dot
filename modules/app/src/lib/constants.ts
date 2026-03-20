import type { LiquidityPairMeta } from "@/types";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

export const CONTRACTS = {
  // Phase 1 deployments
  ORACLE_REGISTRY: "0x8b7C7345d6cF9de45f4aacC61F56F0241d47e88B",
  KEEPER_ORACLE: "0xf64d93DC125AC1B366532BBbA165615f6D566C7F",
  BIFROST_ADAPTER: "0x265Cb785De0fF2e5BcebDEb53095aDCAE9175527",
  TEST_DOT: "0x2402C804aD8a6217BF73D8483dA7564065c56083",
  // Phase 2 deployments (Phase 9 XCMExecutor redeployment — skipWeightCheck + relayerFee fix)
  XCM_EXECUTOR: "0x011b6FAf32370dCF92a452374FfCfCdbfA20278c",
  NATIVE_DOT: "0xE72453bD8d5ECF56ccdDeF949C8AE0Cea5A41E7d",
  NATIVE_USDC: "0xAf233E9f2ED78022CAdEA58a84144ce6BcDFd63E",
  // Phase 3 deployments — DEX aggregator (2026-03-11)
  SWAP_QUOTER: "0x81d7aCFEF474DA6c76eC1b5A05a137cB9f3A5Db1",
  ASSET_HUB_ADAPTER: "0x67E0B572A7761C13D7C9A3f737C825A506a85CF4",
  BIFROST_DEX_ADAPTER: "0x386FC9514594c589ad7481AFC3eC36216DE91dC0",
  // Phase 17 SwapRouter — 9 adapter slots (HydrationOmnipool, AssetHubPair, BifrostDEX,
  // UniswapV2, Bridge, RelayTeleport, Karura, Moonbeam, Interlay)
  SWAP_ROUTER: "0x60a72d1e20c5dc40Bb5a24394f0583d863201A3c",
  HYDRATION_ADAPTER: "0xF0E1c10f97446C032A86C9643258Bb26d6129933",
  // Phase 7 redeployments (2026-03-12)
  CROSS_CHAIN_ROUTER: "0xE2fFfb3B5C72f99811bC20D857035611bFCe5b5d",
  HYPER_EXECUTOR: "0x62919Cb6416Cb919fC4A30c5707a7867Ca874ca6",
  // Phase 8 redeployment (2026-03-12)
  VAULT: "0x03473a95971Ba0496786a615e21b1e87bDFf0025",
  // Phase 18 test tokens (live in UV2 pair registry)
  TEST_USDC: "0x5298FDe9E288371ECA21db04Ac5Ddba00C1ea626",
  TEST_ETH: "0xd92a5325fB3A56f5012F1EBD1bd37573d981144e",
  // Phase 18 extra test tokens (TKA, TKB — live in UV2 pairs)
  TEST_TKA: "0xD8913B1a14Db9CD4B29C05c5E7E105cDA34ebF9f",
  TEST_TKB: "0x3E8D34E94e22BdBaa9aD6D575a239D722973D2Bc",
  LIQUIDITY_ROUTER: "0x0000000000000000000000000000000000000000", // TODO: fill after deploy
} as const;

export const CHAIN = {
  id: 420420417,
  name: "Polkadot Hub TestNet",
  rpcUrl: "https://eth-rpc-testnet.polkadot.io/",
  blockExplorer: "https://blockscout-testnet.polkadot.io",
} as const;

/** API base URL — proxied via Next.js rewrites in dev */
export const API_BASE = "/api";

/** WebSocket URL for real-time events (obidot agent API) */
export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001/ws";

/** GraphQL WebSocket URL for obi.index real-time subscriptions */
export const GRAPHQL_WS_URL =
  process.env.NEXT_PUBLIC_GRAPHQL_WS_URL ?? "ws://localhost:4350/graphql";

/** GraphQL HTTP URL for obi.index queries */
export const GRAPHQL_HTTP_URL =
  process.env.NEXT_PUBLIC_GRAPHQL_HTTP_URL ?? "http://localhost:4350/graphql";

/**
 * PolkaVM (pallet-revive) gas limits.
 * eth_estimateGas is unreliable on this chain — it returns ~7774 for a swap
 * that actually consumes ~49,000 gas. Oversized limits (≥ e18) get rejected
 * with "Invalid Transaction Contract C". Empirical safe values below.
 */
export const GAS_LIMITS = {
  APPROVE: BigInt(50_000),
  SWAP: BigInt(300_000),
  ADD_LIQUIDITY: BigInt(400_000),
  REMOVE_LIQUIDITY: BigInt(300_000),
  LP_APPROVE: BigInt(50_000),
} as const;

export const SLIPPAGE_OPTIONS = [
  { label: "0.5%", bps: 50 },
  { label: "1%", bps: 100 },
  { label: "2%", bps: 200 },
];

export const LP_PAIRS: LiquidityPairMeta[] = [
  {
    label: "tDOT/TKB",
    address: "0x0000000000000000000000000000000000000000",
    token0: CONTRACTS.TEST_DOT as `0x${string}`,
    token1: CONTRACTS.TEST_TKB as `0x${string}`,
    token0Symbol: "tDOT",
    token1Symbol: "TKB",
  },
  {
    label: "tDOT/tUSDC",
    address: "0x0000000000000000000000000000000000000000",
    token0: CONTRACTS.TEST_DOT as `0x${string}`,
    token1: CONTRACTS.TEST_USDC as `0x${string}`,
    token0Symbol: "tDOT",
    token1Symbol: "tUSDC",
  },
  {
    label: "tDOT/tETH",
    address: "0x0000000000000000000000000000000000000000",
    token0: CONTRACTS.TEST_DOT as `0x${string}`,
    token1: CONTRACTS.TEST_ETH as `0x${string}`,
    token0Symbol: "tDOT",
    token1Symbol: "tETH",
  },
  {
    label: "tUSDC/tETH",
    address: "0x0000000000000000000000000000000000000000",
    token0: CONTRACTS.TEST_USDC as `0x${string}`,
    token1: CONTRACTS.TEST_ETH as `0x${string}`,
    token0Symbol: "tUSDC",
    token1Symbol: "tETH",
  },
  {
    label: "TKB/TKA",
    address: "0x0000000000000000000000000000000000000000",
    token0: CONTRACTS.TEST_TKB as `0x${string}`,
    token1: CONTRACTS.TEST_TKA as `0x${string}`,
    token0Symbol: "TKB",
    token1Symbol: "TKA",
  },
];
