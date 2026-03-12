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
  VAULT_INTENT_ABI,
  EIP712_DOMAIN,
  STRATEGY_INTENT_TYPES,
  UNIVERSAL_INTENT_TYPES,
  INTENT_DEADLINE_SECONDS,
  ASSET_ADDRESS,
} from "../config/constants.js";
import type { UniversalIntent, StrategyIntent } from "../types/index.js";
import { intentLog } from "../utils/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Chain Definition
// ─────────────────────────────────────────────────────────────────────────────

const polkadotHubTestnet: Chain = {
  id: CHAIN_ID,
  name: "Polkadot Hub TestNet",
  nativeCurrency: { name: "DOT", symbol: "DOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  testnet: true,
};

// ─────────────────────────────────────────────────────────────────────────────
//  IntentService
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Service for EIP-712 intent signing and on-chain execution.
 *
 * Handles:
 * - Signing UniversalIntent payloads via EIP-712
 * - Calling vault.executeIntent() for cross-chain operations
 * - Calling vault.executeLocalSwap() for on-hub DEX swaps
 * - Fetching intent nonces
 */
export class IntentService {
  private readonly account;
  private readonly publicClient: PublicClient;
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

    intentLog.info(
      { solver: this.account.address },
      "IntentService initialized",
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Getters
  // ─────────────────────────────────────────────────────────────────────

  /** Returns the solver/strategist EVM address. */
  get solverAddress(): Address {
    return this.account.address;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  On-Chain Reads
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Fetch the current intent nonce for this solver from the vault.
   * Used to populate `UniversalIntent.nonce` for replay protection.
   */
  async fetchIntentNonce(): Promise<bigint> {
    const nonce = await this.publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_INTENT_ABI,
      functionName: "intentNonces",
      args: [this.account.address],
    });

    intentLog.debug(
      { nonce: (nonce as bigint).toString() },
      "Fetched intent nonce",
    );
    return nonce as bigint;
  }

  /**
   * Fetch the SwapRouter address configured on the vault.
   */
  async fetchSwapRouter(): Promise<Address> {
    const router = await this.publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_INTENT_ABI,
      functionName: "swapRouter",
    });
    return router as Address;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  EIP-712 Signing
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Sign a UniversalIntent using EIP-712 typed data.
   *
   * @param intent The fully-populated universal intent to sign.
   * @returns The 65-byte EIP-712 signature (r || s || v).
   */
  async signUniversalIntent(intent: UniversalIntent): Promise<Hex> {
    intentLog.info(
      {
        inToken: intent.inAsset.token,
        outToken: intent.outAsset.token,
        amount: intent.amount.toString(),
        nonce: intent.nonce.toString(),
        destType: intent.dest.destType,
      },
      "Signing universal intent",
    );

    const signature = await this.walletClient.signTypedData({
      account: this.account,
      domain: EIP712_DOMAIN,
      types: UNIVERSAL_INTENT_TYPES,
      primaryType: "UniversalIntent",
      message: {
        inAsset: {
          token: intent.inAsset.token,
          assetId: intent.inAsset.assetId,
        },
        outAsset: {
          token: intent.outAsset.token,
          assetId: intent.outAsset.assetId,
        },
        amount: intent.amount,
        minOut: intent.minOut,
        dest: {
          destType: intent.dest.destType,
          paraId: intent.dest.paraId,
          chainId: intent.dest.chainId,
        },
        calldata_: intent.calldata_,
        nonce: intent.nonce,
        deadline: intent.deadline,
      },
    });

    intentLog.info(
      { signatureLength: signature.length },
      "Universal intent signed",
    );

    return signature;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  On-Chain Execution
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Submit a signed UniversalIntent to vault.executeIntent().
   *
   * @param intent    The universal intent struct.
   * @param signature The EIP-712 signature from signUniversalIntent().
   * @returns The transaction hash.
   */
  async executeIntent(intent: UniversalIntent, signature: Hex): Promise<Hex> {
    intentLog.info(
      {
        amount: intent.amount.toString(),
        destType: intent.dest.destType,
        nonce: intent.nonce.toString(),
      },
      "Submitting executeIntent transaction",
    );

    const txHash = await this.walletClient.writeContract({
      account: this.account,
      chain: polkadotHubTestnet,
      address: VAULT_ADDRESS,
      abi: VAULT_INTENT_ABI,
      functionName: "executeIntent",
      args: [
        {
          inAsset: {
            token: intent.inAsset.token,
            assetId: intent.inAsset.assetId,
          },
          outAsset: {
            token: intent.outAsset.token,
            assetId: intent.outAsset.assetId,
          },
          amount: intent.amount,
          minOut: intent.minOut,
          dest: {
            destType: intent.dest.destType,
            paraId: intent.dest.paraId,
            chainId: intent.dest.chainId,
          },
          calldata_: intent.calldata_,
          nonce: intent.nonce,
          deadline: intent.deadline,
        },
        signature,
      ],
    });

    intentLog.info({ txHash }, "executeIntent transaction submitted");

    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    intentLog.info(
      {
        txHash,
        blockNumber: receipt.blockNumber.toString(),
        status: receipt.status,
        gasUsed: receipt.gasUsed.toString(),
      },
      "executeIntent confirmed",
    );

    return txHash;
  }

  /**
   * Submit a signed executeLocalSwap to the vault.
   *
   * Routes a swap through the on-hub SwapRouter with StrategyIntent authorization.
   *
   * @param swapParams     The SwapParams struct for the router.
   * @param strategyIntent The StrategyIntent authorizing the swap.
   * @param signature      EIP-712 signature of the StrategyIntent.
   * @returns The transaction hash.
   */
  async executeLocalSwap(
    swapParams: {
      route: {
        poolType: number;
        pool: Address;
        tokenIn: Address;
        tokenOut: Address;
        feeBps: bigint;
        data: Hex;
      };
      amountIn: bigint;
      minAmountOut: bigint;
      to: Address;
      deadline: bigint;
    },
    strategyIntent: StrategyIntent,
    signature: Hex,
  ): Promise<Hex> {
    intentLog.info(
      {
        tokenIn: swapParams.route.tokenIn,
        tokenOut: swapParams.route.tokenOut,
        amountIn: swapParams.amountIn.toString(),
        poolType: swapParams.route.poolType,
      },
      "Submitting executeLocalSwap transaction",
    );

    const txHash = await this.walletClient.writeContract({
      account: this.account,
      chain: polkadotHubTestnet,
      address: VAULT_ADDRESS,
      abi: VAULT_INTENT_ABI,
      functionName: "executeLocalSwap",
      args: [
        {
          route: {
            poolType: swapParams.route.poolType,
            pool: swapParams.route.pool,
            tokenIn: swapParams.route.tokenIn,
            tokenOut: swapParams.route.tokenOut,
            feeBps: swapParams.route.feeBps,
            data: swapParams.route.data,
          },
          amountIn: swapParams.amountIn,
          minAmountOut: swapParams.minAmountOut,
          to: swapParams.to,
          deadline: swapParams.deadline,
        },
        {
          asset: strategyIntent.asset,
          amount: strategyIntent.amount,
          minReturn: strategyIntent.minReturn,
          maxSlippageBps: strategyIntent.maxSlippageBps,
          deadline: strategyIntent.deadline,
          nonce: strategyIntent.nonce,
          xcmCall: strategyIntent.xcmCall,
          targetParachain: strategyIntent.targetParachain,
          targetProtocol: strategyIntent.targetProtocol,
        },
        signature,
      ],
    });

    intentLog.info({ txHash }, "executeLocalSwap transaction submitted");

    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    intentLog.info(
      {
        txHash,
        blockNumber: receipt.blockNumber.toString(),
        status: receipt.status,
        gasUsed: receipt.gasUsed.toString(),
      },
      "executeLocalSwap confirmed",
    );

    return txHash;
  }

  /**
   * Sign a StrategyIntent for use with executeLocalSwap.
   * Delegates to the same EIP-712 domain/types as the legacy executeStrategy flow.
   */
  async signStrategyIntent(intent: StrategyIntent): Promise<Hex> {
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

    return signature;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Helpers
  // ─────────────────────────────────────────────────────────────────────

  /** Compute a deadline timestamp from now + offset. */
  computeDeadline(offsetSeconds?: bigint): bigint {
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    return nowSeconds + (offsetSeconds ?? INTENT_DEADLINE_SECONDS);
  }

  /** Get the vault's underlying asset address. */
  get assetAddress(): Address {
    return ASSET_ADDRESS;
  }
}
