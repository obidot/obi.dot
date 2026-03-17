"use client";
import "@rainbow-me/rainbowkit/styles.css";
import { type ReactNode } from "react";
import { RainbowKitProvider, lightTheme } from "@rainbow-me/rainbowkit";

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
