"use client";

import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { AgentStatus } from "@/components/agent/agent-status";
import { DecisionFeed } from "@/components/agent/decision-feed";
import { LiveEvents } from "@/components/agent/live-events";
import { InteractiveChat } from "@/components/chat/interactive-chat";
import { PageHero } from "@/components/ui/page-hero";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useAgentLog } from "@/hooks/use-agent-log";

export default function AgentPage() {
  const {
    data: decisions,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useAgentLog();

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Agent"
        title="Autonomous Console"
        description="Interactive execution chat alongside live decisions, execution cycles, and operational events from the Obidot agent."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="panel p-5">
          <p className="retro-label text-[0.9rem] text-text-primary">
            Live Demo Surface
          </p>
          <p className="mt-3 text-sm text-text-secondary">
            This page is the working Agent Kit showcase: ask for a route, review
            a streamed proposal, then approve and execute it from the browser.
          </p>
        </div>

        <div className="panel p-5">
          <p className="retro-label text-[0.9rem] text-text-primary">
            Build With obi-kit
          </p>
          <p className="mt-3 text-sm text-text-secondary">
            The package docs include the current scaffold commands, package
            roles, and quickstart flow for external developers.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/docs/agent-kit" className="btn-primary">
              Open Agent Kit Docs
            </Link>
            <Link href="/docs/agent-kit" className="btn-secondary">
              View CLI Templates
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_340px]">
        <InteractiveChat variant="page" />

        <div className="space-y-4">
          {isLoading ? (
            <PanelSkeleton rows={3} />
          ) : error ? (
            <div className="panel p-6 text-center">
              <p className="font-mono text-sm text-danger">
                Failed to load agent summary
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="btn-ghost mt-4 inline-flex items-center gap-2"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            </div>
          ) : (
            <AgentStatus
              decisionCount={decisions?.length ?? 0}
              decisions={decisions ?? []}
            />
          )}

          <LiveEvents />
        </div>
      </div>

      {isLoading ? (
        <PanelSkeleton rows={5} />
      ) : error ? (
        <div className="panel p-8 text-center">
          <p className="font-mono text-sm text-danger">
            Failed to load agent log
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="btn-ghost mt-4 inline-flex items-center gap-2"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <DecisionFeed
            decisions={decisions ?? []}
            refetch={refetch}
            isRefetching={isFetching}
          />
        </div>
      )}
    </div>
  );
}
