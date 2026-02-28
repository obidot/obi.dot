import type { ProtocolYield, BifrostYield } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
//  Opportunity Scoring Engine — composite 0-100 score per yield source
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A scored yield opportunity with composite ranking.
 * Higher score = more attractive risk-adjusted opportunity.
 */
export interface ScoredOpportunity {
  /** Original yield data */
  yield: ProtocolYield | BifrostYield;
  /** Whether this is a Bifrost-specific yield */
  isBifrost: boolean;
  /** Bifrost category if applicable */
  category?: "SLP" | "DEX" | "Farming" | "SALP";
  /** Composite score 0-100 */
  score: number;
  /** Sub-scores for transparency */
  breakdown: ScoreBreakdown;
  /** Human-readable signal */
  signal: "STRONG_BUY" | "BUY" | "NEUTRAL" | "CAUTION" | "AVOID";
  /** One-line recommendation */
  recommendation: string;
}

export interface ScoreBreakdown {
  /** APY attractiveness (0-30) */
  apyScore: number;
  /** TVL/stability score (0-25) — higher TVL = more stable */
  stabilityScore: number;
  /** Risk-adjusted return (0-20) — APY relative to risk tier */
  riskAdjustedScore: number;
  /** Category bonus (0-15) — favors liquid staking & proven categories */
  categoryScore: number;
  /** Freshness (0-10) — how recent the data is */
  freshnessScore: number;
}

// ── Weight Configuration ──────────────────────────────────────────────────

const WEIGHTS = {
  APY_MAX_SCORE: 30,
  STABILITY_MAX_SCORE: 25,
  RISK_ADJUSTED_MAX_SCORE: 20,
  CATEGORY_MAX_SCORE: 15,
  FRESHNESS_MAX_SCORE: 10,
} as const;

/** APY thresholds for scoring */
const APY_TIERS = {
  EXCELLENT: 15,
  GOOD: 10,
  FAIR: 5,
  LOW: 2,
} as const;

/** TVL thresholds (USD) for stability scoring */
const TVL_TIERS = {
  MEGA: 100_000_000,
  LARGE: 50_000_000,
  MEDIUM: 10_000_000,
  SMALL: 1_000_000,
} as const;

/** Category risk weights (lower = safer) */
const CATEGORY_RISK: Record<string, number> = {
  SLP: 0.15,
  DEX: 0.35,
  Farming: 0.55,
  SALP: 0.45,
  default: 0.30,
};

const CATEGORY_BONUS: Record<string, number> = {
  SLP: 15,
  DEX: 10,
  Farming: 6,
  SALP: 8,
  default: 8,
};

// ── Scoring Functions ─────────────────────────────────────────────────────

function scoreApy(apy: number): number {
  if (apy >= APY_TIERS.EXCELLENT) return WEIGHTS.APY_MAX_SCORE;
  if (apy >= APY_TIERS.GOOD) return WEIGHTS.APY_MAX_SCORE * 0.8;
  if (apy >= APY_TIERS.FAIR) return WEIGHTS.APY_MAX_SCORE * 0.55;
  if (apy >= APY_TIERS.LOW) return WEIGHTS.APY_MAX_SCORE * 0.3;
  return WEIGHTS.APY_MAX_SCORE * 0.1;
}

function scoreStability(tvl: number): number {
  if (tvl >= TVL_TIERS.MEGA) return WEIGHTS.STABILITY_MAX_SCORE;
  if (tvl >= TVL_TIERS.LARGE) return WEIGHTS.STABILITY_MAX_SCORE * 0.85;
  if (tvl >= TVL_TIERS.MEDIUM) return WEIGHTS.STABILITY_MAX_SCORE * 0.6;
  if (tvl >= TVL_TIERS.SMALL) return WEIGHTS.STABILITY_MAX_SCORE * 0.35;
  return WEIGHTS.STABILITY_MAX_SCORE * 0.1;
}

function scoreRiskAdjusted(apy: number, category?: string): number {
  const riskWeight = CATEGORY_RISK[category ?? "default"] ?? CATEGORY_RISK.default;
  // Risk-adjusted = APY * (1 - risk_weight) / max_apy_expected
  const riskAdjustedApy = apy * (1 - riskWeight);
  const maxExpected = APY_TIERS.EXCELLENT * (1 - 0.15); // best case
  const ratio = Math.min(riskAdjustedApy / maxExpected, 1);
  return ratio * WEIGHTS.RISK_ADJUSTED_MAX_SCORE;
}

function scoreFreshness(fetchedAt: string): number {
  const ageMs = Date.now() - new Date(fetchedAt).getTime();
  const ageMinutes = ageMs / 60_000;
  if (ageMinutes < 5) return WEIGHTS.FRESHNESS_MAX_SCORE;
  if (ageMinutes < 15) return WEIGHTS.FRESHNESS_MAX_SCORE * 0.8;
  if (ageMinutes < 60) return WEIGHTS.FRESHNESS_MAX_SCORE * 0.5;
  return WEIGHTS.FRESHNESS_MAX_SCORE * 0.2;
}

function getSignal(score: number): ScoredOpportunity["signal"] {
  if (score >= 80) return "STRONG_BUY";
  if (score >= 60) return "BUY";
  if (score >= 40) return "NEUTRAL";
  if (score >= 25) return "CAUTION";
  return "AVOID";
}

function getRecommendation(
  score: number,
  apy: number,
  tvl: number,
  category?: string,
): string {
  if (score >= 80) {
    return `Exceptional risk-adjusted yield at ${apy.toFixed(1)}% APY with $${(tvl / 1e6).toFixed(0)}M TVL backing`;
  }
  if (score >= 60) {
    return `Solid opportunity — ${apy.toFixed(1)}% APY with adequate liquidity and manageable risk`;
  }
  if (score >= 40) {
    const reason = category === "Farming" ? "farming volatility" : "moderate TVL";
    return `Acceptable yield but watch ${reason} — consider partial allocation only`;
  }
  if (score >= 25) {
    return `Below-average risk/reward profile — only allocate if diversifying`;
  }
  return `Poor risk-adjusted returns — capital better deployed elsewhere`;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Score and rank all yield opportunities.
 * Returns sorted descending by composite score.
 */
export function scoreOpportunities(
  yields: ProtocolYield[],
  bifrostYields: BifrostYield[],
): ScoredOpportunity[] {
  const scored: ScoredOpportunity[] = [];

  for (const y of yields) {
    const breakdown = computeBreakdown(y.apyPercent, y.tvlUsd, y.fetchedAt);
    const score = Math.round(
      breakdown.apyScore +
        breakdown.stabilityScore +
        breakdown.riskAdjustedScore +
        breakdown.categoryScore +
        breakdown.freshnessScore,
    );
    scored.push({
      yield: y,
      isBifrost: false,
      score,
      breakdown,
      signal: getSignal(score),
      recommendation: getRecommendation(score, y.apyPercent, y.tvlUsd),
    });
  }

  for (const y of bifrostYields) {
    const breakdown = computeBreakdown(
      y.apyPercent,
      y.tvlUsd,
      y.fetchedAt,
      y.category,
    );
    const score = Math.round(
      breakdown.apyScore +
        breakdown.stabilityScore +
        breakdown.riskAdjustedScore +
        breakdown.categoryScore +
        breakdown.freshnessScore,
    );
    scored.push({
      yield: y,
      isBifrost: true,
      category: y.category,
      score,
      breakdown,
      signal: getSignal(score),
      recommendation: getRecommendation(
        score,
        y.apyPercent,
        y.tvlUsd,
        y.category,
      ),
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function computeBreakdown(
  apy: number,
  tvl: number,
  fetchedAt: string,
  category?: string,
): ScoreBreakdown {
  return {
    apyScore: scoreApy(apy),
    stabilityScore: scoreStability(tvl),
    riskAdjustedScore: scoreRiskAdjusted(apy, category),
    categoryScore: CATEGORY_BONUS[category ?? "default"] ?? CATEGORY_BONUS.default,
    freshnessScore: scoreFreshness(fetchedAt),
  };
}

/**
 * Get the top N opportunities by score.
 */
export function topOpportunities(
  yields: ProtocolYield[],
  bifrostYields: BifrostYield[],
  n = 3,
): ScoredOpportunity[] {
  return scoreOpportunities(yields, bifrostYields).slice(0, n);
}
