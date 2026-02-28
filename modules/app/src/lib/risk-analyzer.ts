import type { ProtocolYield, BifrostYield } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
//  Risk Analyzer — Multi-dimensional risk decomposition per protocol
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Risk profile for a single yield source.
 * Each dimension is 0-100 (0=no risk, 100=extreme risk).
 */
export interface RiskProfile {
  name: string;
  protocol: string;
  isBifrost: boolean;
  category?: "SLP" | "DEX" | "Farming" | "SALP";
  /** Overall composite risk 0-100 */
  overallRisk: number;
  /** Risk tier label */
  tier: "MINIMAL" | "LOW" | "MODERATE" | "HIGH" | "EXTREME";
  /** Individual risk dimensions */
  dimensions: RiskDimensions;
  /** Risk/reward coordinate for scatter plot */
  plotPoint: { x: number; y: number };
  /** APY for the reward axis */
  apy: number;
  /** TVL for size reference */
  tvl: number;
}

export interface RiskDimensions {
  /** Smart contract / protocol risk (0-100) */
  protocolRisk: number;
  /** Impermanent loss risk (0-100, only for DEX/LP) */
  impermanentLoss: number;
  /** Liquidity risk — can you exit? (0-100) */
  liquidityRisk: number;
  /** APY sustainability — is this yield farming death spiral? (0-100) */
  sustainabilityRisk: number;
  /** Concentration risk — TVL relative to peers (0-100) */
  concentrationRisk: number;
}

// ── Risk Heuristics ───────────────────────────────────────────────────────

/** Base protocol risk by category */
const BASE_PROTOCOL_RISK: Record<string, number> = {
  SLP: 15,      // Liquid staking is well-understood
  DEX: 30,      // AMM smart contract risk
  Farming: 50,  // Multiple contract interactions
  SALP: 40,     // Crowdloan lock-up risk
  default: 25,
};

/** Impermanent loss risk by category */
const IL_RISK: Record<string, number> = {
  SLP: 5,       // Minimal for staking derivatives
  DEX: 45,      // Significant for LP positions
  Farming: 55,  // LP + farming = compounded IL risk
  SALP: 10,     // Not applicable in same way
  default: 20,
};

function computeProtocolRisk(category?: string): number {
  return BASE_PROTOCOL_RISK[category ?? "default"] ?? BASE_PROTOCOL_RISK.default;
}

function computeImpermanentLoss(category?: string): number {
  return IL_RISK[category ?? "default"] ?? IL_RISK.default;
}

function computeLiquidityRisk(tvl: number): number {
  // Lower TVL = harder to exit = higher liquidity risk
  if (tvl >= 100_000_000) return 5;
  if (tvl >= 50_000_000) return 15;
  if (tvl >= 10_000_000) return 30;
  if (tvl >= 1_000_000) return 55;
  return 80;
}

function computeSustainabilityRisk(apy: number, category?: string): number {
  // Extremely high APY without TVL backing is unsustainable
  if (category === "SLP" && apy < 15) return 10;
  if (apy > 30) return 75;
  if (apy > 20) return 50;
  if (apy > 10) return 25;
  return 10;
}

function computeConcentrationRisk(tvl: number, totalTvl: number): number {
  if (totalTvl === 0) return 50;
  const share = tvl / totalTvl;
  // If one protocol holds >60% of total, that's concentration risk
  if (share > 0.6) return 70;
  if (share > 0.4) return 45;
  if (share > 0.2) return 25;
  return 10;
}

function getRiskTier(risk: number): RiskProfile["tier"] {
  if (risk < 15) return "MINIMAL";
  if (risk < 30) return "LOW";
  if (risk < 50) return "MODERATE";
  if (risk < 70) return "HIGH";
  return "EXTREME";
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Analyze risk for all yield sources and produce risk profiles.
 * Results include scatter plot coordinates (x=risk, y=reward).
 */
export function analyzeRisks(
  yields: ProtocolYield[],
  bifrostYields: BifrostYield[],
): RiskProfile[] {
  const allTvl = [
    ...yields.map((y) => y.tvlUsd),
    ...bifrostYields.map((y) => y.tvlUsd),
  ];
  const totalTvl = allTvl.reduce((a, b) => a + b, 0);

  const profiles: RiskProfile[] = [];

  for (const y of yields) {
    profiles.push(buildProfile(y.name, y.protocol, y.apyPercent, y.tvlUsd, totalTvl, false));
  }

  for (const y of bifrostYields) {
    profiles.push(
      buildProfile(y.name, y.protocol, y.apyPercent, y.tvlUsd, totalTvl, true, y.category),
    );
  }

  return profiles;
}

function buildProfile(
  name: string,
  protocol: string,
  apy: number,
  tvl: number,
  totalTvl: number,
  isBifrost: boolean,
  category?: "SLP" | "DEX" | "Farming" | "SALP",
): RiskProfile {
  const dimensions: RiskDimensions = {
    protocolRisk: computeProtocolRisk(category),
    impermanentLoss: computeImpermanentLoss(category),
    liquidityRisk: computeLiquidityRisk(tvl),
    sustainabilityRisk: computeSustainabilityRisk(apy, category),
    concentrationRisk: computeConcentrationRisk(tvl, totalTvl),
  };

  const overallRisk = Math.round(
    dimensions.protocolRisk * 0.25 +
      dimensions.impermanentLoss * 0.2 +
      dimensions.liquidityRisk * 0.2 +
      dimensions.sustainabilityRisk * 0.2 +
      dimensions.concentrationRisk * 0.15,
  );

  return {
    name,
    protocol,
    isBifrost,
    category,
    overallRisk,
    tier: getRiskTier(overallRisk),
    dimensions,
    plotPoint: { x: overallRisk, y: apy },
    apy,
    tvl,
  };
}

/**
 * Color for a risk tier.
 */
export function riskTierColor(tier: RiskProfile["tier"]): string {
  switch (tier) {
    case "MINIMAL": return "text-primary";
    case "LOW": return "text-primary";
    case "MODERATE": return "text-warning";
    case "HIGH": return "text-danger";
    case "EXTREME": return "text-danger";
  }
}

export function riskTierBg(tier: RiskProfile["tier"]): string {
  switch (tier) {
    case "MINIMAL": return "bg-primary/10";
    case "LOW": return "bg-primary/10";
    case "MODERATE": return "bg-warning/10";
    case "HIGH": return "bg-danger/10";
    case "EXTREME": return "bg-danger/15";
  }
}
