"use client";
import type { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryProvider } from "@/components/providers/query-provider";
import { RainbowKitClientProvider } from "@/components/providers/rainbow-provider";
import { wagmiConfig } from "@/lib/wagmi";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <WagmiProvider config={wagmiConfig}>
        <RainbowKitClientProvider>{children}</RainbowKitClientProvider>
      </WagmiProvider>
    </QueryProvider>
  );
}
