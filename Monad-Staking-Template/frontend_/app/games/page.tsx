import Link from "next/link";
import { ArrowRight, Bomb, Flame, Swords } from "lucide-react";
import styles from "./games.module.css";

const games = [
  {
    id: "mines",
    href: "/games/mines",
    name: "Mines",
    subtitle: "Classic mine-sweeping with custom grid and mine count",
    accent: "border-cyan-200/40",
    icon: Bomb,
  },
  {
    id: "apex",
    href: "/games/apex",
    name: "Apex",
    subtitle: "High / Low / Equal prediction with Blinder mode",
    accent: "border-orange-200/40",
    icon: Flame,
  },
  {
    id: "nft-card",
    href: "/games/nft-card",
    name: "NFT Card Duel",
    subtitle: "Real-time multiplayer card battle with attack/defend turns",
    accent: "border-lime-200/40",
    icon: Swords,
  },
];

export default function GamesHubPage() {
  return (
    <section className={`${styles.shell} px-4 py-8 sm:px-6`}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className={`${styles.glass} rounded-3xl p-6`}>
          <p className={`${styles.muted} text-xs tracking-[0.22em] uppercase`}>Blitz Arcade</p>
          <h1 className={`${styles.title} mt-2 text-3xl font-black sm:text-5xl`}>Game Lobby</h1>
          <p className={`${styles.muted} mt-3 max-w-3xl text-sm sm:text-base`}>
            Choose a game to enter its dedicated page. Wallet and transaction wiring comes after gameplay polish.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          {games.map((game) => {
            const Icon = game.icon;
            return (
              <Link
                key={game.id}
                href={game.href}
                className={`${styles.glass} ${game.accent} group rounded-3xl border p-6 transition hover:-translate-y-1 hover:border-lime-200/65`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-200/35 bg-slate-950/60">
                    <Icon className="h-5 w-5 text-cyan-100" />
                  </div>
                  <ArrowRight className="h-5 w-5 text-cyan-100 transition group-hover:translate-x-1" />
                </div>

                <h2 className="mt-4 text-2xl font-black text-white">{game.name}</h2>
                <p className={`${styles.muted} mt-2 text-sm`}>{game.subtitle}</p>

                <div className="mt-4 inline-flex rounded-full border border-cyan-200/30 bg-slate-950/60 px-3 py-1 text-xs font-semibold tracking-[0.14em] uppercase text-cyan-100">
                  Play Now
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
