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
        name: "swapMultiHop",
        inputs: [
            {
                name: "routes",
                type: "tuple[]",
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
        outputs: [{ name: "amountOut", type: "uint256" }],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "swapSplit",
        inputs: [
            {
                name: "legs",
                type: "tuple[]",
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
                    { name: "weight", type: "uint256" },
                ],
            },
            { name: "tokenIn", type: "address" },
            { name: "tokenOut", type: "address" },
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
                    { name: "feeBps", type: "uint256" },
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
                    { name: "feeBps", type: "uint256" },
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
            { name: "data", type: "bytes32" },
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

/** ERC-20 mint — needed for faucet operations */
export const ERC20_MINT_ABI = [
    {
        name: "mint",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
            { name: "to", type: "address" },
            { name: "amount", type: "uint256" },
        ],
        outputs: [],
    },
] as const;
