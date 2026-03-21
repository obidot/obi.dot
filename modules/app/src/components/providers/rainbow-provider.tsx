"use client";
import "@rainbow-me/rainbowkit/styles.css";
import { lightTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import type { ReactNode } from "react";

export function RainbowKitClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <RainbowKitProvider
      theme={lightTheme({
        accentColor: "#00ff88",
        accentColorForeground: "#0a0a0f",
        borderRadius: "medium",
        overlayBlur: "small",
      })}
    >
      {children}
    </RainbowKitProvider>
  );
}
