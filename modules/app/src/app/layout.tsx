import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import localFont from "next/font/local";
import { Navbar } from "@/components/layout/navbar";
import { ChatWidget } from "@/components/chat/chat-widget";
import "./globals.css";
import { Providers } from "./providers";

export const outfitFont = Outfit({
  subsets: ["latin"],
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
    <html lang="en" className={outfitFont.className}>
      <body className="min-h-screen antialiased">
        <Providers>
          <div className="flex min-h-screen flex-col">
            <Navbar />
            <main id="main-content" className="flex-1 px-5 py-4">
              {children}
            </main>
          </div>
          <ChatWidget />
        </Providers>
      </body>
    </html>
  );
}
