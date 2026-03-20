import { Tool } from "@langchain/core/tools";

import { SignerService } from "../services/signer.service.js";
import { YieldService } from "../services/yield.service.js";
import { CrossChainService } from "../services/crosschain.service.js";
import { SwapRouterService } from "../services/swap-router.service.js";
import { IntentService } from "../services/intent.service.js";
import {
  ASSET_ADDRESS,
  INTENT_DEADLINE_SECONDS,
  MAX_STRATEGY_AMOUNT,
  PLACEHOLDER_XCM_CALL,
  TOKEN_ADDRESSES,
  VAULT_ADDRESS,
} from "../config/constants.js";
import {
  aiDecisionSchema,
  BifrostStrategyType,
  BifrostCurrencyId,
  BIFROST_STRATEGY_LABELS,
  DestType,
  POOL_TYPE_LABELS,
  type StrategyIntent,
  type ReallocateDecision,
  type LocalSwapDecision,
  type UniversalIntentDecision,
} from "../types/index.js";
import { agentLog, swapLog, intentLog } from "../utils/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
//  FetchYieldsTool — Perception phase
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LangChain tool that fetches current DeFi yield data from tracked protocols.
 * Called during the "Perception" phase of the autonomous loop so the LLM
 * receives up-to-date market information for decision-making.
 */
export class FetchYieldsTool extends Tool {
  name = "fetch_yields";
  description =
    "Fetch current annual percentage yield (APY) data for all tracked " +
    "Polkadot DeFi protocols (Hydration Omnipool, Bifrost vDOT). " +
    "Returns a JSON array of protocol yield objects.";

  private readonly yieldService: YieldService;

  constructor(yieldService: YieldService) {
    super();
    this.yieldService = yieldService;
  }

  /** @internal LangChain entry-point. */
  protected async _call(_input: string): Promise<string> {
    try {
      const yields = await this.yieldService.fetchYields();
      return JSON.stringify({
        success: true,
        data: yields.map((y) => ({
          name: y.name,
          paraId: y.paraId,
          protocol: y.protocol,
          apyPercent: y.apyPercent,
          tvlUsd: y.tvlUsd,
          fetchedAt: y.fetchedAt.toISOString(),
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      agentLog.error({ err: error }, "FetchYieldsTool failed");
      return JSON.stringify({ success: false, error: message });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  FetchBifrostYieldsTool — Bifrost-specific yield data
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LangChain tool that fetches Bifrost-specific DeFi yield data including
 * SLP liquid staking, DEX pools, farming pools, and SALP crowdloans.
 */
export class FetchBifrostYieldsTool extends Tool {
  name = "fetch_bifrost_yields";
  description =
    "Fetch detailed Bifrost DeFi yield data including SLP liquid staking " +
    "(vDOT/vKSM), Zenlink DEX pool yields, farming pool APYs, and SALP " +
    "crowdloan returns. Returns category, currencyIn/Out, poolId, and isActive.";

  private readonly yieldService: YieldService;

  constructor(yieldService: YieldService) {
    super();
    this.yieldService = yieldService;
  }

  /** @internal LangChain entry-point. */
  protected async _call(_input: string): Promise<string> {
    try {
      const bifrostYields = await this.yieldService.fetchBifrostYields();
      return JSON.stringify({
        success: true,
        data: bifrostYields.map((y) => ({
          name: y.name,
          paraId: y.paraId,
          protocol: y.protocol,
          apyPercent: y.apyPercent,
          tvlUsd: y.tvlUsd,
          category: y.category,
          currencyIn: y.currencyIn,
          currencyOut: y.currencyOut,
          poolId: y.poolId,
          isActive: y.isActive,
          fetchedAt: y.fetchedAt.toISOString(),
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      agentLog.error({ err: error }, "FetchBifrostYieldsTool failed");
      return JSON.stringify({ success: false, error: message });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  FetchVaultStateTool — Perception phase
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LangChain tool that queries the ObidotVault on-chain state.
 * Provides the LLM with idle balance, remote exposure, nonce, and
 * health indicators (paused, emergency mode, daily loss).
 */
export class FetchVaultStateTool extends Tool {
  name = "fetch_vault_state";
  description =
    "Query the ObidotVault on-chain state including idle balance, " +
    "remote assets, total assets, paused status, emergency mode, " +
    "daily loss, and current strategist nonce. Returns a JSON object.";

  private readonly signerService: SignerService;

  constructor(signerService: SignerService) {
    super();
    this.signerService = signerService;
  }

  /** @internal LangChain entry-point. */
  protected async _call(_input: string): Promise<string> {
    try {
      const state = await this.signerService.fetchVaultState();
      return JSON.stringify({
        success: true,
        data: {
          totalAssets: state.totalAssets.toString(),
          totalRemoteAssets: state.totalRemoteAssets.toString(),
          idleBalance: state.idleBalance.toString(),
          paused: state.paused,
          emergencyMode: state.emergencyMode,
          dailyLoss: state.dailyLoss.toString(),
          maxDailyLoss: state.maxDailyLoss.toString(),
          nonce: state.nonce.toString(),
          strategyCounter: state.strategyCounter.toString(),
          strategistAddress: this.signerService.strategistAddress,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      agentLog.error({ err: error }, "FetchVaultStateTool failed");
      return JSON.stringify({ success: false, error: message });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  FetchCrossChainStateTool — Cross-chain perception
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LangChain tool that queries cross-chain vault state across the hub
 * and all configured satellite EVM chains.
 */
export class FetchCrossChainStateTool extends Tool {
  name = "fetch_cross_chain_state";
  description =
    "Query cross-chain vault state including hub vault state, satellite " +
    "vault assets on Ethereum/L2s, global total assets, and sync freshness. " +
    "Returns satellite chain breakdown and stale sync warnings.";

  private readonly signerService: SignerService;
  private readonly crossChainService: CrossChainService;

  constructor(
    signerService: SignerService,
    crossChainService: CrossChainService,
  ) {
    super();
    this.signerService = signerService;
    this.crossChainService = crossChainService;
  }

  /** @internal LangChain entry-point. */
  protected async _call(_input: string): Promise<string> {
    try {
      if (!this.crossChainService.hasSatellites) {
        return JSON.stringify({
          success: true,
          data: {
            hasSatellites: false,
            message: "No satellite chains configured",
          },
        });
      }

      const hubState = await this.signerService.fetchVaultState();
      const [crossChainState, staleSatellites, routerActive] =
        await Promise.all([
          this.crossChainService.fetchCrossChainState(hubState),
          this.crossChainService.getStaleSatellites(),
          this.crossChainService.isRouterActive(),
        ]);

      return JSON.stringify({
        success: true,
        data: {
          hasSatellites: true,
          routerActive,
          globalTotalAssets: crossChainState.globalTotalAssets.toString(),
          totalSatelliteAssets: crossChainState.totalSatelliteAssets.toString(),
          hubTotalAssets: hubState.totalAssets.toString(),
          satellites: crossChainState.satelliteAssets.map((s) => ({
            chainId: s.chainId,
            chainName: s.chainName,
            totalAssets: s.totalAssets.toString(),
            emergencyMode: s.emergencyMode,
            lastSyncTimestamp: s.lastSyncTimestamp,
          })),
          staleSatellites,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      agentLog.error({ err: error }, "FetchCrossChainStateTool failed");
      return JSON.stringify({ success: false, error: message });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ExecuteStrategyTool — Execution phase (XCM reallocation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LangChain tool that takes the AI's reallocation decision, validates it
 * with Zod, constructs a StrategyIntent, signs it via EIP-712, and
 * submits it to the vault's `executeStrategy()` function.
 *
 * This is the most security-critical tool: it enforces schema validation
 * (preventing hallucinated parameters) before any cryptographic operation.
 */
export class ExecuteStrategyTool extends Tool {
  name = "execute_strategy";
  description =
    "Execute a cross-chain reallocation strategy. Input MUST be a JSON object " +
    'with: action ("REALLOCATE"), targetParachain (number), targetProtocol (address), ' +
    "amount (wei string), maxSlippageBps (1-100), reasoning (string). " +
    "Signs the intent via EIP-712 and submits the transaction on-chain.";

  private readonly signerService: SignerService;

  constructor(signerService: SignerService) {
    super();
    this.signerService = signerService;
  }

  /** @internal LangChain entry-point. */
  protected async _call(input: string): Promise<string> {
    try {
      // ── 1. Parse raw LLM output ──────────────────────────────────────
      let rawDecision: unknown;
      try {
        rawDecision = JSON.parse(input);
      } catch {
        return JSON.stringify({
          success: false,
          error: "Invalid JSON input. Expected a REALLOCATE decision object.",
        });
      }

      // ── 2. Zod-validate the AI decision ──────────────────────────────
      const parseResult = aiDecisionSchema.safeParse(rawDecision);
      if (!parseResult.success) {
        agentLog.warn(
          { errors: parseResult.error.flatten() },
          "AI decision failed Zod validation",
        );
        return JSON.stringify({
          success: false,
          error: `Validation failed: ${parseResult.error.message}`,
        });
      }

      const decision = parseResult.data;

      // ── 3. Handle non-REALLOCATE actions ─────────────────────────────
      if (decision.action !== "REALLOCATE") {
        return JSON.stringify({
          success: false,
          error: `ExecuteStrategyTool only handles REALLOCATE, got ${decision.action}`,
        });
      }

      // Type-narrow after discriminated union check
      const reallocate = decision as ReallocateDecision;

      // ── 4. Enforce agent-side guardrails ──────────────────────────────
      const amount = BigInt(reallocate.amount);

      if (amount > MAX_STRATEGY_AMOUNT) {
        return JSON.stringify({
          success: false,
          error: `Amount ${amount} exceeds agent MAX_STRATEGY_AMOUNT ${MAX_STRATEGY_AMOUNT}`,
        });
      }

      if (reallocate.maxSlippageBps > 100) {
        return JSON.stringify({
          success: false,
          error: `maxSlippageBps ${reallocate.maxSlippageBps} exceeds agent limit of 100 (1%)`,
        });
      }

      // ── 5. Fetch current nonce ────────────────────────────────────────
      const nonce = await this.signerService.fetchNonce();

      // ── 6. Compute minReturn with slippage ────────────────────────────
      const slippageBps = BigInt(reallocate.maxSlippageBps);
      const minReturn = (amount * (10_000n - slippageBps)) / 10_000n;

      // ── 7. Compute deadline ───────────────────────────────────────────
      const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
      const deadline = nowSeconds + INTENT_DEADLINE_SECONDS;

      // ── 8. Build StrategyIntent ───────────────────────────────────────
      const intent: StrategyIntent = {
        asset: ASSET_ADDRESS,
        amount,
        minReturn,
        maxSlippageBps: slippageBps,
        deadline,
        nonce,
        xcmCall: PLACEHOLDER_XCM_CALL,
        targetParachain: reallocate.targetParachain,
        targetProtocol: reallocate.targetProtocol as `0x${string}`,
      };

      agentLog.info(
        {
          amount: intent.amount.toString(),
          minReturn: intent.minReturn.toString(),
          targetParachain: intent.targetParachain,
          targetProtocol: intent.targetProtocol,
          nonce: intent.nonce.toString(),
          deadline: intent.deadline.toString(),
          reasoning: reallocate.reasoning,
        },
        "Constructed StrategyIntent",
      );

      // ── 9. Sign via EIP-712 ───────────────────────────────────────────
      const signature = await this.signerService.signStrategyIntent(intent);

      // ── 10. Submit on-chain ───────────────────────────────────────────
      const txHash = await this.signerService.executeOnChain(intent, signature);

      agentLog.info(
        { txHash, strategyNonce: nonce.toString() },
        "Strategy executed successfully",
      );

      return JSON.stringify({
        success: true,
        data: {
          action: "REALLOCATE",
          txHash,
          nonce: nonce.toString(),
          amount: intent.amount.toString(),
          minReturn: intent.minReturn.toString(),
          targetParachain: intent.targetParachain,
          targetProtocol: intent.targetProtocol,
          reasoning: reallocate.reasoning,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      agentLog.error({ err: error }, "ExecuteStrategyTool failed");
      return JSON.stringify({ success: false, error: message });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ExecuteBifrostStrategyTool — Bifrost DeFi execution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LangChain tool that executes Bifrost DeFi strategies (SLP, DEX, Farming, SALP)
 * via the BifrostAdapter contract. Validates the AI decision with Zod, then
 * invokes the adapter on-chain.
 */
export class ExecuteBifrostStrategyTool extends Tool {
  name = "execute_bifrost_strategy";
  description =
    "Execute a Bifrost DeFi strategy (SLP liquid staking, DEX swap, farming, SALP). " +
    'Input MUST be a JSON object with: action ("BIFROST_STRATEGY"), ' +
    "strategyType (0-6), amount (wei string), maxSlippageBps (1-100), " +
    "currencyIn (0-4), currencyOut (0-4, optional), poolId (optional), " +
    "minOutput (wei string, optional), reasoning (string).";

  private readonly signerService: SignerService;

  constructor(signerService: SignerService) {
    super();
    this.signerService = signerService;
  }

  /** @internal LangChain entry-point. */
  protected async _call(input: string): Promise<string> {
    try {
      // ── 1. Parse raw LLM output ──────────────────────────────────────
      let rawDecision: unknown;
      try {
        rawDecision = JSON.parse(input);
      } catch {
        return JSON.stringify({
          success: false,
          error:
            "Invalid JSON input. Expected a BIFROST_STRATEGY decision object.",
        });
      }

      // ── 2. Zod-validate ──────────────────────────────────────────────
      const parseResult = aiDecisionSchema.safeParse(rawDecision);
      if (!parseResult.success) {
        agentLog.warn(
          { errors: parseResult.error.flatten() },
          "Bifrost decision failed Zod validation",
        );
        return JSON.stringify({
          success: false,
          error: `Validation failed: ${parseResult.error.message}`,
        });
      }

      const decision = parseResult.data;
      if (decision.action !== "BIFROST_STRATEGY") {
        return JSON.stringify({
          success: false,
          error: `Expected BIFROST_STRATEGY, got ${decision.action}`,
        });
      }

      // Type-narrow after discriminated union check – Zod's .refine() breaks
      // TS discriminated-union inference so we cast through `unknown` first.
      const bifrost = decision as unknown as {
        action: "BIFROST_STRATEGY";
        strategyType: BifrostStrategyType;
        amount: string;
        maxSlippageBps: number;
        currencyIn: BifrostCurrencyId;
        currencyOut?: BifrostCurrencyId;
        poolId?: number;
        minOutput?: string;
        reasoning: string;
      };

      // ── 3. Guardrails ────────────────────────────────────────────────
      const amount = BigInt(bifrost.amount);
      if (amount > MAX_STRATEGY_AMOUNT) {
        return JSON.stringify({
          success: false,
          error: `Amount ${amount} exceeds MAX_STRATEGY_AMOUNT ${MAX_STRATEGY_AMOUNT}`,
        });
      }
      if (bifrost.maxSlippageBps > 100) {
        return JSON.stringify({
          success: false,
          error: `maxSlippageBps ${bifrost.maxSlippageBps} exceeds limit of 100`,
        });
      }

      // ── 4. Compute minimum output ────────────────────────────────────
      const slippageBps = BigInt(bifrost.maxSlippageBps);
      const minOutput = bifrost.minOutput
        ? BigInt(bifrost.minOutput)
        : (amount * (10_000n - slippageBps)) / 10_000n;

      const strategyType: BifrostStrategyType = bifrost.strategyType;
      const currencyIn: BifrostCurrencyId = bifrost.currencyIn;
      const currencyOut: BifrostCurrencyId =
        bifrost.currencyOut ?? BifrostCurrencyId.DOT;
      const poolId: number = bifrost.poolId ?? 0;

      agentLog.info(
        {
          strategyType: BIFROST_STRATEGY_LABELS[strategyType],
          amount: amount.toString(),
          currencyIn,
          currencyOut,
          poolId,
          minOutput: minOutput.toString(),
          reasoning: bifrost.reasoning,
        },
        "Executing Bifrost strategy",
      );

      // ── 5. Execute via BifrostAdapter ─────────────────────────────────
      const txHash = await this.signerService.executeBifrostStrategy(
        strategyType,
        amount,
        currencyIn,
        currencyOut,
        poolId,
        minOutput,
      );

      agentLog.info({ txHash }, "Bifrost strategy executed successfully");

      return JSON.stringify({
        success: true,
        data: {
          action: "BIFROST_STRATEGY",
          txHash,
          strategyType: BIFROST_STRATEGY_LABELS[strategyType],
          amount: amount.toString(),
          minOutput: minOutput.toString(),
          currencyIn,
          currencyOut,
          poolId,
          reasoning: bifrost.reasoning,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      agentLog.error({ err: error }, "ExecuteBifrostStrategyTool failed");
      return JSON.stringify({ success: false, error: message });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SwapQuoteTool — DEX aggregator read-only quote
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LangChain tool that queries the SwapQuoter for the best swap quote
 * across all registered pool adapters. Read-only — does not execute any swap.
 *
 * Input JSON:
 *   { pool: "0x…", tokenIn: "0x…", tokenOut: "0x…", amountIn: "1000000…" }
 */
export class SwapQuoteTool extends Tool {
  name = "swap_quote";
  description =
    "Get the best swap quote from the DEX aggregator. Input MUST be a JSON " +
    "object with: pool (address), tokenIn (address), tokenOut (address), " +
    "amountIn (wei string). Returns the best quote across all pool adapters " +
    "including source pool type, estimated output amount, and fee. " +
    "Also returns all available quotes for comparison.";

  private readonly swapRouterService: SwapRouterService;

  constructor(swapRouterService: SwapRouterService) {
    super();
    this.swapRouterService = swapRouterService;
  }

  /** @internal LangChain entry-point. */
  protected async _call(input: string): Promise<string> {
    try {
      // ── 1. Parse input ─────────────────────────────────────────────
      let params: {
        pool: string;
        tokenIn: string;
        tokenOut: string;
        amountIn: string;
      };
      try {
        params = JSON.parse(input);
      } catch {
        return JSON.stringify({
          success: false,
          error:
            "Invalid JSON input. Expected { pool, tokenIn, tokenOut, amountIn }.",
        });
      }

      if (
        !params.pool ||
        !params.tokenIn ||
        !params.tokenOut ||
        !params.amountIn
      ) {
        return JSON.stringify({
          success: false,
          error: "Missing required fields: pool, tokenIn, tokenOut, amountIn.",
        });
      }

      // ── 2. Check deployment ────────────────────────────────────────
      if (!this.swapRouterService.isQuoterDeployed) {
        return JSON.stringify({
          success: false,
          error: "SwapQuoter is not yet deployed. Swap quoting is unavailable.",
        });
      }

      const pool = params.pool as `0x${string}`;
      const tokenIn = params.tokenIn as `0x${string}`;
      const tokenOut = params.tokenOut as `0x${string}`;
      const amountIn = BigInt(params.amountIn);

      // ── 3. Fetch best quote + all quotes ───────────────────────────
      const [bestQuote, allQuotes] = await Promise.all([
        this.swapRouterService.getBestQuote(pool, tokenIn, tokenOut, amountIn),
        this.swapRouterService.getAllQuotes(pool, tokenIn, tokenOut, amountIn),
      ]);

      if (!bestQuote) {
        return JSON.stringify({
          success: true,
          data: {
            bestQuote: null,
            allQuotes: [],
            message: "No quotes available for this token pair.",
          },
        });
      }

      swapLog.info(
        {
          source: POOL_TYPE_LABELS[bestQuote.source] ?? bestQuote.source,
          amountOut: bestQuote.amountOut.toString(),
          quotesCount: allQuotes.length,
        },
        "SwapQuoteTool returned best quote",
      );

      return JSON.stringify({
        success: true,
        data: {
          bestQuote: {
            source:
              POOL_TYPE_LABELS[bestQuote.source] ?? String(bestQuote.source),
            pool: bestQuote.pool,
            feeBps: bestQuote.feeBps.toString(),
            amountIn: bestQuote.amountIn.toString(),
            amountOut: bestQuote.amountOut.toString(),
          },
          allQuotes: allQuotes.map((q) => ({
            source: POOL_TYPE_LABELS[q.source] ?? String(q.source),
            pool: q.pool,
            feeBps: q.feeBps.toString(),
            amountIn: q.amountIn.toString(),
            amountOut: q.amountOut.toString(),
          })),
          adapters: this.swapRouterService.getPoolAdapters().map((a) => ({
            poolType: a.name,
            address: a.address,
            deployed: a.deployed,
          })),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      swapLog.error({ err: error }, "SwapQuoteTool failed");
      return JSON.stringify({ success: false, error: message });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ExecuteLocalSwapTool — On-hub swap via vault + SwapRouter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LangChain tool that executes an on-hub swap routed through the SwapRouter
 * via the vault's `executeLocalSwap()` function.
 *
 * Flow:
 *   1. Validate LOCAL_SWAP decision via Zod
 *   2. Build best swap params via SwapQuoter
 *   3. Build & sign a StrategyIntent with targetParachain=0 (hub)
 *   4. Submit vault.executeLocalSwap(SwapParams, StrategyIntent, sig)
 */
export class ExecuteLocalSwapTool extends Tool {
  name = "execute_local_swap";
  description =
    "Execute an on-hub DEX swap via the vault's SwapRouter integration. " +
    'Input MUST be a JSON object with: action ("LOCAL_SWAP"), ' +
    "poolType (0=HydrationOmnipool, 1=AssetHubPair, 2=BifrostDEX, 3=Custom), " +
    "pool (address), tokenIn (address), tokenOut (address), " +
    "amount (wei string), maxSlippageBps (1-200), reasoning (string). " +
    "Queries SwapQuoter for the best route, signs a StrategyIntent via EIP-712, " +
    "and executes the swap on-chain.";

  private readonly swapRouterService: SwapRouterService;
  private readonly intentService: IntentService;

  constructor(
    swapRouterService: SwapRouterService,
    intentService: IntentService,
  ) {
    super();
    this.swapRouterService = swapRouterService;
    this.intentService = intentService;
  }

  /** @internal LangChain entry-point. */
  protected async _call(input: string): Promise<string> {
    try {
      // ── 1. Parse raw LLM output ──────────────────────────────────────
      let rawDecision: unknown;
      try {
        rawDecision = JSON.parse(input);
      } catch {
        return JSON.stringify({
          success: false,
          error: "Invalid JSON input. Expected a LOCAL_SWAP decision object.",
        });
      }

      // ── 2. Zod-validate the AI decision ──────────────────────────────
      const parseResult = aiDecisionSchema.safeParse(rawDecision);
      if (!parseResult.success) {
        swapLog.warn(
          { errors: parseResult.error.flatten() },
          "LOCAL_SWAP decision failed Zod validation",
        );
        return JSON.stringify({
          success: false,
          error: `Validation failed: ${parseResult.error.message}`,
        });
      }

      const decision = parseResult.data;
      if (decision.action !== "LOCAL_SWAP") {
        return JSON.stringify({
          success: false,
          error: `ExecuteLocalSwapTool only handles LOCAL_SWAP, got ${decision.action}`,
        });
      }

      const swap = decision as LocalSwapDecision;

      // ── 3. Check deployment ──────────────────────────────────────────
      if (!this.swapRouterService.isRouterDeployed) {
        return JSON.stringify({
          success: false,
          error: "SwapRouter is not yet deployed. Local swaps unavailable.",
        });
      }

      if (!this.swapRouterService.isQuoterDeployed) {
        return JSON.stringify({
          success: false,
          error: "SwapQuoter is not yet deployed. Cannot build swap params.",
        });
      }

      // ── 4. Enforce agent-side guardrails ──────────────────────────────
      const amount = BigInt(swap.amount);
      if (amount > MAX_STRATEGY_AMOUNT) {
        return JSON.stringify({
          success: false,
          error: `Amount ${amount} exceeds MAX_STRATEGY_AMOUNT ${MAX_STRATEGY_AMOUNT}`,
        });
      }

      // ── 5. Build swap params via SwapQuoter ───────────────────────────
      const deadline = this.intentService.computeDeadline();
      const slippageBps = BigInt(swap.maxSlippageBps);

      const swapParams = await this.swapRouterService.buildBestSwap(
        swap.pool as `0x${string}`,
        swap.tokenIn as `0x${string}`,
        swap.tokenOut as `0x${string}`,
        amount,
        slippageBps,
        VAULT_ADDRESS,
        deadline,
      );

      if (!swapParams) {
        return JSON.stringify({
          success: false,
          error: "SwapQuoter.buildBestSwap returned no result for this pair.",
        });
      }

      // ── 6. Fetch nonce + build StrategyIntent ─────────────────────────
      const nonce = await this.intentService.fetchIntentNonce();
      const minReturn = (amount * (10_000n - slippageBps)) / 10_000n;

      const strategyIntent: StrategyIntent = {
        asset: ASSET_ADDRESS,
        amount,
        minReturn,
        maxSlippageBps: slippageBps,
        deadline,
        nonce,
        xcmCall: PLACEHOLDER_XCM_CALL,
        targetParachain: 0, // hub — local swap
        targetProtocol: swap.pool as `0x${string}`,
      };

      swapLog.info(
        {
          poolType: POOL_TYPE_LABELS[swap.poolType] ?? swap.poolType,
          tokenIn: swap.tokenIn,
          tokenOut: swap.tokenOut,
          amount: amount.toString(),
          minAmountOut: swapParams.minAmountOut.toString(),
          nonce: nonce.toString(),
          reasoning: swap.reasoning,
        },
        "Executing local swap",
      );

      // ── 7. Sign StrategyIntent via EIP-712 ────────────────────────────
      const signature =
        await this.intentService.signStrategyIntent(strategyIntent);

      // ── 8. Submit vault.executeLocalSwap() ────────────────────────────
      const txHash = await this.intentService.executeLocalSwap(
        swapParams,
        strategyIntent,
        signature,
      );

      swapLog.info({ txHash }, "Local swap executed successfully");

      return JSON.stringify({
        success: true,
        data: {
          action: "LOCAL_SWAP",
          txHash,
          poolType: POOL_TYPE_LABELS[swap.poolType] ?? String(swap.poolType),
          tokenIn: swap.tokenIn,
          tokenOut: swap.tokenOut,
          amountIn: amount.toString(),
          minAmountOut: swapParams.minAmountOut.toString(),
          nonce: nonce.toString(),
          reasoning: swap.reasoning,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      swapLog.error({ err: error }, "ExecuteLocalSwapTool failed");
      return JSON.stringify({ success: false, error: message });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ExecuteIntentTool — Universal cross-chain intent execution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LangChain tool that builds, signs, and submits a UniversalIntent to the
 * vault's `executeIntent()` function for cross-chain operations.
 *
 * Flow:
 *   1. Validate UNIVERSAL_INTENT decision via Zod
 *   2. Fetch intent nonce
 *   3. Build UniversalIntent struct
 *   4. Sign via EIP-712
 *   5. Submit vault.executeIntent(intent, signature)
 */
export class ExecuteIntentTool extends Tool {
  name = "execute_intent";
  description =
    "Execute a cross-chain intent via the vault's universal intent system. " +
    'Input MUST be a JSON object with: action ("UNIVERSAL_INTENT"), ' +
    "tokenIn (address), tokenOut (address), amount (wei string), " +
    "maxSlippageBps (1-200), destType (0=Native/XCM, 1=Hyper/Hyperbridge), " +
    "targetParachain (for XCM, optional), targetChainId (for Hyperbridge, optional), " +
    "inAssetId (optional, default 0), outAssetId (optional, default 0), " +
    "reasoning (string). Signs a UniversalIntent via EIP-712 and executes on-chain.";

  private readonly intentService: IntentService;

  constructor(intentService: IntentService) {
    super();
    this.intentService = intentService;
  }

  /** @internal LangChain entry-point. */
  protected async _call(input: string): Promise<string> {
    try {
      // ── 1. Parse raw LLM output ──────────────────────────────────────
      let rawDecision: unknown;
      try {
        rawDecision = JSON.parse(input);
      } catch {
        return JSON.stringify({
          success: false,
          error:
            "Invalid JSON input. Expected a UNIVERSAL_INTENT decision object.",
        });
      }

      // ── 2. Zod-validate the AI decision ──────────────────────────────
      const parseResult = aiDecisionSchema.safeParse(rawDecision);
      if (!parseResult.success) {
        intentLog.warn(
          { errors: parseResult.error.flatten() },
          "UNIVERSAL_INTENT decision failed Zod validation",
        );
        return JSON.stringify({
          success: false,
          error: `Validation failed: ${parseResult.error.message}`,
        });
      }

      const decision = parseResult.data;
      if (decision.action !== "UNIVERSAL_INTENT") {
        return JSON.stringify({
          success: false,
          error: `ExecuteIntentTool only handles UNIVERSAL_INTENT, got ${decision.action}`,
        });
      }

      const intentDecision = decision as UniversalIntentDecision;

      // ── 3. Enforce agent-side guardrails ──────────────────────────────
      const amount = BigInt(intentDecision.amount);
      if (amount > MAX_STRATEGY_AMOUNT) {
        return JSON.stringify({
          success: false,
          error: `Amount ${amount} exceeds MAX_STRATEGY_AMOUNT ${MAX_STRATEGY_AMOUNT}`,
        });
      }

      // ── 4. Fetch nonce + compute slippage ─────────────────────────────
      const nonce = await this.intentService.fetchIntentNonce();
      const deadline = this.intentService.computeDeadline();
      const slippageBps = BigInt(intentDecision.maxSlippageBps);
      const minOut = (amount * (10_000n - slippageBps)) / 10_000n;

      // ── 5. Build UniversalIntent struct ───────────────────────────────
      const intent = {
        inAsset: {
          token: intentDecision.tokenIn as `0x${string}`,
          assetId: BigInt(intentDecision.inAssetId ?? "0"),
        },
        outAsset: {
          token: intentDecision.tokenOut as `0x${string}`,
          assetId: BigInt(intentDecision.outAssetId ?? "0"),
        },
        amount,
        minOut,
        dest: {
          destType: intentDecision.destType,
          paraId: intentDecision.targetParachain ?? 0,
          chainId: intentDecision.targetChainId ?? 0,
        },
        calldata_: "0x" as `0x${string}`, // placeholder — populated by on-chain router
        nonce,
        deadline,
      };

      intentLog.info(
        {
          tokenIn: intentDecision.tokenIn,
          tokenOut: intentDecision.tokenOut,
          amount: amount.toString(),
          destType:
            intentDecision.destType === DestType.Native ? "XCM" : "Hyperbridge",
          paraId: intent.dest.paraId,
          chainId: intent.dest.chainId,
          nonce: nonce.toString(),
          reasoning: intentDecision.reasoning,
        },
        "Building universal intent",
      );

      // ── 6. Sign via EIP-712 ───────────────────────────────────────────
      const signature = await this.intentService.signUniversalIntent(intent);

      // ── 7. Submit vault.executeIntent() ───────────────────────────────
      const txHash = await this.intentService.executeIntent(intent, signature);

      intentLog.info({ txHash }, "Universal intent executed successfully");

      return JSON.stringify({
        success: true,
        data: {
          action: "UNIVERSAL_INTENT",
          txHash,
          tokenIn: intentDecision.tokenIn,
          tokenOut: intentDecision.tokenOut,
          amount: amount.toString(),
          minOut: minOut.toString(),
          destType:
            intentDecision.destType === DestType.Native ? "XCM" : "Hyperbridge",
          targetParachain: intent.dest.paraId,
          targetChainId: intent.dest.chainId,
          nonce: nonce.toString(),
          reasoning: intentDecision.reasoning,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      intentLog.error({ err: error }, "ExecuteIntentTool failed");
      return JSON.stringify({ success: false, error: message });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  DepositTool — ERC-4626 deposit into the vault
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LangChain Tool that executes an ERC-4626 deposit into the ObidotVault.
 *
 * When the model is bound via bindTools(), LangChain serialises Tool args as
 * { input: "<json string>" } (because Tool exposes a single-string schema).
 * This _call implementation handles both the wrapped and unwrapped forms so
 * the tool works correctly whether invoked from the autonomous loop or from
 * the Telegram bot's bindTools() path.
 */
export class DepositTool extends Tool {
  name = "execute_deposit";
  description =
    "Deposit ERC-20 assets into the Obidot ERC-4626 vault. " +
    'Input MUST be a JSON object with fields: "token" (ERC-20 address), ' +
    '"amount" (base units as string, e.g. "1000000000000000000" for 1 token with 18 decimals), ' +
    '"receiver" (address to receive vault shares). ' +
    "Automatically approves vault allowance if needed, then calls vault.deposit(). " +
    "Returns txHash on success.";

  private readonly signerService: SignerService;

  constructor(signerService: SignerService) {
    super();
    this.signerService = signerService;
  }

  protected async _call(input: string): Promise<string> {
    try {
      // ── Parse input ────────────────────────────────────────────────────
      // bindTools() wraps Tool args as { input: "<json>" }; handle both forms.
      let raw: Record<string, unknown>;
      try {
        raw = JSON.parse(input) as Record<string, unknown>;
      } catch {
        return JSON.stringify({ success: false, error: "Invalid JSON input to execute_deposit." });
      }

      // Unwrap LangChain's { input: "..." } wrapper if present
      const params = (typeof raw.input === "string"
        ? JSON.parse(raw.input)
        : raw) as Record<string, unknown>;

      const token = params.token as string | undefined;
      const amount = params.amount as string | undefined;
      const receiver = params.receiver as string | undefined;

      if (!token || !amount || !receiver) {
        return JSON.stringify({
          success: false,
          error: `Missing fields. Received keys: ${Object.keys(params).join(", ")}. Expected: token, amount, receiver.`,
        });
      }

      agentLog.info(
        { token, amount, receiver },
        "DepositTool: executing deposit",
      );

      const txHash = await this.signerService.executeDeposit(
        token as `0x${string}`,
        BigInt(amount),
        receiver as `0x${string}`,
      );

      return JSON.stringify({
        success: true,
        data: { action: "DEPOSIT", txHash, token, amount, receiver },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      agentLog.error({ err: error }, "DepositTool failed");
      return JSON.stringify({ success: false, error: message });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  FindRoutesTool — UV2 route discovery (read-only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LangChain tool that discovers all available swap routes between two tokens
 * using the on-chain UV2 pair reserves. Does NOT execute any swap.
 *
 * Use this FIRST before swapping to see available routes and expected output.
 */
export class FindRoutesTool extends Tool {
  name = "find_swap_routes";
  description =
    "Discover all available swap routes between two tokens on Polkadot Hub. " +
    "Input MUST be a JSON object with: tokenIn (symbol or address), " +
    "tokenOut (symbol or address), amountIn (wei string). " +
    "Supported symbols: tDOT, tUSDC, tETH, TKA, TKB. " +
    "Returns sorted routes (best amountOut first), each with pool addresses, " +
    "hops, feeBps, and estimated amountOut. Use this before execute_direct_swap.";

  private readonly swapRouterService: SwapRouterService;

  constructor(swapRouterService: SwapRouterService) {
    super();
    this.swapRouterService = swapRouterService;
  }

  protected async _call(input: string): Promise<string> {
    try {
      let params: { tokenIn: string; tokenOut: string; amountIn: string };
      try {
        params = JSON.parse(input);
      } catch {
        return JSON.stringify({
          success: false,
          error: "Invalid JSON. Expected { tokenIn, tokenOut, amountIn }.",
        });
      }

      const { tokenIn, tokenOut, amountIn } = params;
      if (!tokenIn || !tokenOut || !amountIn) {
        return JSON.stringify({
          success: false,
          error: "Missing fields: tokenIn, tokenOut, amountIn.",
        });
      }

      // Resolve symbol → address
      const inAddr =
        (TOKEN_ADDRESSES as Record<string, string>)[tokenIn] ?? tokenIn;
      const outAddr =
        (TOKEN_ADDRESSES as Record<string, string>)[tokenOut] ?? tokenOut;

      const routes = await this.swapRouterService.findRoutes(
        inAddr,
        outAddr,
        BigInt(amountIn),
      );

      const liveRoutes = routes.filter((r) => r.status === "live" && r.amountOut !== "0");

      swapLog.info(
        { tokenIn, tokenOut, liveCount: liveRoutes.length },
        "FindRoutesTool complete",
      );

      return JSON.stringify({
        success: true,
        data: {
          tokenIn,
          tokenOut,
          amountIn,
          liveRoutes: liveRoutes.map((r) => ({
            id: r.id,
            amountOut: r.amountOut,
            minAmountOut: r.minAmountOut,
            totalFeeBps: r.totalFeeBps,
            totalPriceImpactBps: r.totalPriceImpactBps,
            hops: r.hops.map((h) => ({
              pool: h.pool,
              poolLabel: h.poolLabel,
              tokenIn: h.tokenIn,
              tokenInSymbol: h.tokenInSymbol,
              tokenOut: h.tokenOut,
              tokenOutSymbol: h.tokenOutSymbol,
              amountIn: h.amountIn,
              amountOut: h.amountOut,
              feeBps: h.feeBps,
            })),
          })),
          totalRoutesFound: routes.length,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      swapLog.error({ err: error }, "FindRoutesTool failed");
      return JSON.stringify({ success: false, error: message });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  DirectSwapTool — Execute a UV2 swap from the agent wallet
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LangChain tool that executes a direct UniswapV2 swap from the agent's wallet.
 *
 * Flow:
 *   1. Resolve token symbols to addresses
 *   2. Call findRoutes() to get the best live UV2 path
 *   3. Approve tokenIn → SwapRouter if needed
 *   4. Execute swap (single-hop: swap(), multi-hop: swapMultiHop())
 *
 * This swaps from the AGENT'S wallet, not the vault.
 * Use find_swap_routes first to confirm the route exists.
 */
export class DirectSwapTool extends Tool {
  name = "execute_direct_swap";
  description =
    "Execute a direct UniswapV2 swap on Polkadot Hub from the agent wallet. " +
    "Input MUST be a JSON object with: tokenIn (symbol or address), " +
    "tokenOut (symbol or address), amountIn (wei string), " +
    "maxSlippageBps (number, e.g. 50 for 0.5%), reasoning (string). " +
    "Supported symbols: tDOT, tUSDC, tETH, TKA, TKB. " +
    "Auto-selects the best live UV2 route. Approves and swaps in one call.";

  private readonly swapRouterService: SwapRouterService;
  private readonly signerService: SignerService;

  constructor(signerService: SignerService, swapRouterService: SwapRouterService) {
    super();
    this.signerService = signerService;
    this.swapRouterService = swapRouterService;
  }

  protected async _call(input: string): Promise<string> {
    try {
      let params: {
        tokenIn: string;
        tokenOut: string;
        amountIn: string;
        maxSlippageBps: number;
        reasoning?: string;
      };
      try {
        params = JSON.parse(input);
      } catch {
        return JSON.stringify({
          success: false,
          error: "Invalid JSON. Expected { tokenIn, tokenOut, amountIn, maxSlippageBps }.",
        });
      }

      const { tokenIn, tokenOut, amountIn, maxSlippageBps, reasoning } = params;
      if (!tokenIn || !tokenOut || !amountIn || maxSlippageBps === undefined) {
        return JSON.stringify({
          success: false,
          error: "Missing fields: tokenIn, tokenOut, amountIn, maxSlippageBps.",
        });
      }

      if (!this.swapRouterService.isRouterDeployed) {
        return JSON.stringify({
          success: false,
          error: "SwapRouter not deployed — direct swaps unavailable.",
        });
      }

      // Resolve symbol → address
      const inAddr =
        (TOKEN_ADDRESSES as Record<string, string>)[tokenIn] ?? tokenIn;
      const outAddr =
        (TOKEN_ADDRESSES as Record<string, string>)[tokenOut] ?? tokenOut;

      const amountInBig = BigInt(amountIn);

      // Find best live route
      const routes = await this.swapRouterService.findRoutes(
        inAddr,
        outAddr,
        amountInBig,
      );
      const best = routes.find((r) => r.status === "live" && r.amountOut !== "0");

      if (!best) {
        return JSON.stringify({
          success: false,
          error: `No live UV2 route found for ${tokenIn} → ${tokenOut}. Available pairs: tDOT/TKB, tDOT/tUSDC, tDOT/tETH, tUSDC/tETH, TKB/TKA (multi-hop supported).`,
        });
      }

      const slippageBps = BigInt(maxSlippageBps);
      const amountOut = BigInt(best.amountOut);
      const minAmountOut = (amountOut * (10_000n - slippageBps)) / 10_000n;

      swapLog.info(
        {
          tokenIn,
          tokenOut,
          amountIn: amountInBig.toString(),
          amountOut: amountOut.toString(),
          minAmountOut: minAmountOut.toString(),
          hops: best.hops.length,
          route: best.id,
          reasoning,
        },
        "DirectSwapTool: executing swap",
      );

      const txHash = await this.signerService.executeDirectSwap(
        best.hops.map((h) => ({
          pool: h.pool,
          tokenIn: h.tokenIn,
          tokenOut: h.tokenOut,
          feeBps: h.feeBps,
        })),
        amountInBig,
        minAmountOut,
      );

      swapLog.info({ txHash }, "DirectSwapTool: swap executed");

      return JSON.stringify({
        success: true,
        data: {
          txHash,
          route: best.id,
          tokenIn,
          tokenOut,
          amountIn: amountInBig.toString(),
          estimatedAmountOut: amountOut.toString(),
          minAmountOut: minAmountOut.toString(),
          hops: best.hops.length,
          feeBps: best.totalFeeBps,
          reasoning,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      swapLog.error({ err: error }, "DirectSwapTool failed");
      return JSON.stringify({ success: false, error: message });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Tool Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create all custom Obidot tools to be registered with ObiKit via `addTool()`.
 *
 * @param signerService      - The initialized SignerService for on-chain interaction.
 * @param yieldService       - The initialized YieldService for market data.
 * @param crossChainService  - The initialized CrossChainService for multi-chain state.
 * @param swapRouterService  - The initialized SwapRouterService for DEX aggregator reads.
 * @param intentService      - The initialized IntentService for intent signing/execution.
 * @returns Array of LangChain Tool instances.
 */
export function createObidotTools(
  signerService: SignerService,
  yieldService: YieldService,
  crossChainService: CrossChainService,
  swapRouterService?: SwapRouterService,
  intentService?: IntentService,
): Tool[] {
  const tools: Tool[] = [
    // ── Perception tools ───────────────────────────────────────────────
    new FetchYieldsTool(yieldService),
    new FetchBifrostYieldsTool(yieldService),
    new FetchVaultStateTool(signerService),
    new FetchCrossChainStateTool(signerService, crossChainService),
    // ── ERC-4626 deposit ───────────────────────────────────────────────
    new DepositTool(signerService),
    // ── Execution tools (legacy) ───────────────────────────────────────
    new ExecuteStrategyTool(signerService),
    new ExecuteBifrostStrategyTool(signerService),
  ];

  // ── DEX aggregator tools (conditional on service availability) ─────
  if (swapRouterService) {
    tools.push(new FindRoutesTool(swapRouterService));
    tools.push(new DirectSwapTool(signerService, swapRouterService));
    tools.push(new SwapQuoteTool(swapRouterService));

    if (intentService) {
      tools.push(new ExecuteLocalSwapTool(swapRouterService, intentService));
    }
  }

  // ── Universal intent tool (conditional on service availability) ─────
  if (intentService) {
    tools.push(new ExecuteIntentTool(intentService));
  }

  return tools;
}
