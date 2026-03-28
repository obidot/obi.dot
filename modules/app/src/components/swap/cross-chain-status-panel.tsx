"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, Clock3, ExternalLink, Link2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  type CrossChainPipelineEvent,
  useCrossChainStatusSubscription,
} from "@/hooks/use-graphql-subscription";
import { CHAIN } from "@/lib/constants";
import {
  getCrossChainPipeline,
  getCrossChainPipelines,
  type IndexedCrossChainPipeline,
} from "@/lib/graphql";

interface CrossChainStatusPanelProps {
  address?: string;
  activeTxHash?: string | null;
}

function compact(value: string | null | undefined): string {
  if (!value) return "—";
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

function statusTone(status: string): string {
  switch (status) {
    case "executed":
    case "accepted":
      return "bg-accent text-accent-foreground";
    case "failed":
    case "timeout":
      return "bg-danger/15 text-danger";
    default:
      return "bg-surface-alt text-text-secondary";
  }
}

function normalizePipeline(
  pipeline: CrossChainPipelineEvent | IndexedCrossChainPipeline,
): IndexedCrossChainPipeline {
  return {
    ...pipeline,
    steps: [...pipeline.steps],
  };
}

export function CrossChainStatusPanel({
  address,
  activeTxHash,
}: CrossChainStatusPanelProps) {
  const [livePipeline, setLivePipeline] =
    useState<IndexedCrossChainPipeline | null>(null);

  const { data: activePipeline } = useQuery({
    queryKey: ["cross-chain-pipeline", activeTxHash],
    queryFn: () =>
      activeTxHash
        ? getCrossChainPipeline(activeTxHash)
        : Promise.resolve(null),
    enabled: !!activeTxHash,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const { data: recentPipelines, isLoading } = useQuery({
    queryKey: ["cross-chain-pipelines", address],
    queryFn: () => getCrossChainPipelines(6, address),
    enabled: !!address,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const { connected } = useCrossChainStatusSubscription(
    activeTxHash,
    (pipeline) => {
      setLivePipeline(normalizePipeline(pipeline));
    },
  );

  useEffect(() => {
    if (activePipeline) {
      setLivePipeline(normalizePipeline(activePipeline));
    }
  }, [activePipeline]);

  const pipelines = useMemo(() => {
    const next = new Map<string, IndexedCrossChainPipeline>();
    for (const pipeline of [
      livePipeline,
      activePipeline ? normalizePipeline(activePipeline) : null,
      ...(recentPipelines ?? []),
    ]) {
      if (!pipeline) continue;
      next.set(pipeline.intentId, normalizePipeline(pipeline));
    }
    return [...next.values()].sort(
      (a, b) =>
        new Date(b.lastUpdatedAt).getTime() -
        new Date(a.lastUpdatedAt).getTime(),
    );
  }, [activePipeline, livePipeline, recentPipelines]);

  return (
    <section className="overflow-hidden border-[3px] border-border bg-surface shadow-[3px_3px_0_0_var(--border)]">
      <header className="panel-header">
        <div className="panel-header-block">
          <div className="panel-header-icon">
            <Activity className="h-5 w-5 text-text-primary" />
          </div>
          <div className="panel-heading">
            <p className="panel-kicker">Lifecycle</p>
            <h3 className="panel-title">Cross-Chain Status</h3>
            <p className="panel-subtitle">
              Indexed Hyperbridge and router dispatches grouped into a single
              pipeline timeline.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeTxHash && (
            <span
              className={`pill ${
                connected
                  ? "bg-accent text-accent-foreground"
                  : "bg-surface-alt text-text-secondary"
              }`}
            >
              {connected ? "live" : "polling"}
            </span>
          )}
          <span className="pill bg-surface-alt text-text-secondary">
            {pipelines.length} tracked
          </span>
        </div>
      </header>

      <div className="space-y-3 p-4">
        {!address && !activeTxHash && (
          <p className="text-[13px] text-text-muted">
            Connect a wallet or execute a tracked cross-chain intent to populate
            this panel.
          </p>
        )}

        {address && !isLoading && pipelines.length === 0 && (
          <p className="text-[13px] text-text-muted">
            No indexed cross-chain pipelines for this wallet yet. This panel
            updates once Hyperbridge or router lifecycle events hit the indexer.
          </p>
        )}

        {isLoading && pipelines.length === 0 && (
          <p className="text-[13px] text-text-muted">
            Loading indexed cross-chain pipelines…
          </p>
        )}

        {pipelines.map((pipeline) => (
          <article
            key={pipeline.intentId}
            className="space-y-3 border-[3px] border-border bg-background/80 p-4 shadow-[2px_2px_0_0_var(--border)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="retro-label text-[0.95rem] text-text-primary">
                    {pipeline.sourceChain} → {pipeline.destChain}
                  </span>
                  <span className={`pill ${statusTone(pipeline.latestStatus)}`}>
                    {pipeline.latestStatus}
                  </span>
                </div>
                <p className="text-[12px] text-text-muted">
                  Latest stage: {pipeline.latestMessageType}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-[12px] text-text-muted">
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="h-3.5 w-3.5" />
                  {new Date(pipeline.lastUpdatedAt).toLocaleString()}
                </span>
                <a
                  href={`${CHAIN.blockExplorer}/tx/${pipeline.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline-offset-2 transition-colors hover:text-text-primary hover:underline"
                >
                  Origin tx
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            <dl className="grid gap-2 text-[12px] text-text-muted md:grid-cols-3">
              <div>
                <dt className="retro-label text-[0.8rem] text-text-secondary">
                  Sender
                </dt>
                <dd className="font-mono text-text-primary">
                  {compact(pipeline.sender)}
                </dd>
              </div>
              <div>
                <dt className="retro-label text-[0.8rem] text-text-secondary">
                  Commitment
                </dt>
                <dd className="font-mono text-text-primary">
                  {compact(pipeline.commitment)}
                </dd>
              </div>
              <div>
                <dt className="retro-label text-[0.8rem] text-text-secondary">
                  Steps
                </dt>
                <dd className="font-mono text-text-primary">
                  {pipeline.steps.length}
                </dd>
              </div>
            </dl>

            <div className="space-y-2">
              {pipeline.steps.map((step) => (
                <div
                  key={step.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-[2px] border-border-subtle bg-surface px-3 py-2"
                >
                  <div className="flex items-center gap-2 text-[13px] text-text-secondary">
                    <Link2 className="h-3.5 w-3.5" />
                    <span className="font-mono text-text-primary">
                      {step.messageType}
                    </span>
                    <span className={`pill ${statusTone(step.status)}`}>
                      {step.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[12px] text-text-muted">
                    <span className="font-mono">{compact(step.txHash)}</span>
                    <span>{new Date(step.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
