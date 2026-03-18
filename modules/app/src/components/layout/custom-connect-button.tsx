"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { cn } from "@/lib/format";

const DEFAULT_CHAIN_NAME = "Polkadot Hub TestNet";

export default function CustomConnectButton() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        authenticationStatus,
        mounted,
      }) => {
        const ready = mounted && authenticationStatus !== "loading";
        const connected =
          ready &&
          !!account &&
          !!chain &&
          (!authenticationStatus || authenticationStatus === "authenticated");

        return (
          <div
            className="flex items-center gap-2"
            {...(!ready && {
              "aria-hidden": true,
              style: {
                opacity: 0,
                pointerEvents: "none",
                userSelect: "none",
              },
            })}
          >
            {connected && chain.unsupported ? (
              /* Wrong network */
              <button
                type="button"
                onClick={openChainModal}
                className={cn(
                  "h-9 rounded-none px-4 text-[14px] font-semibold transition-colors",
                  "border border-secondary bg-secondary/20 text-secondary hover:bg-secondary/30",
                )}
              >
                Wrong network
              </button>
            ) : (
              <>
                {/* Chain chip */}
                {connected ? (
                  <button
                    type="button"
                    onClick={openChainModal}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-none px-3",
                      "border border-border bg-background/80 text-[14px] font-medium text-text-primary",
                      "hover:bg-surface-hover transition-colors",
                    )}
                  >
                    {chain.hasIcon && (
                      <span
                        className="inline-flex h-5 w-5 shrink-0 overflow-hidden rounded-sm"
                        style={{ background: chain.iconBackground }}
                      >
                        {chain.iconUrl && (
                          <img
                            alt={chain.name ?? "Chain icon"}
                            src={chain.iconUrl}
                            className="h-5 w-5 object-contain"
                          />
                        )}
                      </span>
                    )}
                    <span>{chain.name}</span>
                  </button>
                ) : (
                  /* Not connected: dimmed default chain chip */
                  <div
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-none px-3",
                      "border border-border/50 bg-background/50 text-[14px] font-medium text-text-muted",
                      "select-none",
                    )}
                    aria-hidden="true"
                  >
                    <span
                      className="inline-flex h-5 w-5 shrink-0 overflow-hidden rounded-sm"
                      style={{ background: "#fff" }}
                    >
                      <img
                        alt="Polkadot"
                        src="/images/polkadot.png"
                        className="h-5 w-5 object-contain"
                      />
                    </span>
                    <span>{DEFAULT_CHAIN_NAME}</span>
                  </div>
                )}

                {/* Account chip / Connect button */}
                {connected ? (
                  <button
                    type="button"
                    onClick={openAccountModal}
                    className={cn(
                      "inline-flex h-9 items-center rounded-none px-3",
                      "border border-border bg-background/80 text-[14px] font-mono text-text-primary",
                      "hover:bg-surface-hover transition-colors",
                    )}
                  >
                    {account.displayName}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={openConnectModal}
                    className={cn(
                      "h-9 rounded-none px-4 text-[14px] font-semibold transition-colors cursor-pointer",
                      "border border-text-primary bg-text-primary text-white hover:bg-text-primary/90",
                    )}
                  >
                    Connect
                  </button>
                )}
              </>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
