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
                  "retro-label h-11 rounded-none px-4 transition-colors",
                  "border-[3px] border-border bg-destructive text-primary-foreground shadow-[3px_3px_0_0_var(--border)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_0_var(--border)]",
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
                      "inline-flex h-11 max-w-[240px] items-center gap-2 rounded-none px-3",
                      "border-[3px] border-border bg-surface text-[14px] text-text-primary shadow-[3px_3px_0_0_var(--border)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_0_var(--border)]",
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
                      "inline-flex h-11 items-center gap-2 rounded-none px-3",
                      "border-[3px] border-border bg-surface-alt text-[14px] text-text-muted shadow-[3px_3px_0_0_var(--border)]",
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
                      "retro-label inline-flex h-11 items-center rounded-none px-3 text-[1rem]",
                      "border-[3px] border-border bg-secondary text-secondary-foreground shadow-[3px_3px_0_0_var(--border)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_0_var(--border)]",
                    )}
                  >
                    {account.displayName}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={openConnectModal}
                    className={cn(
                      "retro-label h-11 rounded-none px-4 text-[1rem] transition-transform cursor-pointer",
                      "border-[3px] border-border bg-primary text-primary-foreground shadow-[3px_3px_0_0_var(--border)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_0_var(--border)]",
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
