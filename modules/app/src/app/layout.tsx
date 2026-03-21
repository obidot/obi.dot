import type { Metadata } from "next";
import { VT323 } from "next/font/google";
import localFont from "next/font/local";
import { ChatWidget } from "@/components/chat/chat-widget";
import Navbar from "@/components/layout/navbar";
import "./globals.css";
import { cn } from "@/lib/utils";
import Providers from "./providers";

export const displayFont = VT323({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
});

export const atlasFont = localFont({
  src: "../../public/fonts/Atlas-Typewriter-Web-Regular.ttf",
  variable: "--font-atlas",
});

export const metadata: Metadata = {
  title: "Obidot - Optimized Liquidity Across Polkadot Hub",
  description: "",
  icons: { icon: "/images/logo.png" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      // Restore the previous palette by switching this to data-theme="retro-classic".
      data-theme="obidot-polkadot"
      className={cn(
        "antialiased",
        atlasFont.className,
        atlasFont.variable,
        displayFont.variable,
      )}
    >
      <body className="min-h-screen antialiased">
        <a href="#main-content" className="skip-nav">
          Skip to content
        </a>
        <Providers>
          <div className="flex min-h-screen flex-col">
            <Navbar />
            <main
              id="main-content"
              className="mx-auto flex w-full max-w-[1600px] flex-1 px-4 py-5 lg:px-6 lg:py-6"
            >
              {children}
            </main>
          </div>
          <ChatWidget />
        </Providers>
      </body>
    </html>
  );
}
