import Link from "next/link";
import { ArrowRight, Trophy } from "lucide-react";

export default function SportsPage() {
  return (
    <section className="px-4 py-8 sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="rounded-3xl border border-card-border bg-card/70 p-6 shadow-2xl backdrop-blur">
          <p className="text-xs tracking-[0.22em] text-muted uppercase">Sportsbook</p>
          <h1 className="font-heading mt-2 text-3xl font-black text-white sm:text-5xl">Sports Betting Hub</h1>
          <p className="mt-3 text-sm text-muted sm:text-base">
            Start with cricket live betting and on-chain settlement flow.
          </p>
        </header>

        <Link
          href="/sports/cricket"
          className="group rounded-3xl border border-monad-purple/45 bg-monad-purple/15 p-6 transition hover:-translate-y-1 hover:bg-monad-purple/25"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-monad-purple/45 bg-black/25">
              <Trophy className="h-5 w-5 text-white" />
            </div>
            <ArrowRight className="h-5 w-5 text-white transition group-hover:translate-x-1" />
          </div>
          <h2 className="font-heading mt-4 text-2xl font-bold text-white">Cricket</h2>
          <p className="mt-2 text-sm text-muted">Live/current matches, team bets, result settlement, claim transaction.</p>
        </Link>
      </div>
    </section>
  );
}
