import { Tool } from "@langchain/core/tools";

import { SignerService } from "../services/signer.service.js";
import { YieldService } from "../services/yield.service.js";
import { CrossChainService } from "../services/crosschain.service.js";
import {
  ASSET_ADDRESS,
  INTENT_DEADLINE_SECONDS,
  MAX_STRATEGY_AMOUNT,
  PLACEHOLDER_XCM_CALL,
} from "../config/constants.js";
import {
  aiDecisionSchema,
  BifrostStrategyType,
  BifrostCurrencyId,
  BIFROST_STRATEGY_LABELS,
  type StrategyIntent,
  type ReallocateDecision,
} from "../types/index.js";
import { agentLog } from "../utils/logger.js";

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
//  Tool Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create all custom Obidot tools to be registered with ObiKit via `addTool()`.
 *
 * @param signerService     - The initialized SignerService for on-chain interaction.
 * @param yieldService      - The initialized YieldService for market data.
 * @param crossChainService - The initialized CrossChainService for multi-chain state.
 * @returns Array of LangChain Tool instances.
 */
export function createObidotTools(
  signerService: SignerService,
  yieldService: YieldService,
  crossChainService: CrossChainService,
): Tool[] {
  return [
    new FetchYieldsTool(yieldService),
    new FetchBifrostYieldsTool(yieldService),
    new FetchVaultStateTool(signerService),
    new FetchCrossChainStateTool(signerService, crossChainService),
    new ExecuteStrategyTool(signerService),
    new ExecuteBifrostStrategyTool(signerService),
  ];
}
