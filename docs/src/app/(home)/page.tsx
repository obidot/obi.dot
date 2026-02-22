import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex flex-col flex-1">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center px-6 py-24 gap-6">
        <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl">
          Obidot
        </h1>
        <p className="max-w-2xl text-lg text-fd-muted-foreground">
          Autonomous Cross-Chain Finance Layer for Polkadot. An ERC-4626
          yield-bearing vault that lets an off-chain AI agent route funds across
          parachains using native XCM — secured by on-chain policy, EIP-712
          signatures, and oracle-based slippage protection.
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
              title="ERC-4626 Vault"
              description="Fully compliant yield-bearing vault with deposit caps, inflation-attack mitigation, and conservative rounding that always favors depositors."
            />
            <FeatureCard
              title="AI Strategist"
              description="An off-chain AI agent signs EIP-712 strategy intents specifying where to deploy capital. Anyone can relay valid signed intents on-chain."
            />
            <FeatureCard
              title="On-Chain Policy Engine"
              description="Parachain & protocol whitelists, per-protocol exposure caps, and a daily-loss circuit breaker that auto-pauses the vault when thresholds are exceeded."
            />
            <FeatureCard
              title="Oracle Slippage Guard"
              description="Pyth Network price feeds validate every strategy's expected return against real-time prices with configurable slippage bounds."
            />
            <FeatureCard
              title="Native XCM Dispatch"
              description="Strategies are dispatched to destination parachains via the Polkadot Hub XCM precompile with pre-flight weight estimation and safety margins."
            />
            <FeatureCard
              title="Emergency Mode"
              description="Admin can pause the vault and enable proportional emergency withdrawals that bypass remote asset accounting, protecting depositors."
            />
          </div>
        </div>
      </section>

      {/* Architecture overview */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold mb-6">Architecture</h2>
          <p className="text-fd-muted-foreground mb-8">
            Obidot separates concerns between human governance (admin roles,
            policy configuration), AI autonomy (strategy signing and
            submission), and keeper infrastructure (outcome reporting and P&L
            tracking). Every layer enforces invariants on-chain so the AI agent
            cannot act outside its policy bounds.
          </p>
          <div className="flex flex-col gap-3 rounded-lg border border-fd-border bg-fd-card p-6 text-sm font-mono text-left">
            <Row label="Depositors" value="deposit / withdraw via ERC-4626" />
            <Row label="AI Strategist" value="signs StrategyIntent (EIP-712)" />
            <Row
              label="Relayer"
              value="submits signed intent to executeStrategy()"
            />
            <Row
              label="Policy Engine"
              value="whitelists, caps, circuit breaker"
            />
            <Row label="Oracle" value="Pyth price feed → slippage validation" />
            <Row
              label="XCM Precompile"
              value="dispatches cross-chain message"
            />
            <Row label="Keeper" value="reports outcome → P&L tracking" />
          </div>
        </div>
      </section>

      {/* Target network */}
      <section className="border-t border-fd-border bg-fd-card/50 px-6 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold mb-4">Built for Polkadot</h2>
          <p className="text-fd-muted-foreground mb-6">
            Obidot deploys to the Polkadot Hub EVM (REVM) and uses native XCM
            precompiles for cross-chain communication. No bridges, no wrappers —
            just native Polkadot interoperability.
          </p>
          <div className="inline-flex flex-col gap-2 text-sm text-fd-muted-foreground">
            <span>
              <strong className="text-fd-foreground">Network:</strong> Polkadot
              Hub Testnet (Paseo)
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
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="px-6 py-16 text-center">
        <h2 className="text-xl font-semibold mb-3">Get Started</h2>
        <p className="text-fd-muted-foreground mb-6 max-w-xl mx-auto">
          Explore the documentation to learn about the vault architecture,
          strategy execution flow, policy engine, and deployment guides.
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
