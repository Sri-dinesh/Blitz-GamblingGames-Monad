"use client";

import Link from "next/link";
import { Layers3 } from "lucide-react";

export function Navigation() {
  return (
    <nav className="sticky top-0 z-50 border-b border-card-border bg-black/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2 text-white">
          <Layers3 className="h-5 w-5 text-monad-purple" />
          <span className="text-sm font-semibold tracking-[0.12em] uppercase">Blitz Games</span>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white"
          >
            Staking
          </Link>
          <Link
            href="/games"
            className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white"
          >
            Games
          </Link>
        </div>
      </div>
    </nav>
  );
}
