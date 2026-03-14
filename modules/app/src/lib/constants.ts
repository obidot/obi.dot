// ── Contract Addresses (Polkadot Hub TestNet) ─────────────────────────────

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
  // Phase 6 redeployments — PolkaVM bytes32 fix (2026-03-12)
  // Phase 12 SwapRouter v3 + Phase 15 HydrationOmnipoolAdapter v2 (PALLET_OMNIPOOL=59 fix)
  SWAP_ROUTER: "0x0A85A1B0bb893cab3b5fad7312ac241e92C8Badf",
  HYDRATION_ADAPTER: "0xF0E1c10f97446C032A86C9643258Bb26d6129933",
  // Phase 7 redeployments (2026-03-12)
  CROSS_CHAIN_ROUTER: "0xE2fFfb3B5C72f99811bC20D857035611bFCe5b5d",
  HYPER_EXECUTOR: "0x62919Cb6416Cb919fC4A30c5707a7867Ca874ca6",
  // Phase 8 redeployment (2026-03-12)
  VAULT: "0x03473a95971Ba0496786a615e21b1e87bDFf0025",
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

// ── Minimal ABIs (only functions needed by frontend) ──────────────────────

export const SWAP_ROUTER_ABI = [
  {
    type: "function",
    name: "swap",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          {
            name: "route",
            type: "tuple",
            components: [
              { name: "poolType", type: "uint8" },
              { name: "pool", type: "address" },
              { name: "tokenIn", type: "address" },
              { name: "tokenOut", type: "address" },
              { name: "feeBps", type: "uint256" },
              { name: "data", type: "bytes32" },
            ],
          },
          { name: "amountIn", type: "uint256" },
          { name: "minAmountOut", type: "uint256" },
          { name: "to", type: "address" },
          { name: "deadline", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "swapFlat",
    inputs: [
      { name: "poolType", type: "uint8" },
      { name: "pool", type: "address" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "feeBps", type: "uint256" },
      { name: "data", type: "bytes32" },
      { name: "amountIn", type: "uint256" },
      { name: "minAmountOut", type: "uint256" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "paused",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
] as const;

export const SWAP_QUOTER_ABI = [
  {
    type: "function",
    name: "getBestQuote",
    inputs: [
      { name: "pool", type: "address" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "source", type: "uint8" },
          { name: "pool", type: "address" },
          { name: "feeBps", type: "uint16" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOut", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAllQuotes",
    inputs: [
      { name: "pool", type: "address" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "source", type: "uint8" },
          { name: "pool", type: "address" },
          { name: "feeBps", type: "uint16" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOut", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
] as const;

export const POOL_ADAPTER_ABI = [
  {
    type: "function",
    name: "supportsPair",
    inputs: [
      { name: "pool", type: "address" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAmountOut",
    inputs: [
      { name: "pool", type: "address" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

/** ERC-20 approve — needed for token approvals before swap */
export const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

/** ObidotVault ERC-4626 — minimal ABI for deposit/withdraw + state reads */
export const VAULT_ABI = [
  {
    type: "function",
    name: "deposit",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "redeem",
    inputs: [
      { name: "shares", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner", type: "address" },
    ],
    outputs: [{ name: "assets", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "totalAssets",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalSupply",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "paused",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "emergencyMode",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalRemoteAssets",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "convertToAssets",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "maxWithdraw",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;
