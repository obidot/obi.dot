import {
  ArrowRight,
  Bot,
  Boxes,
  Code2,
  Rocket,
  TerminalSquare,
} from "lucide-react";
import Link from "next/link";
import { HeroStat, PageHero } from "@/components/ui/page-hero";

const PACKAGE_CARDS = [
  {
    name: "@obidot-kit/core",
    description:
      "Typed chain config, contract constants, ABIs, and EVM context helpers for Hub testnet automation.",
  },
  {
    name: "@obidot-kit/sdk",
    description:
      "High-level ObiKit surface for registering vaults, satellites, and execution contexts.",
  },
  {
    name: "@obidot-kit/llm",
    description:
      "LangChain-friendly tool wrappers for swap, liquidity, vault, oracle, and cross-chain route planning.",
  },
  {
    name: "@obidot-kit/cli",
    description:
      "Project scaffolding for starter, vault-agent, cross-chain-agent, dca-bot, and yield-optimizer templates.",
  },
] as const;

const TEMPLATE_CARDS = [
  {
    name: "starter",
    command: "npx @obidot-kit/cli init --template starter",
    description:
      "Smallest possible scaffold for local inspection and SDK integration checks.",
  },
  {
    name: "vault-agent",
    command: "npx @obidot-kit/cli init --template vault-agent",
    description:
      "Hub vault automation scaffold with optional viem signer wiring for real transactions.",
  },
  {
    name: "cross-chain-agent",
    command: "npx @obidot-kit/cli init --template cross-chain-agent",
    description:
      "Satellite-aware scaffold with Hub, Moonbeam, Astar, and Bifrost placeholders.",
  },
  {
    name: "dca-bot",
    command: "npx @obidot-kit/cli init --template dca-bot",
    description:
      "Recurring tUSDC -> tDOT bot scaffold with swap quoting and execution-ready wiring.",
  },
  {
    name: "yield-optimizer",
    command: "npx @obidot-kit/cli init --template yield-optimizer",
    description:
      "Preview-first optimizer scaffold that compares vault posture, route availability, and Bifrost yield candidates.",
  },
] as const;

const QUICKSTART_STEPS = [
  "pnpm add @obidot-kit/core @obidot-kit/sdk",
  "npx @obidot-kit/cli init --template vault-agent my-obi-agent",
  "cd my-obi-agent && cp .env.example .env && pnpm install",
  "pnpm start",
] as const;

const TOOL_FAMILIES = [
  {
    name: "Swap + Routing",
    tools: [
      "SwapQuoteTool",
      "SwapExecuteTool",
      "SwapMultiHopTool",
      "ExecuteLocalSwapTool",
      "ExecuteIntentTool",
      "LiquidityAddTool",
      "LiquidityRemoveTool",
    ],
    example:
      "Quote 100 tDOT into tUSDC, compare the best route, then hand back an executable intent or LP action.",
  },
  {
    name: "Vault Operations",
    tools: [
      "VaultStateTool",
      "VaultDepositTool",
      "VaultWithdrawTool",
      "VaultAdminTool",
      "VaultPolicyTool",
      "WithdrawalQueueTool",
    ],
    example:
      "Inspect vault state, enqueue a withdrawal, or apply operator-side policy and admin actions.",
  },
  {
    name: "Cross-Chain + Bifrost",
    tools: [
      "CrossChainStateTool",
      "CrossChainRouteTool",
      "CrossChainRebalanceTool",
      "BifrostYieldTool",
      "BifrostStrategyTool",
      "LpPoolStateTool",
    ],
    example:
      "Read satellite state, scout route availability with live/simulated status labels, and prepare a rebalance plan across connected chains.",
  },
  {
    name: "Risk + Strategy",
    tools: [
      "PerformanceTool",
      "OracleCheckTool",
      "OracleUpdateTool",
      "BatchStrategyTool",
    ],
    example:
      "Check oracle freshness, inspect performance, and batch strategy operations into one controlled run.",
  },
] as const;

export default function AgentKitDocsPage() {
  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Docs"
        title="Agent Kit"
        description="Build Obidot-aware agents with the published package surface, reusable CLI scaffolds, and the live execution chat already running on the testnet app."
        stats={
          <>
            <HeroStat
              label="Packages"
              icon={<Boxes className="h-4 w-4 text-primary" />}
              value="4"
            />
            <HeroStat
              label="CLI Templates"
              icon={<TerminalSquare className="h-4 w-4 text-primary" />}
              value="5"
            />
            <HeroStat
              label="Live Demo"
              icon={<Bot className="h-4 w-4 text-primary" />}
              value="/agent"
            />
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_360px]">
        <section className="space-y-4">
          <div className="panel p-5">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-primary" />
              <h2 className="retro-label text-[0.95rem] text-text-primary">
                Quickstart
              </h2>
            </div>
            <p className="mt-3 text-sm text-text-secondary">
              The shortest path is the CLI scaffold. It gives you a runnable
              TypeScript project with `.env.example`, `src/index.ts`, and the
              correct package surface for the selected template.
            </p>
            <div className="mt-4 space-y-2">
              {QUICKSTART_STEPS.map((step, index) => (
                <div
                  key={step}
                  className="flex items-start gap-3 border-[3px] border-border bg-surface px-3 py-3 shadow-[3px_3px_0_0_var(--border)]"
                >
                  <span className="stat-number text-lg text-primary">
                    {index + 1}
                  </span>
                  <code className="font-mono text-[13px] text-text-primary">
                    {step}
                  </code>
                </div>
              ))}
            </div>
          </div>

          <div className="panel p-5">
            <div className="flex items-center gap-2">
              <Boxes className="h-4 w-4 text-primary" />
              <h2 className="retro-label text-[0.95rem] text-text-primary">
                Package Surface
              </h2>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {PACKAGE_CARDS.map((pkg) => (
                <article
                  key={pkg.name}
                  className="border-[3px] border-border bg-surface px-4 py-4 shadow-[3px_3px_0_0_var(--border)]"
                >
                  <p className="font-mono text-[13px] font-semibold text-primary">
                    {pkg.name}
                  </p>
                  <p className="mt-2 text-sm text-text-secondary">
                    {pkg.description}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <div className="panel p-5">
            <div className="flex items-center gap-2">
              <Rocket className="h-4 w-4 text-primary" />
              <h2 className="retro-label text-[0.95rem] text-text-primary">
                CLI Templates
              </h2>
            </div>
            <div className="mt-4 space-y-3">
              {TEMPLATE_CARDS.map((template) => (
                <article
                  key={template.name}
                  className="border-[3px] border-border bg-surface px-4 py-4 shadow-[3px_3px_0_0_var(--border)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="retro-label text-[0.9rem] text-text-primary">
                      {template.name}
                    </p>
                    <code className="font-mono text-[11px] text-primary">
                      {template.command}
                    </code>
                  </div>
                  <p className="mt-2 text-sm text-text-secondary">
                    {template.description}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <div className="panel p-5">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              <h2 className="retro-label text-[0.95rem] text-text-primary">
                Tool Families
              </h2>
            </div>
            <p className="mt-3 text-sm text-text-secondary">
              The published surface is split into focused execution groups so
              agent prompts can stay explicit about intent, risk, and required
              signer context.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {TOOL_FAMILIES.map((family) => (
                <article
                  key={family.name}
                  className="border-[3px] border-border bg-surface px-4 py-4 shadow-[3px_3px_0_0_var(--border)]"
                >
                  <p className="retro-label text-[0.9rem] text-text-primary">
                    {family.name}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {family.tools.map((tool) => (
                      <span
                        key={tool}
                        className="pill bg-primary/10 text-primary text-[0.78rem]"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                    {family.example}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="panel p-5">
            <p className="retro-label text-[0.95rem] text-text-primary">
              Live Demo
            </p>
            <p className="mt-3 text-sm text-text-secondary">
              The `/agent` page is the working showcase for the same execution
              flow the kit is meant to support: streamed chat, proposal review,
              wallet approval, and swap execution on testnet.
            </p>
            <div className="mt-4 space-y-2">
              <Link
                href="/agent"
                className="btn-primary inline-flex w-full items-center justify-center gap-2"
              >
                Open Interactive Agent
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/swap/polkadot-hub-testnet"
                className="btn-secondary inline-flex w-full items-center justify-center gap-2"
              >
                Inspect Live Routes
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="panel p-5">
            <p className="retro-label text-[0.95rem] text-text-primary">
              Example Prompts
            </p>
            <div className="mt-4 space-y-2 text-sm text-text-secondary">
              <div className="border-[3px] border-border bg-surface px-3 py-3 font-mono text-[12px] shadow-[3px_3px_0_0_var(--border)]">
                What is the best route for 100 tDOT into tUSDC right now?
              </div>
              <div className="border-[3px] border-border bg-surface px-3 py-3 font-mono text-[12px] shadow-[3px_3px_0_0_var(--border)]">
                Compare Hub-local liquidity against simulated Hydration output.
              </div>
              <div className="border-[3px] border-border bg-surface px-3 py-3 font-mono text-[12px] shadow-[3px_3px_0_0_var(--border)]">
                Preview cross-chain route status for tDOT {"->"} tUSDC and tell
                me whether it is live or simulated.
              </div>
              <div className="border-[3px] border-border bg-surface px-3 py-3 font-mono text-[12px] shadow-[3px_3px_0_0_var(--border)]">
                Show me a proposal to swap 25 tUSDC into tDOT with 50 bps max
                slippage.
              </div>
            </div>
          </div>

          <div className="panel p-5">
            <p className="retro-label text-[0.95rem] text-text-primary">
              Current Scope
            </p>
            <p className="mt-3 text-sm text-text-secondary">
              The package metadata, release workflow, route/liquidity tool
              surface, and five CLI scaffolds are now in place. Phase 3 is down
              to broader audit, coverage, and publish-readiness cleanup rather
              than missing core primitives.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
