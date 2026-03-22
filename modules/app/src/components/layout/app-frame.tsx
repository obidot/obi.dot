"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const Navbar = dynamic(() => import("./navbar"), {
  ssr: false,
});

export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-[1600px] flex-1 px-4 py-5 lg:px-6 lg:py-6"
      >
        {children}
      </main>
    </div>
  );
}
