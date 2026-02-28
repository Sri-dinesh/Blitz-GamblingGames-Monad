"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ethers } from "ethers";
import { Bomb, EyeOff, Flame, RefreshCcw } from "lucide-react";
import styles from "../games.module.css";
import { useToastContext } from "@/app/contexts/ToastContext";
import { ADMIN_TREASURY_ADDRESS } from "@/app/config/game_betting_config";

type Cell = {
  isMine: boolean;
  isRevealed: boolean;
};

type ApexChoice = "high" | "low" | "equal";
type ApexPhase = "predict" | "resolved";
type GameType = "mines" | "apex";
type RoundOutcome = {
  id: number;
  result: "win" | "lose";
  game: GameType;
  amount: number;
  message: string;
} | null;

type GameExperienceProps = {
  game: GameType;
};

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  removeListener: (event: string, cb: (...args: unknown[]) => void) => void;
};

const GRID_OPTIONS = [4, 5, 6, 7];
const MIN_STAKE = 0.01;
const DEFAULT_STAKE = 0.1;
const DEFAULT_GRID = 5;
const DEFAULT_MINES = 5;

const createShuffledMineIndices = (cellCount: number, mines: number): Set<number> => {
  const indexes = Array.from({ length: cellCount }, (_, i) => i);
  for (let i = indexes.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
  }
  return new Set(indexes.slice(0, mines));
};

const buildBoard = (gridSize: number, mineCount: number): Cell[] => {
  const totalCells = gridSize * gridSize;
  const mines = createShuffledMineIndices(totalCells, mineCount);
  return Array.from({ length: totalCells }, (_, index) => ({
    isMine: mines.has(index),
    isRevealed: false,
  }));
};

const getMinesMultiplier = (gridSize: number, mineCount: number, picks: number): number => {
  if (picks === 0) return 1;
  const totalCells = gridSize * gridSize;
  const safeCells = totalCells - mineCount;
  let multiplier = 1;
  for (let i = 0; i < picks; i += 1) {
    const cellsLeft = totalCells - i;
    const safeLeft = safeCells - i;
    multiplier *= cellsLeft / safeLeft;
  }
  return Math.max(1, multiplier * 0.97);
};

const getRandomApexValue = () => Math.floor(Math.random() * 13) + 1;

const decideApexWin = (current: number, next: number, choice: ApexChoice) => {
  if (choice === "equal") return current === next;
  if (choice === "high") return next > current;
  return next < current;
};

const getApexMultiplier = (choice: ApexChoice): number => {
  if (choice === "equal") return 10;
  return 1.95;
};

const formatAmount = (value: number) =>
  value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });

export default function GameExperience({ game }: GameExperienceProps) {
  const { showError, showSuccess } = useToastContext();
  const [stake, setStake] = useState<number>(DEFAULT_STAKE);
  const [walletAddress, setWalletAddress] = useState("");
  const [isLossTransferPending, setIsLossTransferPending] = useState(false);

  const [gridSize, setGridSize] = useState<number>(DEFAULT_GRID);
  const [mineCount, setMineCount] = useState<number>(DEFAULT_MINES);
  const [board, setBoard] = useState<Cell[]>(() => buildBoard(DEFAULT_GRID, DEFAULT_MINES));
  const [safePicks, setSafePicks] = useState(0);
  const [minesState, setMinesState] = useState<"playing" | "won" | "lost">("playing");
  const [minesMessage, setMinesMessage] = useState("Tap tiles. Cash out before you hit a mine.");

  const [apexCurrent, setApexCurrent] = useState<number>(getRandomApexValue());
  const [apexNext, setApexNext] = useState<number | null>(null);
  const [apexBlinder, setApexBlinder] = useState(false);
  const [apexChoice, setApexChoice] = useState<ApexChoice | null>(null);
  const [apexResult, setApexResult] = useState<"idle" | "win" | "lose">("idle");
  const [apexPhase, setApexPhase] = useState<ApexPhase>("predict");
  const [apexMessage, setApexMessage] = useState("Predict where the next number goes.");
  const [apexStreak, setApexStreak] = useState(0);

  const [roundOutcome, setRoundOutcome] = useState<RoundOutcome>(null);
  const outcomeIdRef = useRef(1);
  const ethereum =
    typeof window !== "undefined" ? ((window as Window & { ethereum?: Eip1193Provider }).ethereum ?? null) : null;

  const maxMines = useMemo(() => gridSize * gridSize - 1, [gridSize]);
  const minesMultiplier = useMemo(
    () => getMinesMultiplier(gridSize, mineCount, safePicks),
    [gridSize, mineCount, safePicks],
  );
  const minesPotentialPayout = useMemo(() => stake * minesMultiplier, [stake, minesMultiplier]);
  const confettiPieces = useMemo(() => Array.from({ length: 32 }, (_, index) => index), []);
  const blastSparks = useMemo(() => Array.from({ length: 16 }, (_, index) => index), []);

  const openResultModal = (payload: Exclude<RoundOutcome, null>) => {
    setRoundOutcome(payload);
  };

  const connectWallet = async () => {
    if (!ethereum) {
      showError("Install MetaMask or another EVM wallet.");
      return;
    }
    try {
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      setWalletAddress(accounts[0] ?? "");
      if (accounts[0]) showSuccess("Wallet connected.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Wallet connection failed.";
      showError(message);
    }
  };

  const transferLossToTreasury = async (label: "MINES" | "APEX") => {
    if (!ethereum) {
      showError("Install MetaMask to process stake transfer.");
      return;
    }
    if (!ADMIN_TREASURY_ADDRESS) {
      showError("Admin treasury address is missing. Set NEXT_PUBLIC_ADMIN_TREASURY_ADDRESS.");
      return;
    }
    if (!ethers.isAddress(ADMIN_TREASURY_ADDRESS)) {
      showError("Admin treasury address is invalid.");
      return;
    }
    setIsLossTransferPending(true);
    try {
      const provider = new ethers.BrowserProvider(ethereum as ethers.Eip1193Provider);
      const signer = await provider.getSigner();
      const tx = await signer.sendTransaction({
        to: ADMIN_TREASURY_ADDRESS,
        value: ethers.parseEther(stake.toString()),
        data: ethers.hexlify(ethers.toUtf8Bytes(`SINGLE_${label}_LOSS`)),
      });
      await tx.wait();
      showSuccess(`${label} loss stake transferred to admin wallet.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Loss transfer failed.";
      showError(message);
    } finally {
      setIsLossTransferPending(false);
    }
  };

  const nextOutcomeId = () => {
    const id = outcomeIdRef.current;
    outcomeIdRef.current += 1;
    return id;
  };

  useEffect(() => {
    if (!roundOutcome) return;
    const timer = window.setTimeout(() => setRoundOutcome(null), 2900);
    return () => window.clearTimeout(timer);
  }, [roundOutcome]);

  useEffect(() => {
    if (!ethereum) return;
    const load = async () => {
      try {
        const accounts = (await ethereum.request({ method: "eth_accounts" })) as string[];
        setWalletAddress(accounts[0] ?? "");
      } catch {
        // noop
      }
    };
    void load();
    const onAccountsChanged = (accounts: unknown) => {
      const list = Array.isArray(accounts) ? (accounts as string[]) : [];
      setWalletAddress(list[0] ?? "");
    };
    ethereum.on("accountsChanged", onAccountsChanged);
    return () => {
      ethereum.removeListener("accountsChanged", onAccountsChanged);
    };
  }, [ethereum]);

  const newMinesRound = (nextGrid = gridSize, nextMines = mineCount) => {
    setBoard(buildBoard(nextGrid, nextMines));
    setSafePicks(0);
    setMinesState("playing");
    setMinesMessage("Tap tiles. Cash out before you hit a mine.");
  };

  const revealAllMinesBoard = (targetBoard: Cell[]) =>
    targetBoard.map((cell) => (cell.isMine ? { ...cell, isRevealed: true } : cell));

  const onCellClick = (index: number) => {
    if (minesState !== "playing") return;
    const cell = board[index];
    if (!cell || cell.isRevealed) return;

    if (cell.isMine) {
      const revealed = revealAllMinesBoard(
        board.map((entry, i) => (i === index ? { ...entry, isRevealed: true } : entry)),
      );
      setBoard(revealed);
      setMinesState("lost");
      setMinesMessage("Boom. Round lost. Start again.");
      void transferLossToTreasury("MINES");
      openResultModal({
        id: nextOutcomeId(),
        result: "lose",
        game: "mines",
        amount: stake,
        message: "Mine exploded. Better luck next run.",
      });
      return;
    }

    const updated = board.map((entry, i) => (i === index ? { ...entry, isRevealed: true } : entry));
    const nextSafePicks = safePicks + 1;
    const safeCells = gridSize * gridSize - mineCount;
    setBoard(updated);
    setSafePicks(nextSafePicks);

    if (nextSafePicks >= safeCells) {
      setMinesState("won");
      setMinesMessage("Board cleared. Perfect run.");
      const clearedPayout = stake * getMinesMultiplier(gridSize, mineCount, nextSafePicks);
      openResultModal({
        id: nextOutcomeId(),
        result: "win",
        game: "mines",
        amount: clearedPayout,
        message: "Perfect clear. You swept the board.",
      });
      return;
    }

    setMinesMessage("Safe pick. Press your luck or cash out.");
  };

  const cashOutMines = () => {
    if (safePicks === 0 || minesState !== "playing") return;
    setMinesState("won");
    setMinesMessage(`Cashed out at ${minesMultiplier.toFixed(2)}x.`);
    openResultModal({
      id: nextOutcomeId(),
      result: "win",
      game: "mines",
      amount: minesPotentialPayout,
      message: `Cash out secured at ${minesMultiplier.toFixed(2)}x.`,
    });
  };

  const resetApexRound = () => {
    setApexCurrent(getRandomApexValue());
    setApexNext(null);
    setApexChoice(null);
    setApexResult("idle");
    setApexPhase("predict");
    setApexMessage("Predict where the next number goes.");
  };

  const playApex = (choice: ApexChoice) => {
    if (apexPhase !== "predict") return;
    const next = getRandomApexValue();
    const win = decideApexWin(apexCurrent, next, choice);
    setApexChoice(choice);
    setApexNext(next);
    setApexResult(win ? "win" : "lose");
    setApexPhase("resolved");
    setApexMessage(
      win
        ? `Round ended: HIT. ${choice.toUpperCase()} paid ${getApexMultiplier(choice).toFixed(2)}x.`
        : `Round ended: MISS. You lost ${formatAmount(stake)} MON.`,
    );
    setApexStreak((prev) => (win ? prev + 1 : 0));
    if (!win) {
      void transferLossToTreasury("APEX");
    }
    openResultModal({
      id: nextOutcomeId(),
      result: win ? "win" : "lose",
      game: "apex",
      amount: win ? stake * getApexMultiplier(choice) : stake,
      message: win ? `Apex ${choice.toUpperCase()} hit.` : "Apex prediction missed.",
    });
  };

  const startNextApexRound = () => {
    setApexCurrent(apexNext ?? getRandomApexValue());
    setApexNext(null);
    setApexChoice(null);
    setApexResult("idle");
    setApexPhase("predict");
    setApexMessage("New round started. Predict again.");
  };

  const apexPotentialPayout = useMemo(() => {
    if (!apexChoice) return stake * 1.95;
    return stake * getApexMultiplier(apexChoice);
  }, [apexChoice, stake]);

  const apexLabel = apexResult === "idle" ? "Ready" : apexResult === "win" ? "Win" : "Lose";
  const stakeInputValue = Number.isFinite(stake) ? String(stake) : String(DEFAULT_STAKE);
  const modalTitle = roundOutcome?.result === "win" ? "JACKPOT HIT" : "ROUND BUSTED";
  const modalAmountLabel = roundOutcome?.result === "win" ? "Payout" : "Loss";
  const gameTitle = game === "mines" ? "Mines Game" : "Apex Game";

  return (
    <section className={`${styles.shell} px-4 py-8 sm:px-6`}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className={`${styles.glass} rounded-3xl p-6`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className={`${styles.muted} text-xs tracking-[0.22em] uppercase`}>Blitz Arcade</p>
              <h1 className={`${styles.title} mt-2 text-3xl font-black sm:text-5xl`}>{gameTitle}</h1>
              <p className={`${styles.muted} mt-3 max-w-3xl text-sm sm:text-base`}>
                Gameplay first. Wallet and transactions will be integrated after UX flow and game behavior are final.
              </p>
            </div>
            <Link
              href="/games"
              className="rounded-xl border border-cyan-200/35 bg-slate-950/50 px-4 py-2 text-xs font-semibold tracking-[0.14em] uppercase text-cyan-100 hover:border-cyan-100"
            >
              All Games
            </Link>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_2fr]">
          <aside className={`${styles.glass} space-y-4 rounded-3xl p-5`}>
            <p className={`${styles.muted} text-xs tracking-[0.18em] uppercase`}>Round Setup</p>
            <button
              type="button"
              onClick={connectWallet}
              className="w-full rounded-xl border border-cyan-300/40 bg-slate-900/70 px-3 py-2 text-left text-xs font-semibold text-cyan-100"
            >
              {walletAddress
                ? `Wallet: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
                : "Connect Wallet"}
            </button>
            {isLossTransferPending && (
              <p className="text-xs text-orange-200">Processing loss stake transfer to admin wallet...</p>
            )}
            <label className="block text-sm text-white">
              Stake (MON)
              <input
                type="number"
                min={MIN_STAKE}
                step={0.01}
                value={stakeInputValue}
                onChange={(event) => setStake(Math.max(MIN_STAKE, Number(event.target.value) || MIN_STAKE))}
                className="mt-2 w-full rounded-xl border border-cyan-300/30 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none focus:border-lime-300/60"
              />
            </label>

            {game === "mines" ? (
              <div className="space-y-3">
                <label className="block text-sm text-white">
                  Grid Size
                  <select
                    value={gridSize}
                    onChange={(event) => {
                      const nextGrid = Number(event.target.value);
                      const safeMineCount = Math.min(mineCount, nextGrid * nextGrid - 1);
                      setGridSize(nextGrid);
                      setMineCount(safeMineCount);
                      newMinesRound(nextGrid, safeMineCount);
                    }}
                    className="mt-2 w-full rounded-xl border border-cyan-300/30 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none focus:border-cyan-200/60"
                  >
                    {GRID_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {value} x {value}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm text-white">
                  Mines ({mineCount})
                  <input
                    type="range"
                    min={1}
                    max={maxMines}
                    value={mineCount}
                    onChange={(event) => {
                      const nextMines = Number(event.target.value);
                      setMineCount(nextMines);
                      newMinesRound(gridSize, nextMines);
                    }}
                    className="mt-3 w-full accent-orange-300"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className={`${styles.chip} rounded-xl px-3 py-2`}>
                    <p className={styles.muted}>Multiplier</p>
                    <p className="mt-1 text-base font-bold text-lime-300">{minesMultiplier.toFixed(2)}x</p>
                  </div>
                  <div className={`${styles.chip} rounded-xl px-3 py-2`}>
                    <p className={styles.muted}>Potential</p>
                    <p className="mt-1 text-base font-bold text-cyan-100">{formatAmount(minesPotentialPayout)} MON</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setApexBlinder((prev) => !prev)}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${
                    apexBlinder
                      ? "bg-orange-300/20 text-orange-100 ring-1 ring-orange-200/60"
                      : "bg-slate-900/60 text-slate-300"
                  }`}
                >
                  <EyeOff className="h-4 w-4" />
                  Blinder Mode {apexBlinder ? "ON" : "OFF"}
                </button>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className={`${styles.chip} rounded-xl px-3 py-2`}>
                    <p className={styles.muted}>Streak</p>
                    <p className="mt-1 text-base font-bold text-lime-300">{apexStreak}</p>
                  </div>
                  <div className={`${styles.chip} rounded-xl px-3 py-2`}>
                    <p className={styles.muted}>Potential</p>
                    <p className="mt-1 text-base font-bold text-cyan-100">{formatAmount(apexPotentialPayout)} MON</p>
                  </div>
                </div>
              </div>
            )}
          </aside>

          {game === "mines" ? (
            <div className={`${styles.glass} rounded-3xl p-5`}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Bomb className="h-5 w-5 text-orange-300" />
                  <h2 className="text-xl font-bold text-white">Mines Game</h2>
                </div>
                <div
                  className={`${styles.chip} ${minesState === "playing" ? styles.pulse : ""} rounded-full px-3 py-1 text-xs tracking-wider uppercase`}
                >
                  {minesState}
                </div>
              </div>

              <p className={`${styles.muted} mb-4 text-sm`}>{minesMessage}</p>
              {minesState !== "playing" && (
                <div className="mb-4 rounded-xl border border-cyan-200/20 bg-slate-900/45 px-3 py-2 text-xs font-semibold tracking-wider uppercase text-cyan-100">
                  Round Ended: {minesState === "won" ? `Won ${formatAmount(minesPotentialPayout)} MON (simulated)` : `Lost ${formatAmount(stake)} MON (simulated)`}
                </div>
              )}

              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
                }}
              >
                {board.map((cell, index) => {
                  const isLostMineVisible = minesState === "lost" && cell.isMine;
                  const cellClass = cell.isRevealed
                    ? cell.isMine
                      ? styles.mine
                      : styles.safe
                    : styles.hidden;

                  return (
                    <button
                      key={`${index}-${cell.isMine ? "m" : "s"}`}
                      type="button"
                      onClick={() => onCellClick(index)}
                      className={`${styles.boardCell} ${cellClass} flex items-center justify-center text-sm font-bold text-white`}
                      disabled={cell.isRevealed || minesState !== "playing"}
                    >
                      {cell.isRevealed ? (
                        cell.isMine ? (
                          <Bomb className="h-4 w-4 text-orange-100" />
                        ) : (
                          <Image
                            src="/monad-token.svg"
                            alt="Safe tile"
                            width={16}
                            height={16}
                            className="h-4 w-4"
                          />
                        )
                      ) : isLostMineVisible ? (
                        <Bomb className="h-4 w-4 text-orange-100" />
                      ) : (
                        "?"
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={cashOutMines}
                  disabled={safePicks === 0 || minesState !== "playing"}
                  className="rounded-xl bg-lime-300/20 px-4 py-2 text-sm font-semibold text-lime-100 ring-1 ring-lime-200/50 disabled:opacity-40"
                >
                  Cash Out
                </button>
                <button
                  type="button"
                  onClick={() => newMinesRound()}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900/70 px-4 py-2 text-sm font-semibold text-slate-100 ring-1 ring-cyan-300/35"
                >
                  <RefreshCcw className="h-4 w-4" />
                  New Round
                </button>
              </div>
            </div>
          ) : (
            <div className={`${styles.glass} rounded-3xl p-5`}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Flame className="h-5 w-5 text-orange-300" />
                  <h2 className="text-xl font-bold text-white">Apex Game</h2>
                </div>
                <div className={`${styles.chip} rounded-full px-3 py-1 text-xs tracking-wider uppercase`}>
                  {apexPhase === "resolved" ? "Round Ended" : apexLabel}
                </div>
              </div>

              <p className={`${styles.muted} mb-4 text-sm`}>{apexMessage}</p>
              {apexPhase === "resolved" && (
                <div className="mb-4 rounded-xl border border-cyan-200/20 bg-slate-900/45 px-3 py-2 text-xs font-semibold tracking-wider uppercase text-cyan-100">
                  Round Ended: {apexResult === "win" ? `Won ${formatAmount(apexPotentialPayout)} MON (simulated)` : `Lost ${formatAmount(stake)} MON (simulated)`}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-cyan-200/20 bg-slate-900/45 p-4">
                  <p className={`${styles.muted} text-xs tracking-[0.12em] uppercase`}>Current Number</p>
                  <p className="mt-2 text-5xl font-black text-cyan-100">{apexBlinder ? "?" : apexCurrent}</p>
                </div>
                <div className="rounded-2xl border border-orange-200/20 bg-slate-900/45 p-4">
                  <p className={`${styles.muted} text-xs tracking-[0.12em] uppercase`}>Last Reveal</p>
                  <p className="mt-2 text-5xl font-black text-orange-100">{apexNext ?? "-"}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => playApex("low")}
                  disabled={apexPhase !== "predict"}
                  className="rounded-xl bg-slate-900/70 px-4 py-2 text-sm font-semibold text-cyan-100 ring-1 ring-cyan-300/40 hover:bg-cyan-300/10 disabled:opacity-40"
                >
                  LOW
                </button>
                <button
                  type="button"
                  onClick={() => playApex("equal")}
                  disabled={apexPhase !== "predict"}
                  className="rounded-xl bg-slate-900/70 px-4 py-2 text-sm font-semibold text-orange-100 ring-1 ring-orange-300/40 hover:bg-orange-300/10 disabled:opacity-40"
                >
                  EQUAL
                </button>
                <button
                  type="button"
                  onClick={() => playApex("high")}
                  disabled={apexPhase !== "predict"}
                  className="rounded-xl bg-slate-900/70 px-4 py-2 text-sm font-semibold text-lime-100 ring-1 ring-lime-300/40 hover:bg-lime-300/10 disabled:opacity-40"
                >
                  HIGH
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={startNextApexRound}
                  disabled={apexPhase !== "resolved"}
                  className="inline-flex items-center gap-2 rounded-xl bg-lime-300/20 px-4 py-2 text-sm font-semibold text-lime-100 ring-1 ring-lime-200/50 disabled:opacity-40"
                >
                  Next Round
                </button>
                <button
                  type="button"
                  onClick={resetApexRound}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900/70 px-4 py-2 text-sm font-semibold text-slate-100 ring-1 ring-cyan-300/35"
                >
                  <RefreshCcw className="h-4 w-4" />
                  Reset Apex
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {roundOutcome && (
        <div className={styles.resultOverlay}>
          <div
            className={`${styles.resultCard} ${roundOutcome.result === "win" ? styles.resultWin : styles.resultLose} p-6 sm:p-8`}
            role="dialog"
            aria-modal="true"
            aria-label="Round result"
          >
            {roundOutcome.result === "win" ? (
              <div className={styles.confettiField} aria-hidden="true">
                {confettiPieces.map((piece) => {
                  const seed = roundOutcome.id + piece * 37;
                  const x = 4 + ((seed * 17) % 92);
                  const hue = (seed * 29) % 360;
                  const rotation = ((seed * 11) % 100) - 50;
                  const duration = 1.2 + ((seed * 7) % 14) / 10;
                  const delay = ((seed * 3) % 6) / 20;
                  return (
                    <span
                      key={`confetti-${piece}`}
                      className={styles.confettiPiece}
                      style={
                        {
                          "--x": x,
                          "--h": hue,
                          "--r": rotation,
                          "--d": duration,
                          "--delay": delay,
                        } as CSSProperties
                      }
                    />
                  );
                })}
              </div>
            ) : (
              <div className={styles.blastField} aria-hidden="true">
                <span className={styles.blastRing} />
                <span className={`${styles.blastRing} ${styles.blastRingAlt}`} />
                {blastSparks.map((spark) => {
                  const angle = (360 / blastSparks.length) * spark;
                  return (
                    <span
                      key={`spark-${spark}`}
                      className={styles.spark}
                      style={{ "--a": angle } as CSSProperties}
                    />
                  );
                })}
              </div>
            )}

            <div className="relative z-10">
              <p className={`${styles.muted} text-xs tracking-[0.22em] uppercase`}>{roundOutcome.game} result</p>
              <h3 className="mt-2 text-3xl font-black text-white sm:text-4xl">{modalTitle}</h3>
              <p className="mt-2 text-sm text-cyan-100">{roundOutcome.message}</p>

              <div className="mt-4 inline-flex rounded-full border border-cyan-200/30 bg-slate-950/60 px-4 py-2 text-sm text-white">
                {modalAmountLabel}: {formatAmount(roundOutcome.amount)} MON
              </div>

              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setRoundOutcome(null)}
                  className="rounded-xl bg-slate-900/70 px-4 py-2 text-sm font-semibold text-slate-100 ring-1 ring-cyan-300/35"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
