// ─────────────────────────────────────────────────────────────────────────────
//  Position Simulator — "What-If" Scenario Engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input parameters for a position simulation.
 */
export interface SimulationInput {
  /** Amount in USD to deploy */
  amountUsd: number;
  /** Annual percentage yield */
  apyPercent: number;
  /** Duration in days */
  durationDays: number;
  /** Protocol category for risk estimation */
  category?: "SLP" | "DEX" | "Farming" | "SALP";
}

/**
 * Detailed simulation output with projections.
 */
export interface SimulationResult {
  /** Input parameters */
  input: SimulationInput;
  /** Base projected return (simple compounding) */
  projectedReturnUsd: number;
  /** Daily yield in USD */
  dailyYieldUsd: number;
  /** Monthly yield in USD */
  monthlyYieldUsd: number;
  /** Projected final balance */
  finalBalanceUsd: number;
  /** Effective APY after estimated costs */
  effectiveApy: number;
  /** Days to break even on gas/entry costs */
  breakEvenDays: number;
  /** Estimated impermanent loss (%) — only for DEX/LP */
  estimatedIlPercent: number;
  /** Return after IL deduction */
  returnAfterIlUsd: number;
  /** Confidence interval */
  confidence: {
    low: SimulationProjection;
    mid: SimulationProjection;
    high: SimulationProjection;
  };
  /** Daily projection timeline */
  timeline: SimulationTimelinePoint[];
}

export interface SimulationProjection {
  label: string;
  apy: number;
  finalBalance: number;
  totalReturn: number;
}

export interface SimulationTimelinePoint {
  day: number;
  balanceLow: number;
  balanceMid: number;
  balanceHigh: number;
}

// ── Constants ─────────────────────────────────────────────────────────────

/** Estimated gas cost for entry/exit in USD */
const ESTIMATED_GAS_COST_USD = 2.0;
/** Estimated XCM bridging cost */
const ESTIMATED_BRIDGE_COST_USD = 0.5;
/** Total entry cost */
const ENTRY_COST_USD = ESTIMATED_GAS_COST_USD + ESTIMATED_BRIDGE_COST_USD;

/** Impermanent loss estimates by category (%) */
const IL_ESTIMATES: Record<string, number> = {
  SLP: 0.1,
  DEX: 2.5,
  Farming: 3.5,
  SALP: 0.5,
  default: 1.0,
};

/** APY variance for confidence intervals */
const APY_VARIANCE = {
  LOW: 0.6,   // 60% of base APY (bear case)
  HIGH: 1.3,  // 130% of base APY (bull case)
} as const;

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Run a full position simulation with projections.
 */
export function simulatePosition(input: SimulationInput): SimulationResult {
  const { amountUsd, apyPercent, durationDays, category } = input;

  // Daily rate from APY (continuous compounding approximation)
  const dailyRate = apyPercent / 100 / 365;

  // Base projection (compound)
  const finalBalanceUsd = amountUsd * Math.pow(1 + dailyRate, durationDays);
  const projectedReturnUsd = finalBalanceUsd - amountUsd;
  const dailyYieldUsd = amountUsd * dailyRate;
  const monthlyYieldUsd = dailyYieldUsd * 30;

  // Effective APY after costs
  const totalCosts = ENTRY_COST_USD * 2; // entry + exit
  const effectiveReturn = projectedReturnUsd - totalCosts;
  const effectiveApy =
    durationDays > 0
      ? ((effectiveReturn / amountUsd) * (365 / durationDays)) * 100
      : 0;

  // Break-even: days to earn back entry+exit costs
  const breakEvenDays =
    dailyYieldUsd > 0 ? Math.ceil(totalCosts / dailyYieldUsd) : Infinity;

  // Impermanent loss
  const ilKey = category ?? "default";
  const estimatedIlPercent = IL_ESTIMATES[ilKey] ?? IL_ESTIMATES.default;
  const ilCost = (amountUsd * estimatedIlPercent) / 100;
  const returnAfterIlUsd = projectedReturnUsd - ilCost;

  // Confidence intervals
  const lowApy = apyPercent * APY_VARIANCE.LOW;
  const highApy = apyPercent * APY_VARIANCE.HIGH;

  const confidence = {
    low: buildProjection("Bear", lowApy, amountUsd, durationDays),
    mid: buildProjection("Base", apyPercent, amountUsd, durationDays),
    high: buildProjection("Bull", highApy, amountUsd, durationDays),
  };

  // Timeline (daily points, max 365 points)
  const step = Math.max(1, Math.floor(durationDays / 60));
  const timeline: SimulationTimelinePoint[] = [];
  for (let day = 0; day <= durationDays; day += step) {
    const lowRate = lowApy / 100 / 365;
    const midRate = dailyRate;
    const highRate = highApy / 100 / 365;
    timeline.push({
      day,
      balanceLow: amountUsd * Math.pow(1 + lowRate, day),
      balanceMid: amountUsd * Math.pow(1 + midRate, day),
      balanceHigh: amountUsd * Math.pow(1 + highRate, day),
    });
  }
  // Ensure final day is included
  if (timeline.length > 0 && timeline[timeline.length - 1].day !== durationDays) {
    const lowRate = lowApy / 100 / 365;
    const midRate = dailyRate;
    const highRate = highApy / 100 / 365;
    timeline.push({
      day: durationDays,
      balanceLow: amountUsd * Math.pow(1 + lowRate, durationDays),
      balanceMid: amountUsd * Math.pow(1 + midRate, durationDays),
      balanceHigh: amountUsd * Math.pow(1 + highRate, durationDays),
    });
  }

  return {
    input,
    projectedReturnUsd,
    dailyYieldUsd,
    monthlyYieldUsd,
    finalBalanceUsd,
    effectiveApy,
    breakEvenDays: isFinite(breakEvenDays) ? breakEvenDays : 999,
    estimatedIlPercent,
    returnAfterIlUsd,
    confidence,
    timeline,
  };
}

function buildProjection(
  label: string,
  apy: number,
  amount: number,
  days: number,
): SimulationProjection {
  const rate = apy / 100 / 365;
  const finalBalance = amount * Math.pow(1 + rate, days);
  return {
    label,
    apy,
    finalBalance,
    totalReturn: finalBalance - amount,
  };
}

/**
 * Format a USD amount with appropriate precision.
 */
export function formatSimUsd(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `$${(value / 1_000).toFixed(2)}K`;
  }
  return `$${value.toFixed(2)}`;
}
