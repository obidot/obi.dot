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
} from "../config/constants.js";
import type { StrategyIntent } from "../types/index.js";
import { BifrostStrategyType, BifrostCurrencyId } from "../types/index.js";
import { signerLog } from "../utils/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Custom Chain Definition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Polkadot Hub Testnet (Paseo) chain definition for viem.
 */
const polkadotHubTestnet: Chain = {
  id: CHAIN_ID,
  name: "Polkadot Hub Testnet (Paseo)",
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
