import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex flex-col flex-1">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center px-6 py-24 gap-6">
        <span className="inline-flex items-center rounded-full border border-fd-border bg-fd-card px-3 py-1 text-xs font-medium text-fd-muted-foreground">
          First DEX Aggregator on Polkadot Hub
        </span>
        <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl">
          Obidot
        </h1>
        <p className="max-w-2xl text-lg text-fd-muted-foreground">
          Aggregate liquidity across Polkadot parachains and EVM chains from a
          single entry point on Polkadot Hub. Route swaps via XCM to Hydration,
          Bifrost, and Acala — or via Hyperbridge ISMP to Ethereum, Arbitrum,
          and Base. An ERC-4626 vault holds deposited DOT/USDC; an AI agent
          operates as a sub-feature for automated strategy execution.
        </p>
        <div className="flex flex-row gap-3 mt-2">
          <Link
            href="/docs"
            className="inline-flex items-center justify-center rounded-md bg-fd-primary px-6 py-2.5 text-sm font-medium text-fd-primary-foreground shadow transition-colors hover:bg-fd-primary/90"
          >
            Read the Docs
          </Link>
          <a
            href="https://github.com/obidot/obidot"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-md border border-fd-border px-6 py-2.5 text-sm font-medium shadow-sm transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
          >
            GitHub
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-fd-border bg-fd-card/50 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold mb-12">How It Works</h2>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              title="DEX Aggregator Router"
              description="SwapRouter aggregates on-hub liquidity across Hydration Omnipool, AssetHub native pairs, and Bifrost DEX. Supports single-hop, multi-hop, and split-route swaps with pluggable pool adapters."
            />
            <FeatureCard
              title="Cross-Chain Liquidity"
              description="XCMExecutor dispatches trades to Polkadot parachains (Bifrost, Acala, HydraDX, Moonbeam) via native XCM V4. HyperExecutor bridges to Ethereum, Arbitrum, and Base via Hyperbridge ISMP."
            />
            <FeatureCard
              title="ERC-4626 Vault"
              description="Fully compliant yield-bearing vault with deposit caps, inflation-attack mitigation, and conservative rounding that always favors depositors."
            />
            <FeatureCard
              title="Bifrost Integration"
              description="Liquid staking (SLP/vDOT), DEX swaps, yield farming, and SALP via on-chain Bifrost adapter. Strategies are encoded as SCALE XCM V4 calls dispatched to parachain 2030."
            />
            <FeatureCard
              title="Oracle & Slippage Guard"
              description="KeeperOracle (Chainlink-compatible) with multi-asset registry and 2% max-slippage validation. Keeper pushes prices off-chain; vault rejects stale or out-of-range data."
            />
            <FeatureCard
              title="AI Agent (Sub-Feature)"
              description="An off-chain LangChain/GPT-4o agent signs EIP-712 strategy intents for automated multi-hop execution. Anyone can relay valid signed intents on-chain — no special permissions needed."
            />
          </div>
        </div>
      </section>

      {/* Architecture overview */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold mb-6">Architecture</h2>
          <p className="text-fd-muted-foreground mb-8">
            A single vault on Polkadot Hub routes capital across the entire
            Polkadot ecosystem. On-hub swaps go through SwapRouter; parachain
            strategies go through XCMExecutor; EVM chain strategies go through
            HyperExecutor via Hyperbridge.
          </p>
          <div className="flex flex-col gap-3 rounded-lg border border-fd-border bg-fd-card p-6 text-sm font-mono text-left">
            <Row label="User" value="deposit / withdraw via ERC-4626" />
            <Row
              label="SwapRouter"
              value="on-hub swaps → Hydration / AssetHub / Bifrost DEX"
            />
            <Row
              label="XCMExecutor"
              value="parachain strategies → XCM V4 precompile (0xA0000)"
            />
            <Row
              label="HyperExecutor"
              value="EVM chain strategies → Hyperbridge ISMP"
            />
            <Row
              label="Policy Engine"
              value="whitelists, exposure caps, circuit breaker"
            />
            <Row
              label="Oracle"
              value="KeeperOracle price feed → slippage validation"
            />
            <Row
              label="AI Agent"
              value="signs StrategyIntent (EIP-712) — sub-feature"
            />
          </div>
        </div>
      </section>

      {/* Target network */}
      <section className="border-t border-fd-border bg-fd-card/50 px-6 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold mb-4">Built for Polkadot</h2>
          <p className="text-fd-muted-foreground mb-6">
            Deployed to the Polkadot Hub EVM (PolkaVM via{" "}
            <code className="text-xs">resolc</code>) and uses native XCM
            precompiles for parachain communication. EVM chain connectivity via
            Hyperbridge ISMP — no trusted multisig bridges.
          </p>
          <div className="inline-flex flex-col gap-2 text-sm text-fd-muted-foreground">
            <span>
              <strong className="text-fd-foreground">Network:</strong> Polkadot
              Hub Testnet
            </span>
            <span>
              <strong className="text-fd-foreground">Chain ID:</strong>{" "}
              420420417
            </span>
            <span>
              <strong className="text-fd-foreground">XCM Precompile:</strong>{" "}
              <code className="text-xs">
                0x00000000000000000000000000000000000a0000
              </code>
            </span>
            <span>
              <strong className="text-fd-foreground">ISMP Host:</strong>{" "}
              <code className="text-xs">
                0xbb26e04a71e7c12093e82b83ba310163eac186fa
              </code>
            </span>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="px-6 py-16 text-center">
        <h2 className="text-xl font-semibold mb-3">Get Started</h2>
        <p className="text-fd-muted-foreground mb-6 max-w-xl mx-auto">
          Explore the documentation to learn about the DEX aggregator router,
          cross-chain execution, vault architecture, and deployment guides.
        </p>
        <Link
          href="/docs"
          className="inline-flex items-center justify-center rounded-md bg-fd-primary px-6 py-2.5 text-sm font-medium text-fd-primary-foreground shadow transition-colors hover:bg-fd-primary/90"
        >
          Read the Documentation →
        </Link>
      </section>
    </main>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-fd-border bg-fd-card p-6">
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-fd-muted-foreground">{description}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4">
      <span className="text-fd-primary font-semibold min-w-35 shrink-0">
        {label}
      </span>
      <span className="text-fd-muted-foreground">{value}</span>
    </div>
  );
}
