"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import Link from "next/link";
import { Loader2, RefreshCcw, Trophy, Wallet } from "lucide-react";
import { useToastContext } from "@/app/contexts/ToastContext";

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  removeListener: (event: string, cb: (...args: unknown[]) => void) => void;
};

type CricketTeam = {
  name: string;
  shortName: string;
  logo: string;
};

type CricketScore = {
  inning: string;
  runs: number;
  wickets: number;
  overs: number;
};

type CricketMatch = {
  id: string;
  name: string;
  status: string;
  matchType: string;
  dateTimeGMT: string;
  venue: string;
  teams: CricketTeam[];
  score: CricketScore[];
  winner: string | null;
  isFinished: boolean;
};

type BetStatus = "open" | "won" | "lost" | "claimed";

type PlacedBet = {
  id: string;
  matchId: string;
  matchName: string;
  teamName: string;
  stake: number;
  odds: number;
  placedAt: string;
  status: BetStatus;
  txHash?: string;
};

const BETS_STORAGE_KEY = "cricket-bets-v1";
const DEFAULT_ODDS = 1.9;
const MIN_BET = 0.01;

const formatNum = (value: number) =>
  value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });

const formatDate = (value: string) => {
  if (!value) return "TBD";
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return "TBD";
  return time.toLocaleString();
};

export default function CricketSportsPage() {
  const { showError, showInfo, showSuccess } = useToastContext();

  const [matches, setMatches] = useState<CricketMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  const [stakeByMatch, setStakeByMatch] = useState<Record<string, string>>({});
  const [bets, setBets] = useState<PlacedBet[]>([]);

  const [walletAddress, setWalletAddress] = useState("");
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [claimingBetId, setClaimingBetId] = useState("");

  const ethereum =
    typeof window !== "undefined" ? ((window as Window & { ethereum?: Eip1193Provider }).ethereum ?? null) : null;

  const loadWalletState = useCallback(async () => {
    if (!ethereum) return;
    try {
      const accounts = (await ethereum.request({ method: "eth_accounts" })) as string[];
      setWalletAddress(accounts[0] ?? "");
    } catch {
      // noop
    }
  }, [ethereum]);

  const loadMatches = useCallback(async () => {
    setLoading(true);
    setErrorText("");
    try {
      const response = await fetch("/api/cricket/matches", { method: "GET", cache: "no-store" });
      const json = (await response.json()) as { matches?: CricketMatch[]; error?: string };
      setMatches(json.matches ?? []);
      if (json.error) {
        setErrorText(json.error);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch matches.";
      setErrorText(message);
      showError(message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadMatches();
    const timer = window.setInterval(loadMatches, 30000);
    return () => window.clearInterval(timer);
  }, [loadMatches]);

  useEffect(() => {
    loadWalletState();
  }, [loadWalletState]);

  useEffect(() => {
    if (!ethereum) return;

    const onAccountsChanged = (accounts: unknown) => {
      const list = Array.isArray(accounts) ? (accounts as string[]) : [];
      setWalletAddress(list[0] ?? "");
    };

    ethereum.on("accountsChanged", onAccountsChanged);
    return () => {
      ethereum.removeListener("accountsChanged", onAccountsChanged);
    };
  }, [ethereum]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(BETS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PlacedBet[];
      if (Array.isArray(parsed)) {
        setBets(parsed);
      }
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(BETS_STORAGE_KEY, JSON.stringify(bets));
  }, [bets]);

  useEffect(() => {
    if (matches.length === 0 || bets.length === 0) return;

    setBets((prev) => {
      let changed = false;
      const next = prev.map((bet) => {
        if (bet.status !== "open") return bet;
        const match = matches.find((entry) => entry.id === bet.matchId);
        if (!match || !match.isFinished || !match.winner) return bet;

        const won = match.winner.toLowerCase() === bet.teamName.toLowerCase();
        changed = true;
        return {
          ...bet,
          status: won ? "won" : "lost",
        };
      });

      return changed ? next : prev;
    });
  }, [matches, bets.length]);

  const connectWallet = async () => {
    if (!ethereum) {
      showError("Install MetaMask or another EVM wallet.");
      return;
    }

    setIsConnectingWallet(true);
    try {
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      if (accounts[0]) {
        setWalletAddress(accounts[0]);
        showSuccess("Wallet connected.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Wallet connection failed.";
      showError(message);
    } finally {
      setIsConnectingWallet(false);
    }
  };

  const placeBet = (match: CricketMatch, team: CricketTeam) => {
    if (match.isFinished) {
      showInfo("This match has already finished.");
      return;
    }

    const rawStake = stakeByMatch[match.id] ?? "";
    const stake = Number(rawStake);

    if (!Number.isFinite(stake) || stake < MIN_BET) {
      showError(`Enter a valid stake (min ${MIN_BET} MON).`);
      return;
    }

    const alreadyPlaced = bets.some((bet) => bet.matchId === match.id && bet.status === "open");
    if (alreadyPlaced) {
      showInfo("You already have an open bet for this match.");
      return;
    }

    const newBet: PlacedBet = {
      id: `BET-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      matchId: match.id,
      matchName: match.name,
      teamName: team.name,
      stake,
      odds: DEFAULT_ODDS,
      placedAt: new Date().toISOString(),
      status: "open",
    };

    setBets((prev) => [newBet, ...prev]);
    showSuccess(`Bet placed on ${team.name}.`);
  };

  const claimWinnings = async (bet: PlacedBet) => {
    if (bet.status !== "won") return;
    if (!ethereum) {
      showError("Install MetaMask or another EVM wallet.");
      return;
    }

    if (!walletAddress) {
      showInfo("Connect your wallet first.");
      return;
    }

    setClaimingBetId(bet.id);

    try {
      const provider = new ethers.BrowserProvider(ethereum as ethers.Eip1193Provider);
      const signer = await provider.getSigner();
      const recipient = await signer.getAddress();
      const memo = ethers.hexlify(ethers.toUtf8Bytes(`CRICKET_BET_WIN:${bet.id}:${bet.matchId}`));

      const tx = await signer.sendTransaction({
        to: recipient,
        value: ethers.parseEther("0"),
        data: memo,
      });

      await tx.wait();

      setBets((prev) =>
        prev.map((entry) =>
          entry.id === bet.id
            ? {
                ...entry,
                status: "claimed",
                txHash: tx.hash,
              }
            : entry,
        ),
      );

      showSuccess("Winning transaction confirmed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Claim transaction failed.";
      showError(message);
    } finally {
      setClaimingBetId("");
    }
  };

  const openBets = useMemo(() => bets.filter((bet) => bet.status === "open").length, [bets]);

  return (
    <section className="px-4 py-8 sm:px-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-3xl border border-card-border bg-card/70 p-6 shadow-2xl backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs tracking-[0.22em] text-muted uppercase">Sportsbook</p>
              <h1 className="font-heading mt-2 text-3xl font-black text-white sm:text-5xl">Cricket Betting</h1>
              <p className="mt-3 max-w-3xl text-sm text-muted sm:text-base">
                Live/current cricket matches from CricAPI. Place bets on teams and claim winnings by on-chain
                transaction once result is final.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/games"
                className="rounded-xl border border-card-border bg-black/30 px-4 py-2 text-xs font-semibold tracking-[0.14em] text-muted uppercase hover:text-white"
              >
                Games
              </Link>
              <button
                type="button"
                onClick={connectWallet}
                disabled={isConnectingWallet}
                className="inline-flex items-center gap-2 rounded-xl border border-monad-purple/55 bg-monad-purple/20 px-4 py-2 text-xs font-semibold tracking-[0.14em] text-white uppercase hover:bg-monad-purple/35 disabled:opacity-50"
              >
                {isConnectingWallet ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : "Connect Wallet"}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
            <button
              type="button"
              onClick={loadMatches}
              className="inline-flex items-center gap-1 rounded-lg border border-card-border px-3 py-1.5 hover:text-white"
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <span className="rounded-full border border-card-border px-2 py-1">Open bets: {openBets}</span>
            {errorText && <span className="rounded-full border border-red-300/40 px-2 py-1 text-red-200">{errorText}</span>}
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
          <section className="space-y-4">
            {matches.length === 0 && !loading && (
              <div className="rounded-2xl border border-card-border bg-card/60 p-5 text-sm text-muted">
                No cricket matches available right now.
              </div>
            )}

            {matches.map((match) => (
              <article key={match.id} className="rounded-2xl border border-card-border bg-card/60 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs tracking-[0.14em] text-muted uppercase">{match.matchType}</p>
                    <h2 className="font-heading mt-1 text-xl font-bold text-white">{match.name}</h2>
                    <p className="text-xs text-muted">{formatDate(match.dateTimeGMT)} • {match.venue}</p>
                  </div>
                  <div className="rounded-full border border-card-border px-3 py-1 text-xs text-muted">
                    {match.isFinished ? "Result Final" : "Open"}
                  </div>
                </div>

                <p className="mt-3 text-sm text-white">{match.status}</p>

                {match.score.length > 0 && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {match.score.map((entry) => (
                      <div key={`${match.id}-${entry.inning}`} className="rounded-xl border border-card-border bg-black/25 px-3 py-2 text-xs">
                        <p className="text-muted">{entry.inning}</p>
                        <p className="text-white">
                          {entry.runs}/{entry.wickets} ({entry.overs} ov)
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 rounded-xl border border-card-border bg-black/20 p-3">
                  <label className="text-xs text-muted uppercase">Stake (MON)</label>
                  <input
                    value={stakeByMatch[match.id] ?? ""}
                    onChange={(event) =>
                      setStakeByMatch((prev) => ({
                        ...prev,
                        [match.id]: event.target.value,
                      }))
                    }
                    type="number"
                    min={MIN_BET}
                    step="0.01"
                    placeholder="0.10"
                    className="mt-2 w-full rounded-lg border border-card-border bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-monad-purple"
                  />

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {match.teams.map((team) => (
                      <button
                        key={`${match.id}-${team.name}`}
                        type="button"
                        onClick={() => placeBet(match, team)}
                        disabled={match.isFinished}
                        className="rounded-xl border border-monad-purple/45 bg-monad-purple/20 px-3 py-2 text-left text-sm text-white hover:bg-monad-purple/30 disabled:opacity-45"
                      >
                        <p className="font-semibold">Bet on {team.shortName}</p>
                        <p className="text-xs text-muted">Odds {DEFAULT_ODDS.toFixed(2)}x</p>
                      </button>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </section>

          <aside className="rounded-2xl border border-card-border bg-card/60 p-4">
            <h3 className="font-heading text-lg font-bold text-white">My Bets</h3>
            <div className="mt-3 space-y-2">
              {bets.length === 0 && <p className="text-xs text-muted">No bets yet.</p>}

              {bets.map((bet) => {
                const payout = bet.stake * bet.odds;
                return (
                  <div key={bet.id} className="rounded-xl border border-card-border bg-black/30 p-3 text-xs">
                    <p className="font-semibold text-white">{bet.matchName}</p>
                    <p className="mt-1 text-muted">Team: {bet.teamName}</p>
                    <p className="text-muted">Stake: {formatNum(bet.stake)} MON</p>
                    <p className="text-muted">Potential: {formatNum(payout)} MON</p>
                    <p className="mt-1 text-white uppercase">{bet.status}</p>

                    {bet.status === "won" && (
                      <button
                        type="button"
                        onClick={() => claimWinnings(bet)}
                        disabled={claimingBetId === bet.id}
                        className="mt-2 inline-flex items-center gap-2 rounded-lg border border-lime-300/60 bg-lime-400/20 px-3 py-1.5 text-xs font-semibold text-lime-100 disabled:opacity-60"
                      >
                        {claimingBetId === bet.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trophy className="h-3.5 w-3.5" />}
                        Claim Winnings Tx
                      </button>
                    )}

                    {bet.status === "claimed" && bet.txHash && (
                      <p className="mt-2 break-all text-[11px] text-lime-200">Tx: {bet.txHash}</p>
                    )}

                    <p className="mt-2 text-[11px] text-muted">{formatDate(bet.placedAt)}</p>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
