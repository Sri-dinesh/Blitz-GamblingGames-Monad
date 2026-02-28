"use client";

import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { House, RotateCcw, Shield, Sword, Users, Wifi, WifiOff } from "lucide-react";
import styles from "../games.module.css";

import AceImg from "@/assets/Ace.png";
import BlackSolusImg from "@/assets/Black_Solus.png";
import CalligrapherImg from "@/assets/Calligrapher.png";
import JadeMonkImg from "@/assets/Jade_Monk.png";
import KataraImg from "@/assets/Katara.png";
import ScarletViperImg from "@/assets/Scarlet_Viper.png";
import StormKageImg from "@/assets/Storm_Kage.png";
import TwilightFoxImg from "@/assets/Twilight_Fox.png";
import VoidTalonImg from "@/assets/Void_Talon.png";
import XhoImg from "@/assets/Xho.png";

import AstralBg from "@/assets/background/astral.jpg";
import EoaAlienBg from "@/assets/background/eoaalien.jpg";
import HeroBg from "@/assets/background/hero-img.jpg";
import LandingBg from "@/assets/background/landing.jpg";
import PaNightBg from "@/assets/background/panight.jpg";
import SaimanBg from "@/assets/background/saiman.jpg";

type CardDef = {
  id: string;
  name: string;
  image: StaticImageData;
};

type BgDef = {
  id: string;
  name: string;
  image: StaticImageData;
};

type SessionPlayer = {
  id: string;
  name: string;
  hp: number;
  cardId: string | null;
  ready: boolean;
  guard: boolean;
  backgroundId: string;
  connected: boolean;
};

type SessionState = {
  id: string;
  status: "waiting" | "active" | "ended";
  winnerId: string | null;
  currentTurnPlayerId: string | null;
  turn: number;
  lastAction: string;
  log: string[];
  players: SessionPlayer[];
};

type WsPayload = {
  type: string;
  message?: string;
  sessionId?: string;
  you?: string;
  session?: SessionState;
};

const CARDS: CardDef[] = [
  { id: "ace", name: "Ace", image: AceImg },
  { id: "black-solus", name: "Black Solus", image: BlackSolusImg },
  { id: "calligrapher", name: "Calligrapher", image: CalligrapherImg },
  { id: "jade-monk", name: "Jade Monk", image: JadeMonkImg },
  { id: "katara", name: "Katara", image: KataraImg },
  { id: "scarlet-viper", name: "Scarlet Viper", image: ScarletViperImg },
  { id: "storm-kage", name: "Storm Kage", image: StormKageImg },
  { id: "twilight-fox", name: "Twilight Fox", image: TwilightFoxImg },
  { id: "void-talon", name: "Void Talon", image: VoidTalonImg },
  { id: "xho", name: "Xho", image: XhoImg },
];

const BACKGROUNDS: BgDef[] = [
  { id: "astral", name: "Astral", image: AstralBg },
  { id: "eoaalien", name: "EOA Alien", image: EoaAlienBg },
  { id: "hero-img", name: "Hero", image: HeroBg },
  { id: "landing", name: "Landing", image: LandingBg },
  { id: "panight", name: "PA Night", image: PaNightBg },
  { id: "saiman", name: "Saiman", image: SaimanBg },
];

const WS_DEFAULT_URL = "ws://localhost:8081";
const HP_SEGMENTS = 20;

const cardById = new Map(CARDS.map((card) => [card.id, card]));
const bgById = new Map(BACKGROUNDS.map((bg) => [bg.id, bg]));

const getHpSegments = (hp: number) => {
  const count = Math.max(0, Math.min(HP_SEGMENTS, Math.ceil(hp / (100 / HP_SEGMENTS))));
  return Array.from({ length: HP_SEGMENTS }, (_, idx) => idx < count);
};

export default function NftCardGamePage() {
  const [playerName, setPlayerName] = useState("Player");
  const [joinSessionId, setJoinSessionId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [wsUrl, setWsUrl] = useState(WS_DEFAULT_URL);

  const [connected, setConnected] = useState(false);
  const [myPlayerId, setMyPlayerId] = useState("");
  const [session, setSession] = useState<SessionState | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedBgId, setSelectedBgId] = useState<string>(BACKGROUNDS[0].id);
  const [statusText, setStatusText] = useState("Connect to WebSocket server to begin.");
  const [resultOpen, setResultOpen] = useState(false);
  const [resultSeed, setResultSeed] = useState(1);

  const socketRef = useRef<WebSocket | null>(null);
  const lastEndedTurnRef = useRef<number | null>(null);

  const myPlayer = useMemo(
    () => session?.players.find((player) => player.id === myPlayerId) ?? null,
    [session, myPlayerId],
  );

  const opponent = useMemo(
    () => session?.players.find((player) => player.id !== myPlayerId) ?? null,
    [session, myPlayerId],
  );

  const isBattleMode = session?.status === "active" || session?.status === "ended";

  const activeBackground = useMemo(() => {
    const source = bgById.get(myPlayer?.backgroundId || selectedBgId) ?? BACKGROUNDS[0];
    return source.image.src;
  }, [myPlayer?.backgroundId, selectedBgId]);

  const canAct =
    !!session &&
    session.status === "active" &&
    session.currentTurnPlayerId === myPlayerId &&
    !!myPlayer &&
    !!opponent;
  const canSendAction = !!session && session.status === "active" && !!myPlayer && !!opponent;
  const confettiPieces = useMemo(() => Array.from({ length: 30 }, (_, idx) => idx), []);
  const blastSparks = useMemo(() => Array.from({ length: 14 }, (_, idx) => idx), []);

  const myCard = myPlayer?.cardId ? cardById.get(myPlayer.cardId) : null;
  const opponentCard = opponent?.cardId ? cardById.get(opponent.cardId) : null;
  const winnerName = session?.players.find((player) => player.id === session.winnerId)?.name;
  const didIWin = !!session && session.status === "ended" && session.winnerId === myPlayerId;
  const didILose = !!session && session.status === "ended" && !!session.winnerId && session.winnerId !== myPlayerId;

  useEffect(() => {
    return () => {
      socketRef.current?.close();
    };
  }, []);

  const sendEvent = (payload: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(payload));
  };

  const connectSocket = () => {
    socketRef.current?.close();
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      setConnected(true);
      setStatusText("Connected. Create or join a session.");
    };

    socket.onclose = () => {
      setConnected(false);
      setStatusText("Disconnected from server.");
    };

    socket.onerror = () => {
      setStatusText("Socket error. Check server status and URL.");
    };

    socket.onmessage = (event) => {
      let payload: WsPayload;
      try {
        payload = JSON.parse(String(event.data));
      } catch {
        return;
      }

      if (payload.you) {
        setMyPlayerId(payload.you);
      }

      if (payload.sessionId) {
        setSessionId(payload.sessionId);
      }

      if (payload.session) {
        setSession(payload.session);
        if (payload.session.status === "ended") {
          const endKey = payload.session.turn;
          if (lastEndedTurnRef.current !== endKey) {
            lastEndedTurnRef.current = endKey;
            setResultSeed((prev) => prev + 1);
            setResultOpen(true);
          }
        } else {
          lastEndedTurnRef.current = null;
          setResultOpen(false);
        }
      }

      if (payload.type === "error") {
        setStatusText(payload.message || "Unknown error.");
      } else if (payload.type === "session_created") {
        setStatusText(`Session ${payload.sessionId} created. Share code with opponent.`);
      } else if (payload.type === "session_joined") {
        setStatusText(`Joined session ${payload.sessionId}.`);
      } else if (payload.type === "match_started") {
        setStatusText("Match started. Full battle view enabled.");
      } else if (payload.type === "match_ended") {
        const winner = payload.session?.players.find((player) => player.id === payload.session?.winnerId)?.name;
        setStatusText(`Match ended. Winner: ${winner || "Unknown"}`);
      }
    };

    socketRef.current = socket;
  };

  const createSession = () => {
    sendEvent({ type: "create_session", name: playerName });
  };

  const joinSession = () => {
    sendEvent({ type: "join_session", name: playerName, sessionId: joinSessionId });
  };

  const selectCard = (cardId: string) => {
    setSelectedCardId(cardId);
    sendEvent({ type: "select_card", cardId });
  };

  const setBackground = (backgroundId: string) => {
    setSelectedBgId(backgroundId);
    sendEvent({ type: "set_background", backgroundId });
  };

  const readyUp = () => {
    sendEvent({ type: "player_ready" });
  };

  const playAction = (action: "attack" | "defend") => {
    sendEvent({ type: "action", action });
  };

  const restartMatch = () => {
    sendEvent({ type: "restart_match" });
  };

  const renderPlayerCard = (player: SessionPlayer | null, card: CardDef | null, isOpponent: boolean) => {
    const isTurn = player?.id === session?.currentTurnPlayerId;
    const hp = player?.hp ?? 0;
    const hpCells = getHpSegments(hp);

    return (
      <div className={`${styles.arenaCardWrap} ${isOpponent ? styles.arenaOpponent : styles.arenaYou}`}>
        <div className="mb-2 text-center">
          <p className="text-xs font-bold tracking-[0.16em] uppercase text-cyan-100">{isOpponent ? "Opponent" : "You"}</p>
          <p className="text-sm font-semibold text-white">{player?.name ?? "Waiting..."}</p>
        </div>

        <div className={styles.hpRail}>
          {hpCells.map((filled, idx) => (
            <span key={`${player?.id || "p"}-${idx}`} className={`${styles.hpCell} ${filled ? styles.hpCellOn : ""}`} />
          ))}
        </div>

        <div className="mt-2 text-center text-xs text-cyan-100">
          HP {hp} / 100 {player?.guard ? "• Guard Up" : ""} {isTurn ? "• Turn" : ""}
        </div>

        <div className={styles.arenaCardFrame}>
          {card ? (
            <Image src={card.image} alt={card.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-slate-400">No card selected</div>
          )}
        </div>
      </div>
    );
  };

  if (isBattleMode) {
    return (
      <section className={styles.battleViewport}>
        <Image src={activeBackground} alt="Arena" fill className="object-cover" unoptimized priority />
        <div className={styles.battleTint} />

        <div className={styles.battleTopBar}>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/25 bg-slate-950/70 px-3 py-1 text-xs text-cyan-100">
            <Users className="h-3.5 w-3.5" />
            Session {session?.id}
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/25 bg-slate-950/70 px-3 py-1 text-xs text-cyan-100">
            Turn {session?.turn ?? 0}
          </div>
          <Link
            href="/games/nft-card"
            className="inline-flex items-center gap-2 rounded-full border border-cyan-200/25 bg-slate-950/70 px-3 py-1 text-xs text-cyan-100 hover:border-cyan-100"
          >
            <House className="h-3.5 w-3.5" />
            Lobby
          </Link>
        </div>

        <div className={styles.battleMiddleStatus}>
          {session?.status === "active"
            ? canAct
              ? "Your turn"
              : `${opponent?.name || "Opponent"}'s turn • You can prepare defense next turn`
            : `Match Ended • Winner: ${winnerName || "Unknown"}`}
        </div>

        <div className={styles.arenaUpper}>{renderPlayerCard(opponent, opponentCard ?? null, true)}</div>
        <div className={styles.arenaLower}>{renderPlayerCard(myPlayer, myCard ?? null, false)}</div>

        <button
          type="button"
          onClick={() => playAction("attack")}
          disabled={!canSendAction}
          className={`${styles.sideAction} ${styles.sideActionLeft} ${!canAct ? "opacity-45" : ""}`}
        >
          <Sword className="h-6 w-6" />
          <span>Attack</span>
        </button>

        <button
          type="button"
          onClick={() => playAction("defend")}
          disabled={!canSendAction}
          className={`${styles.sideAction} ${styles.sideActionRight} ${!canAct ? "opacity-45" : ""}`}
        >
          <Shield className="h-6 w-6" />
          <span>Defend</span>
        </button>

        {session?.status === "ended" && (
          <button
            type="button"
            onClick={restartMatch}
            className="absolute bottom-6 left-1/2 z-30 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-lime-200/40 bg-lime-300/25 px-5 py-2 text-sm font-semibold text-lime-100"
          >
            <RotateCcw className="h-4 w-4" />
            Restart Lobby
          </button>
        )}

        {resultOpen && session?.status === "ended" && (
          <div className={styles.resultOverlay}>
            <div
              className={`${styles.resultCard} ${didIWin ? styles.resultWin : styles.resultLose} p-6 sm:p-8`}
              role="dialog"
              aria-modal="true"
              aria-label="Match result"
            >
              {didIWin ? (
                <div className={styles.confettiField} aria-hidden="true">
                  {confettiPieces.map((piece) => {
                    const seed = resultSeed + piece * 43;
                    const x = 4 + ((seed * 17) % 92);
                    const hue = (seed * 31) % 360;
                    const rotation = ((seed * 13) % 100) - 50;
                    const duration = 1.15 + ((seed * 7) % 14) / 10;
                    const delay = ((seed * 5) % 6) / 20;
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
                <p className={`${styles.muted} text-xs tracking-[0.22em] uppercase`}>NFT Card Duel</p>
                <h3 className="mt-2 text-3xl font-black text-white sm:text-4xl">
                  {didIWin ? "YOU WON" : didILose ? "YOU LOST" : "MATCH ENDED"}
                </h3>
                <p className="mt-2 text-sm text-cyan-100">
                  {didIWin
                    ? "Excellent play. You dominated this duel."
                    : didILose
                      ? "Tough round. Reset and try a new strategy."
                      : `Winner: ${winnerName || "Unknown"}`}
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setResultOpen(false)}
                    className="rounded-xl bg-slate-900/70 px-4 py-2 text-sm font-semibold text-slate-100 ring-1 ring-cyan-300/35"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={restartMatch}
                    className="inline-flex items-center gap-2 rounded-xl bg-lime-300/20 px-4 py-2 text-sm font-semibold text-lime-100 ring-1 ring-lime-200/50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Play Again
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className={styles.bgDock}>
          <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-cyan-100">Background</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {BACKGROUNDS.map((bg) => {
              const isSelected = (myPlayer?.backgroundId || selectedBgId) === bg.id;
              return (
                <button
                  key={bg.id}
                  type="button"
                  onClick={() => setBackground(bg.id)}
                  className={`relative h-14 w-14 overflow-hidden rounded-lg border ${
                    isSelected ? "border-cyan-100 ring-1 ring-cyan-200/60" : "border-cyan-200/25"
                  }`}
                  title={bg.name}
                >
                  <Image src={bg.image} alt={bg.name} fill className="object-cover" />
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.logDock}>
          <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-cyan-100">Live Log</p>
          <div className="mt-2 max-h-28 space-y-1 overflow-y-auto text-xs text-slate-200">
            {(session?.log ?? []).slice(-7).map((line, idx) => (
              <p key={`${line}-${idx}`}>• {line}</p>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`${styles.shell} px-4 py-8 sm:px-6`}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className={`${styles.glass} rounded-3xl p-6`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className={`${styles.muted} text-xs tracking-[0.22em] uppercase`}>Blitz Arcade</p>
              <h1 className={`${styles.title} mt-2 text-3xl font-black sm:text-5xl`}>NFT Card Duel Lobby</h1>
              <p className={`${styles.muted} mt-3 max-w-3xl text-sm sm:text-base`}>
                Create or join a session, choose one NFT card, and press ready. Match switches to fullscreen arena
                automatically when both players are ready.
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
            <div className="flex items-center justify-between">
              <p className={`${styles.muted} text-xs tracking-[0.18em] uppercase`}>Session Control</p>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/25 bg-slate-950/60 px-3 py-1 text-xs text-cyan-100">
                {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                {connected ? "Connected" : "Offline"}
              </div>
            </div>

            <label className="block text-sm text-white">
              WebSocket URL
              <input
                value={wsUrl}
                onChange={(event) => setWsUrl(event.target.value)}
                className="mt-2 w-full rounded-xl border border-cyan-300/30 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none focus:border-lime-300/60"
              />
            </label>

            <button
              type="button"
              onClick={connectSocket}
              className="w-full rounded-xl bg-cyan-300/20 px-4 py-2 text-sm font-semibold text-cyan-100 ring-1 ring-cyan-200/50"
            >
              Connect Socket
            </button>

            <label className="block text-sm text-white">
              Player Name
              <input
                value={playerName}
                onChange={(event) => setPlayerName(event.target.value)}
                className="mt-2 w-full rounded-xl border border-cyan-300/30 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none focus:border-lime-300/60"
              />
            </label>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={createSession}
                disabled={!connected}
                className="rounded-xl bg-lime-300/20 px-4 py-2 text-sm font-semibold text-lime-100 ring-1 ring-lime-200/50 disabled:opacity-40"
              >
                Create Session
              </button>
              <button
                type="button"
                onClick={joinSession}
                disabled={!connected || !joinSessionId.trim()}
                className="rounded-xl bg-orange-300/20 px-4 py-2 text-sm font-semibold text-orange-100 ring-1 ring-orange-200/50 disabled:opacity-40"
              >
                Join Session
              </button>
            </div>

            <label className="block text-sm text-white">
              Session Code
              <input
                value={joinSessionId}
                onChange={(event) => setJoinSessionId(event.target.value.toUpperCase())}
                placeholder="ROOM-XXXXXX"
                className="mt-2 w-full rounded-xl border border-cyan-300/30 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none focus:border-lime-300/60"
              />
            </label>

            <div className={`${styles.chip} rounded-xl px-3 py-3 text-xs`}>
              <p className="font-semibold text-cyan-100">Status</p>
              <p className={`${styles.muted} mt-1`}>{statusText}</p>
              {sessionId && (
                <p className="mt-2 font-semibold text-lime-200">
                  Current Session: <span className="tracking-wider">{sessionId}</span>
                </p>
              )}
            </div>
          </aside>

          <main className={`${styles.glass} rounded-3xl p-5`}>
            <p className="text-xs font-semibold tracking-[0.14em] uppercase text-cyan-100">Ready Check</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {[myPlayer, opponent].map((player, idx) => {
                const isMe = idx === 0;
                const card = player?.cardId ? cardById.get(player.cardId) : null;
                return (
                  <div key={isMe ? "me" : "op"} className="rounded-2xl border border-cyan-200/25 bg-slate-950/60 p-3">
                    <p className="text-xs font-semibold tracking-[0.14em] text-cyan-100 uppercase">
                      {isMe ? "You" : "Opponent"}
                    </p>
                    <p className="mt-1 text-sm text-white">{player?.name ?? "Waiting..."}</p>
                    <p className="mt-1 text-xs text-cyan-100">Card: {card?.name || "Not selected"}</p>
                    <p className="mt-1 text-xs text-cyan-100">Ready: {player?.ready ? "Yes" : "No"}</p>
                  </div>
                );
              })}
            </div>
          </main>
        </div>

        <section className={`${styles.glass} rounded-3xl p-5`}>
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <p className={`${styles.muted} text-xs tracking-[0.18em] uppercase`}>Pick Your NFT Card (1 Per Player)</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {CARDS.map((card) => {
                  const isSelected = myPlayer?.cardId === card.id || selectedCardId === card.id;
                  const locked = session?.status === "active";
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => selectCard(card.id)}
                      disabled={!connected || locked || !session}
                      className={`overflow-hidden rounded-xl border bg-slate-950/70 text-left transition ${
                        isSelected ? "border-lime-200/70 ring-1 ring-lime-300/55" : "border-cyan-200/25"
                      } disabled:opacity-50`}
                    >
                      <div className="relative h-32 w-full">
                        <Image src={card.image} alt={card.name} fill className="object-cover" />
                      </div>
                      <div className="px-3 py-2">
                        <p className="text-sm font-semibold text-white">{card.name}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={readyUp}
                disabled={!connected || !myPlayer?.cardId || myPlayer.ready || session?.status === "active"}
                className="mt-3 rounded-xl bg-lime-300/20 px-4 py-2 text-sm font-semibold text-lime-100 ring-1 ring-lime-200/50 disabled:opacity-40"
              >
                {myPlayer?.ready ? "Ready" : "Ready Up"}
              </button>
            </div>

            <div>
              <p className={`${styles.muted} text-xs tracking-[0.18em] uppercase`}>Choose Battle Background</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {BACKGROUNDS.map((bg) => {
                  const isSelected = (myPlayer?.backgroundId || selectedBgId) === bg.id;
                  return (
                    <button
                      key={bg.id}
                      type="button"
                      onClick={() => setBackground(bg.id)}
                      disabled={!connected || !session}
                      className={`overflow-hidden rounded-xl border bg-slate-950/70 text-left transition ${
                        isSelected ? "border-cyan-100 ring-1 ring-cyan-200/50" : "border-cyan-200/25"
                      } disabled:opacity-40`}
                    >
                      <div className="relative h-22 w-full" style={{ height: 88 }}>
                        <Image src={bg.image} alt={bg.name} fill className="object-cover" />
                      </div>
                      <div className="px-3 py-2">
                        <p className="text-sm font-semibold text-white">{bg.name}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
