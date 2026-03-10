// ── Contract Addresses (Polkadot Hub TestNet) ─────────────────────────────

export const CONTRACTS = {
  // Phase 1 deployments
  VAULT: "0x37D7959f5f97D37799E0d04b7684c41CB2Ff878d",
  ORACLE_REGISTRY: "0x8b7C7345d6cF9de45f4aacC61F56F0241d47e88B",
  KEEPER_ORACLE: "0xf64d93DC125AC1B366532BBbA165615f6D566C7F",
  CROSS_CHAIN_ROUTER: "0xE65D7B65a1972A82bCF65f6711a43355Faa3f490",
  BIFROST_ADAPTER: "0x265Cb785De0fF2e5BcebDEb53095aDCAE9175527",
  TEST_DOT: "0x2402C804aD8a6217BF73D8483dA7564065c56083",
  // Phase 2 deployments
  XCM_EXECUTOR: "0xE8FDc9093395eA02017d5D66899F3E04CFF1CF64",
  HYPER_EXECUTOR: "0xaEC0009B15449102a39204259d07c2517cf8fC0f",
  NATIVE_DOT: "0xE72453bD8d5ECF56ccdDeF949C8AE0Cea5A41E7d",
  NATIVE_USDC: "0xAf233E9f2ED78022CAdEA58a84144ce6BcDFd63E",
  // DEX aggregator (not yet deployed — zero-address placeholders)
  SWAP_ROUTER: "0x0000000000000000000000000000000000000000",
  SWAP_QUOTER: "0x0000000000000000000000000000000000000000",
  HYDRATION_ADAPTER: "0x0000000000000000000000000000000000000000",
  ASSET_HUB_ADAPTER: "0x0000000000000000000000000000000000000000",
  BIFROST_DEX_ADAPTER: "0x0000000000000000000000000000000000000000",
} as const;

export const CHAIN = {
  id: 420420417,
  name: "Polkadot Hub TestNet",
  rpcUrl: "https://eth-rpc-testnet.polkadot.io/",
  blockExplorer: "https://blockscout-testnet.polkadot.io",
} as const;

/** API base URL — proxied via Next.js rewrites in dev */
export const API_BASE = "/api";

/** WebSocket URL for real-time events */
export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001/ws";

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
              { name: "feeBps", type: "uint16" },
              { name: "data", type: "bytes" },
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
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
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
