import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { ObiKit, type ChainConfig, type VaultConfig } from "@obidot-kit/sdk";

import { env } from "../config/env.js";
import { CHAIN_ID, RPC_URL, VAULT_ADDRESS } from "../config/constants.js";
import { SignerService } from "../services/signer.service.js";
import { YieldService } from "../services/yield.service.js";
import { CrossChainService } from "../services/crosschain.service.js";
import { createObidotTools } from "./tools.js";
import { SYSTEM_PROMPT } from "./systemPrompt.js";
import { aiDecisionSchema } from "../types/index.js";
import type { MarketSnapshot } from "../types/index.js";
import { loopLog, agentLog } from "../utils/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Autonomous Loop — The "Brain"
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Orchestrates the Obidot Autonomous CFO's continuous decision cycle.
 *
 * Architecture:
 *   1. Initialize ObiKit SDK + inject custom tools via `addTool()`
 *   2. Initialize LLM (GPT-4o) with tool bindings
 *   3. Run polling loop:  Perception → Reasoning → Execution → Sleep
 *
 * The loop is fault-tolerant: any error in a cycle is caught, logged,
 * and the loop continues. The daemon never crashes from a single failure.
 */
export class AutonomousLoop {
  private readonly signerService: SignerService;
  private readonly yieldService: YieldService;
  private readonly crossChainService: CrossChainService;
  private readonly llm: ChatOpenAI;
  private readonly kit: ObiKit;
  private readonly tools: StructuredToolInterface[];
  private running = false;
  private cycleCount = 0;

  /**
   * Pending strategies awaiting outcome verification.
   * Maps strategy ID (string) to execution metadata.
   */
  private readonly pendingOutcomes = new Map<
    string,
    {
      strategyId: bigint;
      amount: bigint;
      targetParachain: number;
      targetProtocol: string;
      executedAt: number;
      retries: number;
    }
  >();

  /** Maximum time to wait for XCM delivery confirmation (ms). */
  private static readonly OUTCOME_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
  /** Maximum retry attempts for outcome verification. */
  private static readonly MAX_OUTCOME_RETRIES = 3;

  constructor() {
    // ── Services ──────────────────────────────────────────────────────
    this.signerService = new SignerService();
    this.yieldService = new YieldService();
    this.crossChainService = new CrossChainService();

    // ── ObiKit SDK ───────────────────────────────────────────────────
    const chainConfig: ChainConfig = {
      endpoint: RPC_URL,
      name: "Polkadot Hub Testnet (Paseo)",
      chainId: String(CHAIN_ID),
    };

    const vaultConfig: VaultConfig = {
      id: "obidot-vault",
      name: "Obidot Cross-Chain Vault",
      address: VAULT_ADDRESS,
      chain: chainConfig,
      asset: "DOT",
      decimals: 18,
    };

    this.kit = new ObiKit({ chainConfig });
    this.kit.registerVault(vaultConfig);

    // ── Inject custom Obidot tools into ObiKit ───────────────────────
    const customTools = createObidotTools(
      this.signerService,
      this.yieldService,
      this.crossChainService,
    );
    for (const tool of customTools) {
      this.kit.addTool(tool);
    }

    // Combined tool set: ObiKit built-ins + our custom tools
    this.tools = this.kit.getTools() as StructuredToolInterface[];

    loopLog.info(
      { toolCount: this.tools.length, tools: this.tools.map((t) => t.name) },
      "Tools registered with ObiKit",
    );

    // ── LLM ──────────────────────────────────────────────────────────
    this.llm = new ChatOpenAI({
      model: "gpt-4o",
      temperature: 0,
      apiKey: env.OPENAI_API_KEY,
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Public API
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Returns the combined tool set (ObiKit built-ins + custom Obidot tools).
   * Used by the Telegram bot and API server to share the same tools.
   */
  getTools(): StructuredToolInterface[] {
    return this.tools;
  }

  /**
   * Returns the service instances for use by the API server.
   */
  getServices(): {
    signerService: SignerService;
    yieldService: YieldService;
    crossChainService: CrossChainService;
  } {
    return {
      signerService: this.signerService,
      yieldService: this.yieldService,
      crossChainService: this.crossChainService,
    };
  }

  /**
   * Start the autonomous decision loop.
   * Runs indefinitely until `stop()` is called.
   */
  async start(): Promise<void> {
    this.running = true;
    const intervalMs = env.LOOP_INTERVAL_MINUTES * 60 * 1000;

    loopLog.info(
      {
        intervalMinutes: env.LOOP_INTERVAL_MINUTES,
        strategist: this.signerService.strategistAddress,
        vault: VAULT_ADDRESS,
      },
      "Autonomous CFO loop starting",
    );

    while (this.running) {
      this.cycleCount++;
      const cycleStart = Date.now();

      loopLog.info({ cycle: this.cycleCount }, "──── Cycle start ────");

      try {
        await this.runCycle();
      } catch (error) {
        loopLog.error(
          { cycle: this.cycleCount, err: error },
          "Cycle failed — recovering",
        );
      }

      const elapsed = Date.now() - cycleStart;
      const sleepMs = Math.max(0, intervalMs - elapsed);

      loopLog.info(
        {
          cycle: this.cycleCount,
          elapsedMs: elapsed,
          sleepMs,
        },
        "──── Cycle complete ────",
      );

      if (this.running && sleepMs > 0) {
        await this.sleep(sleepMs);
      }
    }

    loopLog.info("Autonomous CFO loop stopped");
  }

  /** Signal the loop to stop after the current cycle completes. */
  stop(): void {
    this.running = false;
    loopLog.info("Stop signal received");
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Cycle Phases
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Execute a single autonomous decision cycle:
   *   Phase 1 — Perception (fetch market + vault data)
   *   Phase 2 — Reasoning (LLM analysis + decision)
   *   Phase 3 — Execution (validate + sign + submit)
   */
  private async runCycle(): Promise<void> {
    // ── Phase 1: Perception ──────────────────────────────────────────
    // First, verify any pending outcomes from previous cycles
    await this.verifyPendingOutcomes();

    loopLog.info("Phase 1: Perception — fetching market data & vault state");

    const [yields, bifrostYields, vaultState] = await Promise.all([
      this.yieldService.fetchYields(),
      this.yieldService.fetchBifrostYields(),
      this.signerService.fetchVaultState(),
    ]);

    // Check health: skip cycle if vault is paused or in emergency mode
    if (vaultState.paused) {
      loopLog.warn("Vault is PAUSED — skipping cycle");
      return;
    }
    if (vaultState.emergencyMode) {
      loopLog.warn("Vault is in EMERGENCY MODE — skipping cycle");
      return;
    }
    if (vaultState.idleBalance === 0n) {
      loopLog.info("No idle balance available — skipping cycle");
      return;
    }

    // Optionally fetch cross-chain state
    let crossChainState;
    if (this.crossChainService.hasSatellites) {
      try {
        crossChainState =
          await this.crossChainService.fetchCrossChainState(vaultState);
        loopLog.info(
          {
            globalTotalAssets: crossChainState.globalTotalAssets.toString(),
            satelliteCount: crossChainState.satelliteAssets.length,
          },
          "Cross-chain state fetched",
        );
      } catch (error) {
        loopLog.warn(
          { err: error },
          "Failed to fetch cross-chain state — proceeding with hub-only data",
        );
      }
    }

    // Build market snapshot for the LLM
    const snapshot: MarketSnapshot = {
      yields,
      bifrostYields,
      vaultState,
      crossChainState,
      timestamp: new Date().toISOString(),
    };

    // ── Phase 2: Reasoning ───────────────────────────────────────────
    loopLog.info("Phase 2: Reasoning — invoking LLM for decision");

    const userMessage = this.buildUserMessage(snapshot);
    const decision = await this.invokeLlm(userMessage);

    if (!decision) {
      loopLog.warn("LLM returned no actionable decision");
      return;
    }

    // ── Phase 3: Execution ───────────────────────────────────────────
    if (decision.action === "NO_ACTION") {
      loopLog.info(
        { reasoning: decision.reasoning },
        "Phase 3: AI decided NO_ACTION",
      );
      return;
    }

    loopLog.info(
      {
        action: decision.action,
        ...(decision.action === "REALLOCATE"
          ? {
              targetParachain: decision.targetParachain,
              amount: decision.amount,
              maxSlippageBps: decision.maxSlippageBps,
            }
          : decision.action === "BIFROST_STRATEGY"
            ? {
                strategyType: decision.strategyType,
                amount: decision.amount,
                currencyIn: decision.currencyIn,
              }
            : decision.action === "CROSS_CHAIN_REBALANCE"
              ? {
                  targetChain: decision.targetChain,
                  direction: decision.direction,
                  amount: decision.amount,
                }
              : {}),
        reasoning: decision.reasoning,
      },
      `Phase 3: Execution — processing ${decision.action} decision`,
    );

    // Select the appropriate execution tool
    let toolName: string;
    switch (decision.action) {
      case "REALLOCATE":
        toolName = "execute_strategy";
        break;
      case "BIFROST_STRATEGY":
        toolName = "execute_bifrost_strategy";
        break;
      case "CROSS_CHAIN_REBALANCE":
        // Cross-chain rebalance is currently logged but not auto-executed
        // (requires admin-level transactions via CrossChainRouter)
        loopLog.info(
          {
            targetChain: decision.targetChain,
            direction: decision.direction,
            amount: decision.amount,
          },
          "CROSS_CHAIN_REBALANCE detected — logging for manual execution",
        );
        return;
      default: {
        const _exhaustive: never = decision;
        loopLog.error(
          { action: (_exhaustive as { action: string }).action },
          "Unknown action type",
        );
        return;
      }
    }

    const executeTool = this.tools.find((t) => t.name === toolName);
    if (!executeTool) {
      loopLog.error({ toolName }, "Execution tool not found in toolkit");
      return;
    }

    const result = await executeTool.invoke(JSON.stringify(decision));
    const parsed = typeof result === "string" ? JSON.parse(result) : result;

    if (parsed.success) {
      loopLog.info(
        { txHash: parsed.data?.txHash, nonce: parsed.data?.nonce },
        "Strategy executed successfully on-chain",
      );

      // Track the executed strategy for outcome verification
      if (parsed.data?.nonce !== undefined) {
        const strategyId = BigInt(parsed.data.nonce);
        this.pendingOutcomes.set(strategyId.toString(), {
          strategyId,
          amount: BigInt(parsed.data.amount ?? "0"),
          targetParachain: parsed.data.targetParachain ?? 0,
          targetProtocol: parsed.data.targetProtocol ?? "",
          executedAt: Date.now(),
          retries: 0,
        });

        loopLog.info(
          { strategyId: strategyId.toString(), pendingCount: this.pendingOutcomes.size },
          "Strategy queued for outcome verification",
        );
      }
    } else {
      loopLog.error({ error: parsed.error }, "Strategy execution failed");
    }

    // ── Phase 4: Outcome Verification ──────────────────────────────────
    await this.verifyPendingOutcomes();
  }

  // ─────────────────────────────────────────────────────────────────────
  //  LLM Interaction
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Build the user (human) message containing the market snapshot.
   * This gets appended to the system prompt for each LLM invocation.
   */
  private buildUserMessage(snapshot: MarketSnapshot): string {
    const yieldSummary = snapshot.yields
      .map(
        (y) =>
          `  - ${y.name} (parachain ${y.paraId}): APY ${y.apyPercent.toFixed(2)}% | TVL $${(y.tvlUsd / 1_000_000).toFixed(1)}M | Protocol: ${y.protocol}`,
      )
      .join("\n");

    // Bifrost-specific yields breakdown
    let bifrostSection = "";
    if (snapshot.bifrostYields && snapshot.bifrostYields.length > 0) {
      const bifrostSummary = snapshot.bifrostYields
        .map(
          (y) =>
            `  - [${y.category}] ${y.name}: APY ${y.apyPercent.toFixed(2)}% | TVL $${(y.tvlUsd / 1_000_000).toFixed(1)}M | Active: ${y.isActive}${y.poolId !== undefined ? ` | Pool: ${y.poolId}` : ""}`,
        )
        .join("\n");
      bifrostSection = [
        "",
        "Bifrost DeFi Products (Detailed):",
        bifrostSummary,
      ].join("\n");
    }

    // Cross-chain state section
    let crossChainSection = "";
    if (snapshot.crossChainState) {
      const cc = snapshot.crossChainState;
      const satelliteSummary = cc.satelliteAssets
        .map(
          (s) =>
            `  - ${s.chainName} (${s.chainId}): Assets ${s.totalAssets.toString()} wei | Emergency: ${s.emergencyMode} | Last Sync: ${new Date(s.lastSyncTimestamp * 1000).toISOString()}`,
        )
        .join("\n");
      crossChainSection = [
        "",
        "Cross-Chain State:",
        `  Global Total Assets:    ${cc.globalTotalAssets.toString()} wei`,
        `  Total Satellite Assets: ${cc.totalSatelliteAssets.toString()} wei`,
        "  Satellites:",
        satelliteSummary,
      ].join("\n");
    }

    const vs = snapshot.vaultState;

    return [
      "=== MARKET DATA SNAPSHOT ===",
      `Timestamp: ${snapshot.timestamp}`,
      "",
      "Yield Sources:",
      yieldSummary,
      bifrostSection,
      "",
      "Vault State (Hub):",
      `  Total Assets:       ${vs.totalAssets.toString()} wei`,
      `  Remote Assets:      ${vs.totalRemoteAssets.toString()} wei`,
      `  Idle Balance:       ${vs.idleBalance.toString()} wei`,
      `  Paused:             ${vs.paused}`,
      `  Emergency Mode:     ${vs.emergencyMode}`,
      `  Daily Loss:         ${vs.dailyLoss.toString()} / ${vs.maxDailyLoss.toString()} wei`,
      `  Strategist Nonce:   ${vs.nonce.toString()}`,
      `  Strategies Executed: ${vs.strategyCounter.toString()}`,
      crossChainSection,
      "",
      "Based on this data, produce your decision as a JSON object.",
    ].join("\n");
  }

  /**
   * Invoke the LLM with system prompt + market data, parse and validate
   * the response using Zod.
   *
   * Retries up to 2 times if the LLM output fails validation (hallucination
   * recovery). Returns `null` if all attempts fail.
   */
  private async invokeLlm(
    userMessage: string,
  ): Promise<ReturnType<typeof aiDecisionSchema.parse> | null> {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        agentLog.debug({ attempt }, "Invoking LLM");

        const response = await this.llm.invoke([
          new SystemMessage(SYSTEM_PROMPT),
          new HumanMessage(userMessage),
        ]);

        // Extract text content from the response
        const content =
          typeof response.content === "string"
            ? response.content
            : JSON.stringify(response.content);

        agentLog.debug(
          { attempt, responseLength: content.length },
          "LLM response received",
        );

        // Strip markdown code fences if present
        const cleaned = content
          .replace(/^```(?:json)?\s*/m, "")
          .replace(/\s*```\s*$/m, "")
          .trim();

        // Parse JSON
        let rawJson: unknown;
        try {
          rawJson = JSON.parse(cleaned);
        } catch {
          agentLog.warn(
            { attempt, content: cleaned.slice(0, 200) },
            "LLM output is not valid JSON — retrying",
          );
          continue;
        }

        // Zod validate
        const parseResult = aiDecisionSchema.safeParse(rawJson);
        if (!parseResult.success) {
          agentLog.warn(
            {
              attempt,
              errors: parseResult.error.flatten(),
            },
            "LLM output failed Zod validation — retrying",
          );
          continue;
        }

        agentLog.info(
          { attempt, action: parseResult.data.action },
          "LLM decision validated successfully",
        );

        return parseResult.data;
      } catch (error) {
        agentLog.error({ attempt, err: error }, "LLM invocation failed");
      }
    }

    agentLog.error(
      { maxAttempts },
      "All LLM attempts exhausted — returning null",
    );
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Outcome Verification
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Poll pending strategies and report outcomes on-chain.
   *
   * For each pending strategy:
   *   1. Query on-chain StrategyRecord status
   *   2. If still `Sent` (status=1), check for timeout or retry
   *   3. If status has changed (Executed/Failed), report outcome
   *   4. On timeout, report as failed with original amount returned
   *
   * The agent acts as a keeper, calling `reportStrategyOutcome()` to
   * close the accounting loop and trigger PnL tracking.
   */
  private async verifyPendingOutcomes(): Promise<void> {
    if (this.pendingOutcomes.size === 0) return;

    loopLog.info(
      { pendingCount: this.pendingOutcomes.size },
      "Phase 4: Verifying pending strategy outcomes",
    );

    const now = Date.now();
    const toRemove: string[] = [];

    for (const [id, pending] of this.pendingOutcomes) {
      try {
        // Query on-chain strategy status
        const record = await this.signerService.fetchStrategyRecord(
          pending.strategyId,
        );

        const status = record.status;

        if (status === SignerService.StrategyStatus.Sent) {
          // Still pending — check if timed out
          const elapsed = now - pending.executedAt;

          if (elapsed > AutonomousLoop.OUTCOME_TIMEOUT_MS) {
            loopLog.warn(
              {
                strategyId: id,
                elapsedMs: elapsed,
                timeoutMs: AutonomousLoop.OUTCOME_TIMEOUT_MS,
              },
              "Strategy outcome timed out — reporting as failed",
            );

            // Report as failed; return the original amount as best estimate
            // (in reality, the keeper would have XCM delivery data)
            try {
              await this.signerService.reportOutcome(
                pending.strategyId,
                false,
                pending.amount, // return original amount (no loss assumed on timeout)
              );
              loopLog.info(
                { strategyId: id },
                "Timeout outcome reported on-chain",
              );
            } catch (err) {
              loopLog.error(
                { strategyId: id, err },
                "Failed to report timeout outcome — will retry",
              );
              pending.retries++;
              if (pending.retries >= AutonomousLoop.MAX_OUTCOME_RETRIES) {
                loopLog.error(
                  { strategyId: id },
                  "Max retries exceeded for outcome report — dropping",
                );
                toRemove.push(id);
              }
              continue;
            }

            toRemove.push(id);
          } else {
            loopLog.debug(
              {
                strategyId: id,
                elapsedMs: elapsed,
                remainingMs: AutonomousLoop.OUTCOME_TIMEOUT_MS - elapsed,
              },
              "Strategy still pending — will check next cycle",
            );
          }
        } else if (
          status === SignerService.StrategyStatus.Executed ||
          status === SignerService.StrategyStatus.Failed
        ) {
          // Already resolved (possibly by another keeper)
          loopLog.info(
            {
              strategyId: id,
              status: status === SignerService.StrategyStatus.Executed
                ? "Executed"
                : "Failed",
            },
            "Strategy outcome already resolved on-chain",
          );
          toRemove.push(id);
        } else {
          // Unexpected status — log and remove
          loopLog.warn(
            { strategyId: id, status },
            "Unexpected strategy status — removing from tracking",
          );
          toRemove.push(id);
        }
      } catch (err) {
        loopLog.error(
          { strategyId: id, err },
          "Failed to verify strategy outcome",
        );
        pending.retries++;
        if (pending.retries >= AutonomousLoop.MAX_OUTCOME_RETRIES) {
          loopLog.error(
            { strategyId: id },
            "Max retries exceeded for outcome verification — dropping",
          );
          toRemove.push(id);
        }
      }
    }

    // Clean up resolved strategies
    for (const id of toRemove) {
      this.pendingOutcomes.delete(id);
    }

    if (toRemove.length > 0) {
      loopLog.info(
        { resolved: toRemove.length, remaining: this.pendingOutcomes.size },
        "Outcome verification complete",
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Utilities
  // ─────────────────────────────────────────────────────────────────────

  /** Async sleep helper. */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
