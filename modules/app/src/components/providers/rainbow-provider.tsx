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
        accentColor: "#ff4fa3",
        accentColorForeground: "#180d16",
        borderRadius: "medium",
        overlayBlur: "small",
      })}
    >
      {children}
    </RainbowKitProvider>
  );
}
