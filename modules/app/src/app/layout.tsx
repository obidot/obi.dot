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
          <a href="#main-content" className="skip-nav">
            Skip to main content
          </a>
          <div className="flex min-h-screen flex-col">
            <Sidebar />
            <Header />
            <main id="main-content" className="flex-1 px-5 py-4">{children}</main>
          </div>
          <ChatWidget />
        </Providers>
      </body>
    </html>
  );
}
