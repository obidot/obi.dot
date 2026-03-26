export type AssetKind = "brand" | "chain" | "token" | "protocol";

export const ASSET_REGISTRY = {
  "brand.obidot": {
    src: "/brand/logo-transparent.png",
    alt: "Obidot brand mark",
    kind: "brand",
  },
  "brand.obidot.dark": {
    src: "/brand/logo-dark.png",
    alt: "Obidot logo on dark background",
    kind: "brand",
  },
  "brand.obidot.light": {
    src: "/brand/logo-light.png",
    alt: "Obidot logo on light background",
    kind: "brand",
  },
  "chain.polkadot": {
    src: "/chains/polkadot-new-dot-logo.svg",
    alt: "Polkadot",
    kind: "chain",
  },
  "chain.polkadot.horizontal": {
    src: "/chains/polkadot-new-dot-logo-horizontal.svg",
    alt: "Polkadot horizontal mark",
    kind: "chain",
  },
  "chain.bifrost": {
    src: "/chains/bifrost.svg",
    alt: "Bifrost",
    kind: "chain",
  },
  "chain.moonbeam": {
    src: "/chains/moonbeam-glmr-logo.svg",
    alt: "Moonbeam",
    kind: "chain",
  },
  "chain.ethereum": {
    src: "/chains/ethereum-eth-logo.svg",
    alt: "Ethereum",
    kind: "chain",
  },
  "protocol.uniswap": {
    src: "/chains/uniswap-uni-logo.svg",
    alt: "Uniswap",
    kind: "protocol",
  },
  "protocol.xcm": {
    src: "/chains/xcm-icon.svg",
    alt: "XCM",
    kind: "protocol",
  },
  "token.dot": {
    src: "/chains/polkadot-new-dot-logo.svg",
    alt: "DOT token",
    kind: "token",
  },
  "token.eth": {
    src: "/chains/ethereum-eth-logo.svg",
    alt: "ETH token",
    kind: "token",
  },
  "token.usdc": {
    src: "/chains/usd-coin-usdc-logo.svg",
    alt: "USDC token",
    kind: "token",
  },
  "token.uni": {
    src: "/chains/uniswap-uni-logo.svg",
    alt: "UNI token",
    kind: "token",
  },
  "token.tka.demo": {
    src: "/chains/uniswap-uni-logo.svg",
    alt: "Demo token A",
    kind: "token",
  },
  "token.tkb.demo": {
    src: "/chains/ethereum-eth-logo.svg",
    alt: "Demo token B",
    kind: "token",
  },
} as const;

export type AssetId = keyof typeof ASSET_REGISTRY;

export const HERO_BACKGROUND_SRC = "/images/polkadot.png";
export const HERO_BRAND_SRC = ASSET_REGISTRY["brand.obidot"].src;

const CHAIN_PATTERNS: Array<{ id: AssetId; pattern: RegExp }> = [
  {
    id: "chain.polkadot",
    pattern: /\b(polkadot(?:\s+hub)?(?:\s+testnet)?|polkadot-hub-testnet)\b/i,
  },
  { id: "chain.bifrost", pattern: /\bbifrost\b/i },
  { id: "chain.moonbeam", pattern: /\bmoonbeam|glmr\b/i },
  { id: "chain.ethereum", pattern: /\bethereum\b/i },
];

const PROTOCOL_PATTERNS: Array<{ id: AssetId; pattern: RegExp }> = [
  { id: "chain.bifrost", pattern: /\bbifrost\b/i },
  { id: "protocol.uniswap", pattern: /\buniswap(?:v2)?|uni\b/i },
  { id: "protocol.xcm", pattern: /\bxcm\b/i },
];

const TOKEN_PATTERNS: Array<{ id: AssetId; pattern: RegExp }> = [
  { id: "token.dot", pattern: /\b(t?dot|polkadot)\b/i },
  { id: "token.usdc", pattern: /\b(t?usdc|usd\s*coin|usdc)\b/i },
  { id: "token.eth", pattern: /\b(t?eth|ethereum|eth)\b/i },
  { id: "token.tka.demo", pattern: /\btka\b/i },
  { id: "token.tkb.demo", pattern: /\btkb\b/i },
  { id: "token.uni", pattern: /\buni|uniswap\b/i },
];

function collectMatchingAssets(
  value: string | null | undefined,
  patterns: Array<{ id: AssetId; pattern: RegExp }>,
): AssetId[] {
  if (!value) return [];

  const matches = patterns
    .map((entry) => {
      const match = entry.pattern.exec(value);
      return match ? { id: entry.id, index: match.index } : null;
    })
    .filter((entry): entry is { id: AssetId; index: number } => entry !== null)
    .sort((a, b) => a.index - b.index);

  return [...new Set(matches.map((entry) => entry.id))];
}

export function getAsset(assetId: AssetId): (typeof ASSET_REGISTRY)[AssetId] {
  return ASSET_REGISTRY[assetId];
}

export function resolveChainAssetId(
  value: string | null | undefined,
): AssetId | null {
  return collectMatchingAssets(value, CHAIN_PATTERNS)[0] ?? null;
}

export function resolveProtocolAssetId(
  value: string | null | undefined,
): AssetId | null {
  return collectMatchingAssets(value, PROTOCOL_PATTERNS)[0] ?? null;
}

export function resolveTokenAssetIds(
  value: string | null | undefined,
  limit = 3,
): AssetId[] {
  return collectMatchingAssets(value, TOKEN_PATTERNS).slice(0, limit);
}

export function resolveTokenAssetId(
  value: string | null | undefined,
): AssetId | null {
  return resolveTokenAssetIds(value, 1)[0] ?? null;
}
