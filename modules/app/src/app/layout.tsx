import type { Metadata } from "next";
import { Providers } from "@/components/providers/query-provider";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { ChatWidget } from "@/components/chat/chat-widget";
import "./globals.css";

export const metadata: Metadata = {
  title: "Obidot — Autonomous Cross-Chain Finance",
  description:
    "AI-powered ERC-4626 vault on Polkadot Hub that autonomously routes funds across parachains for optimal yield.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <Providers>
          <div className="flex min-h-screen">
            {/* Sidebar */}
            <Sidebar />

            {/* Main content */}
            <div className="ml-60 flex flex-1 flex-col">
              <Header />
              <main className="flex-1 p-6">{children}</main>
            </div>
          </div>
          <ChatWidget />
        </Providers>
      </body>
    </html>
  );
}
