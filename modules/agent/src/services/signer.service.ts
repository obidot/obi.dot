import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { env } from "../config/env.js";
import {
  CHAIN_ID,
  RPC_URL,
  VAULT_ADDRESS,
  VAULT_ABI,
  EIP712_DOMAIN,
  STRATEGY_INTENT_TYPES,
  BIFROST_ADAPTER_ADDRESS,
  BIFROST_ADAPTER_ABI,
  ERC20_ABI,
  SWAP_ROUTER_ADDRESS,
  SWAP_ROUTER_ABI,
} from "../config/constants.js";
import type { StrategyIntent } from "../types/index.js";
import { BifrostStrategyType, BifrostCurrencyId } from "../types/index.js";
import { signerLog } from "../utils/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Custom Chain Definition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Polkadot Hub TestNet chain definition for viem.
 */
const polkadotHubTestnet: Chain = {
  id: CHAIN_ID,
  name: "Polkadot Hub TestNet",
  nativeCurrency: {
    name: "DOT",
    symbol: "DOT",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
  testnet: true,
};

// ─────────────────────────────────────────────────────────────────────────────
//  SignerService
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Core Web3 interaction service for the Obidot Agent.
 *
 * Responsibilities:
 * 1. Query on-chain vault state (nonces, balances, policy flags)
 * 2. Construct & sign EIP-712 StrategyIntent payloads
 * 3. Submit signed intents to the vault's `executeStrategy()` function
 *
 * Separates cryptographic / EVM logic from AI reasoning logic.
 */
export class SignerService {
  /** The strategist account derived from the agent's private key. */
  private readonly account;

  /** Read-only RPC client for querying vault state. */
  private readonly publicClient: PublicClient;

  /** Signing + transacting client for submitting transactions. */
  private readonly walletClient: WalletClient;

  constructor() {
    this.account = privateKeyToAccount(env.AGENT_PRIVATE_KEY as Hex);

    this.publicClient = createPublicClient({
      chain: polkadotHubTestnet,
      transport: http(RPC_URL),
    });

    this.walletClient = createWalletClient({
      account: this.account,
      chain: polkadotHubTestnet,
      transport: http(RPC_URL),
    });

    signerLog.info(
      { strategist: this.account.address },
      "SignerService initialized",
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Getters
  // ─────────────────────────────────────────────────────────────────────

  /** Returns the EVM address of the agent / strategist. */
  get strategistAddress(): Address {
    return this.account.address;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  On-Chain Reads
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Fetch the current nonce for this strategist from the vault.
   * Used to populate `StrategyIntent.nonce` for replay protection.
   *
   * @returns The next expected nonce (uint256).
   */
  async fetchNonce(): Promise<bigint> {
    const nonce = await this.publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "nonces",
      args: [this.account.address],
    });

    signerLog.debug({ nonce: nonce.toString() }, "Fetched strategist nonce");
    return nonce;
  }

  /**
   * Fetch the total assets under management in the vault.
   */
  async fetchTotalAssets(): Promise<bigint> {
    return this.publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "totalAssets",
    });
  }

  /**
   * Fetch the total remote (deployed) assets.
   */
  async fetchTotalRemoteAssets(): Promise<bigint> {
    return this.publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "totalRemoteAssets",
    });
  }

  /**
   * Check if the vault is currently paused.
   */
  async fetchPaused(): Promise<boolean> {
    return this.publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "paused",
    });
  }

  /**
   * Check if emergency mode is active.
   */
  async fetchEmergencyMode(): Promise<boolean> {
    return this.publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "emergencyMode",
    });
  }

  /**
   * Fetch the daily loss accumulator.
   */
  async fetchDailyLoss(): Promise<bigint> {
    return this.publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "dailyLossAccumulator",
    });
  }

  /**
   * Fetch the maximum daily loss threshold.
   */
  async fetchMaxDailyLoss(): Promise<bigint> {
    return this.publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "maxDailyLoss",
    });
  }

  /**
   * Fetch the strategy counter (number of strategies executed).
   */
  async fetchStrategyCounter(): Promise<bigint> {
    return this.publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "strategyCounter",
    });
  }

  /**
   * Fetch the idle balance of the underlying asset sitting in the vault.
   */
  async fetchIdleBalance(): Promise<bigint> {
    const [totalAssets, remote] = await Promise.all([
      this.fetchTotalAssets(),
      this.fetchTotalRemoteAssets(),
    ]);
    // idle = totalAssets - remote (when not in emergency mode)
    return totalAssets > remote ? totalAssets - remote : 0n;
  }

  /**
   * Fetch a complete vault state snapshot for the AI decision engine.
   * Parallelizes all read calls for efficiency.
   */
  async fetchVaultState(): Promise<{
    totalAssets: bigint;
    totalRemoteAssets: bigint;
    idleBalance: bigint;
    paused: boolean;
    emergencyMode: boolean;
    dailyLoss: bigint;
    maxDailyLoss: bigint;
    nonce: bigint;
    strategyCounter: bigint;
  }> {
    const [
      totalAssets,
      totalRemoteAssets,
      paused,
      emergencyMode,
      dailyLoss,
      maxDailyLoss,
      nonce,
      strategyCounter,
    ] = await Promise.all([
      this.fetchTotalAssets(),
      this.fetchTotalRemoteAssets(),
      this.fetchPaused(),
      this.fetchEmergencyMode(),
      this.fetchDailyLoss(),
      this.fetchMaxDailyLoss(),
      this.fetchNonce(),
      this.fetchStrategyCounter(),
    ]);

    const idleBalance =
      totalAssets > totalRemoteAssets ? totalAssets - totalRemoteAssets : 0n;

    const state = {
      totalAssets,
      totalRemoteAssets,
      idleBalance,
      paused,
      emergencyMode,
      dailyLoss,
      maxDailyLoss,
      nonce,
      strategyCounter,
    };

    signerLog.info(
      {
        totalAssets: totalAssets.toString(),
        idleBalance: idleBalance.toString(),
        remote: totalRemoteAssets.toString(),
        paused,
        emergencyMode,
        nonce: nonce.toString(),
      },
      "Vault state snapshot fetched",
    );

    return state;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  EIP-712 Signing
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Sign a StrategyIntent using EIP-712 typed data.
   *
   * Constructs the full typed data envelope (domain + types + message)
   * matching the on-chain DOMAIN_SEPARATOR and STRATEGY_INTENT_TYPEHASH,
   * then signs with the agent's private key.
   *
   * @param intent - The fully-populated strategy intent to sign.
   * @returns The 65-byte EIP-712 signature (r || s || v).
   */
  async signStrategyIntent(intent: StrategyIntent): Promise<Hex> {
    signerLog.info(
      {
        amount: intent.amount.toString(),
        targetParachain: intent.targetParachain,
        targetProtocol: intent.targetProtocol,
        nonce: intent.nonce.toString(),
        deadline: intent.deadline.toString(),
        maxSlippageBps: intent.maxSlippageBps.toString(),
      },
      "Signing strategy intent",
    );

    const signature = await this.walletClient.signTypedData({
      account: this.account,
      domain: EIP712_DOMAIN,
      types: STRATEGY_INTENT_TYPES,
      primaryType: "StrategyIntent",
      message: {
        asset: intent.asset,
        amount: intent.amount,
        minReturn: intent.minReturn,
        maxSlippageBps: intent.maxSlippageBps,
        deadline: intent.deadline,
        nonce: intent.nonce,
        xcmCall: intent.xcmCall,
        targetParachain: intent.targetParachain,
        targetProtocol: intent.targetProtocol,
      },
    });

    signerLog.info(
      { signatureLength: signature.length },
      "Strategy intent signed successfully",
    );

    return signature;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  On-Chain Execution
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Submit a signed StrategyIntent to the vault's `executeStrategy()`.
   *
   * This is the final step that pushes the transaction to the Polkadot
   * Hub Testnet RPC. The vault's on-chain policy engine will validate
   * the signature, nonce, policy constraints, oracle price, and XCM
   * weight before dispatching the cross-chain message.
   *
   * @param intent    - The strategy intent struct.
   * @param signature - The EIP-712 signature from `signStrategyIntent()`.
   * @returns The transaction hash.
   */
  async executeOnChain(intent: StrategyIntent, signature: Hex): Promise<Hex> {
    signerLog.info(
      {
        amount: intent.amount.toString(),
        targetParachain: intent.targetParachain,
        nonce: intent.nonce.toString(),
      },
      "Submitting executeStrategy transaction",
    );

    const txHash = await this.walletClient.writeContract({
      account: this.account,
      chain: polkadotHubTestnet,
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "executeStrategy",
      args: [
        {
          asset: intent.asset,
          amount: intent.amount,
          minReturn: intent.minReturn,
          maxSlippageBps: intent.maxSlippageBps,
          deadline: intent.deadline,
          nonce: intent.nonce,
          xcmCall: intent.xcmCall,
          targetParachain: intent.targetParachain,
          targetProtocol: intent.targetProtocol,
        },
        signature,
      ],
    });

    signerLog.info({ txHash }, "Transaction submitted successfully");

    // Wait for receipt
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    signerLog.info(
      {
        txHash,
        blockNumber: receipt.blockNumber.toString(),
        status: receipt.status,
        gasUsed: receipt.gasUsed.toString(),
      },
      "Transaction confirmed",
    );

    return txHash;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Strategy Outcome Tracking
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Strategy status enum matching the on-chain StrategyStatus.
   *   0 = Pending, 1 = Sent, 2 = Executed, 3 = Failed
   */
  static readonly StrategyStatus = {
    Pending: 0,
    Sent: 1,
    Executed: 2,
    Failed: 3,
  } as const;

  /**
   * Query the on-chain status of a strategy by ID.
   *
   * @param strategyId - The strategy ID returned by executeStrategy.
   * @returns Strategy record: strategist, protocol, status, amount, etc.
   */
  async fetchStrategyRecord(strategyId: bigint): Promise<{
    strategist: Address;
    targetProtocol: Address;
    targetParachain: number;
    amount: bigint;
    minReturn: bigint;
    executedAt: bigint;
    status: number;
  }> {
    const result = await this.publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "strategies",
      args: [strategyId],
    });

    // Destructure the tuple returned by the contract
    const [
      strategist,
      targetProtocol,
      targetParachain,
      amount,
      minReturn,
      executedAt,
      status,
    ] = result as [Address, Address, number, bigint, bigint, bigint, number];

    return {
      strategist,
      targetProtocol,
      targetParachain,
      amount,
      minReturn,
      executedAt,
      status,
    };
  }

  /**
   * Report the outcome of a remote strategy execution.
   *
   * Calls `reportStrategyOutcome()` on the vault contract (KEEPER_ROLE required).
   *
   * @param strategyId     - The strategy ID to report on.
   * @param success        - Whether the remote execution succeeded.
   * @param returnedAmount - Amount of assets returned.
   * @returns Transaction hash.
   */
  async reportOutcome(
    strategyId: bigint,
    success: boolean,
    returnedAmount: bigint,
  ): Promise<Hex> {
    signerLog.info(
      {
        strategyId: strategyId.toString(),
        success,
        returnedAmount: returnedAmount.toString(),
      },
      "Reporting strategy outcome",
    );

    const txHash = await this.walletClient.writeContract({
      account: this.account,
      chain: polkadotHubTestnet,
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "reportStrategyOutcome",
      args: [strategyId, success, returnedAmount],
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    signerLog.info(
      {
        txHash,
        strategyId: strategyId.toString(),
        success,
        blockNumber: receipt.blockNumber.toString(),
        status: receipt.status,
      },
      "Strategy outcome reported on-chain",
    );

    return txHash;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  ERC-4626 Deposit
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Approve the vault to spend `amount` of `token` from the agent's wallet,
   * then call vault.deposit(amount, receiver).
   *
   * @param token    - ERC-20 token address
   * @param amount   - Amount in base units (wei)
   * @param receiver - Address to receive vault shares
   * @returns Transaction hash of the deposit
   */
  async executeDeposit(
    token: `0x${string}`,
    amount: bigint,
    receiver: `0x${string}`,
  ): Promise<Hex> {
    // ── Check & set allowance ──────────────────────────────────────────
    const allowance = await this.publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [this.account.address, VAULT_ADDRESS],
    });

    if (allowance < amount) {
      signerLog.info(
        { allowance: allowance.toString(), needed: amount.toString() },
        "Approving vault to spend token",
      );
      const approveTx = await this.walletClient.writeContract({
        account: this.account,
        chain: polkadotHubTestnet,
        address: token,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [VAULT_ADDRESS, amount],
      });
      await this.publicClient.waitForTransactionReceipt({ hash: approveTx });
      signerLog.info({ approveTx }, "Approval confirmed");
    }

    // ── Execute deposit ────────────────────────────────────────────────
    signerLog.info(
      { token, amount: amount.toString(), receiver },
      "Submitting vault deposit",
    );
    const txHash = await this.walletClient.writeContract({
      account: this.account,
      chain: polkadotHubTestnet,
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "deposit",
      args: [amount, receiver],
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    signerLog.info(
      { txHash, blockNumber: receipt.blockNumber.toString(), status: receipt.status },
      "Deposit confirmed",
    );

    return txHash;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Direct UV2 Swap
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Execute a direct UniswapV2 swap through the SwapRouter.
   *
   * For single-hop routes, calls SwapRouter.swap().
   * For multi-hop routes, calls SwapRouter.swapMultiHop().
   *
   * @param hops       Route hops from findRoutes() — each hop has pool, tokenIn, tokenOut, feeBps
   * @param amountIn   Amount of tokenIn in wei
   * @param minAmountOut  Minimum output after slippage
   * @param to         Recipient address (defaults to agent wallet)
   * @returns Transaction hash
   */
  async executeDirectSwap(
    hops: Array<{ pool: string; tokenIn: string; tokenOut: string; feeBps: string }>,
    amountIn: bigint,
    minAmountOut: bigint,
    to?: `0x${string}`,
  ): Promise<`0x${string}`> {
    if (hops.length === 0) throw new Error("executeDirectSwap: empty hops");

    const recipient = to ?? this.account.address;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600); // 10 min
    const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
    const POOL_TYPE_CUSTOM = 3; // PoolType.Custom = UV2

    // ── Check & set tokenIn allowance for SwapRouter ───────────────────────
    const tokenIn = hops[0].tokenIn as `0x${string}`;
    const allowance = await this.publicClient.readContract({
      address: tokenIn,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [this.account.address, SWAP_ROUTER_ADDRESS],
    });

    if ((allowance as bigint) < amountIn) {
      signerLog.info(
        { tokenIn, amountIn: amountIn.toString() },
        "Approving SwapRouter to spend token",
      );
      const approveTx = await this.walletClient.writeContract({
        account: this.account,
        chain: polkadotHubTestnet,
        address: tokenIn,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [SWAP_ROUTER_ADDRESS, amountIn],
        gas: BigInt(50_000),
      });
      await this.publicClient.waitForTransactionReceipt({ hash: approveTx });
      signerLog.info({ approveTx }, "SwapRouter approval confirmed");
    }

    // ── Execute swap ─────────────────────────────────────────────────────
    let txHash: `0x${string}`;

    if (hops.length === 1) {
      const hop = hops[0];
      txHash = await this.walletClient.writeContract({
        account: this.account,
        chain: polkadotHubTestnet,
        address: SWAP_ROUTER_ADDRESS,
        abi: SWAP_ROUTER_ABI,
        functionName: "swap",
        args: [
          {
            route: {
              poolType: POOL_TYPE_CUSTOM,
              pool: hop.pool as `0x${string}`,
              tokenIn: hop.tokenIn as `0x${string}`,
              tokenOut: hop.tokenOut as `0x${string}`,
              feeBps: BigInt(hop.feeBps),
              data: ZERO_BYTES32,
            },
            amountIn,
            minAmountOut,
            to: recipient,
            deadline,
          },
        ],
        gas: BigInt(300_000),
      });
    } else {
      const routes = hops.map((hop) => ({
        poolType: POOL_TYPE_CUSTOM,
        pool: hop.pool as `0x${string}`,
        tokenIn: hop.tokenIn as `0x${string}`,
        tokenOut: hop.tokenOut as `0x${string}`,
        feeBps: BigInt(hop.feeBps),
        data: ZERO_BYTES32,
      }));

      txHash = await this.walletClient.writeContract({
        account: this.account,
        chain: polkadotHubTestnet,
        address: SWAP_ROUTER_ADDRESS,
        abi: SWAP_ROUTER_ABI,
        functionName: "swapMultiHop",
        args: [routes, amountIn, minAmountOut, recipient, deadline],
        gas: BigInt(500_000),
      });
    }

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    signerLog.info(
      { txHash, hops: hops.length, blockNumber: receipt.blockNumber.toString(), status: receipt.status },
      "Direct swap executed",
    );
    return txHash;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Bifrost Adapter Interaction
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Preview the expected return for a Bifrost strategy.
   *
   * @param strategyType - The Bifrost strategy type enum value.
   * @param amount       - The input amount in wei.
   * @param currencyIn   - Input currency ID.
   * @param currencyOut  - Output currency ID (0 if not applicable).
   * @returns Estimated return amount in wei.
   */
  async previewBifrostStrategy(
    strategyType: BifrostStrategyType,
    amount: bigint,
    currencyIn: BifrostCurrencyId,
    currencyOut: BifrostCurrencyId = BifrostCurrencyId.DOT,
  ): Promise<bigint> {
    if (
      BIFROST_ADAPTER_ADDRESS === "0x0000000000000000000000000000000000000000"
    ) {
      signerLog.warn("BifrostAdapter not configured — returning 0");
      return 0n;
    }

    const result = await this.publicClient.readContract({
      address: BIFROST_ADAPTER_ADDRESS,
      abi: BIFROST_ADAPTER_ABI,
      functionName: "previewStrategy",
      args: [strategyType, amount, currencyIn, currencyOut],
    });

    signerLog.debug(
      {
        strategyType,
        amount: amount.toString(),
        estimatedReturn: (result as bigint).toString(),
      },
      "Bifrost strategy preview",
    );

    return result as bigint;
  }

  /**
   * Execute a Bifrost strategy via the BifrostAdapter contract.
   *
   * @param strategyType - The Bifrost strategy type.
   * @param amount       - Amount of input token in wei.
   * @param currencyIn   - Input currency ID.
   * @param currencyOut  - Output currency ID.
   * @param poolId       - Farming pool ID (0 if not applicable).
   * @param minOutput    - Minimum acceptable output amount.
   * @returns Transaction hash.
   */
  async executeBifrostStrategy(
    strategyType: BifrostStrategyType,
    amount: bigint,
    currencyIn: BifrostCurrencyId,
    currencyOut: BifrostCurrencyId = BifrostCurrencyId.DOT,
    poolId = 0,
    minOutput = 0n,
  ): Promise<Hex> {
    if (
      BIFROST_ADAPTER_ADDRESS === "0x0000000000000000000000000000000000000000"
    ) {
      throw new Error("BifrostAdapter not configured");
    }

    signerLog.info(
      {
        strategyType,
        amount: amount.toString(),
        currencyIn,
        currencyOut,
        poolId,
        minOutput: minOutput.toString(),
      },
      "Executing Bifrost strategy",
    );

    const txHash = await this.walletClient.writeContract({
      account: this.account,
      chain: polkadotHubTestnet,
      address: BIFROST_ADAPTER_ADDRESS,
      abi: BIFROST_ADAPTER_ABI,
      functionName: "executeBifrostStrategy",
      args: [strategyType, amount, currencyIn, currencyOut, poolId, minOutput],
    });

    signerLog.info({ txHash }, "Bifrost strategy transaction submitted");

    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    signerLog.info(
      {
        txHash,
        blockNumber: receipt.blockNumber.toString(),
        status: receipt.status,
        gasUsed: receipt.gasUsed.toString(),
      },
      "Bifrost strategy transaction confirmed",
    );

    return txHash;
  }
}
