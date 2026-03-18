"use client";
import { WagmiProvider } from "wagmi";
import { type ReactNode } from "react";
import { wagmiConfig } from "@/lib/wagmi";
import { QueryProvider } from "@/components/providers/query-provider";
import { RainbowKitClientProvider } from "@/components/providers/rainbow-provider";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryProvider>
        <RainbowKitClientProvider>{children}</RainbowKitClientProvider>
      </QueryProvider>
    </WagmiProvider>
  );
}
