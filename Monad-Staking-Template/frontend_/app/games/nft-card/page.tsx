"use client";

import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ethers } from "ethers";
import { House, RotateCcw, Shield, Sword, Users, Wallet, Wifi, WifiOff } from "lucide-react";
import styles from "../games.module.css";
import { useToastContext } from "@/app/contexts/ToastContext";
import { PVP_WAGER_ABI, PVP_WAGER_CONTRACT_ADDRESS } from "@/app/config/game_betting_config";
import { monadTestnet } from "@/app/config/chains";

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

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  removeListener: (event: string, cb: (...args: unknown[]) => void) => void;
};

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
  walletAddress?: string;
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

type EscrowState = {
  exists: boolean;
  creator: string;
  opponent: string;
  stake: string;
  joined: boolean;
  finished: boolean;
  claimed: boolean;
  winner: string;
  myVote: string;
  opponentVote: string;
};

const EMPTY_ESCROW: EscrowState = {
  exists: false,
  creator: "",
  opponent: "",
  stake: "0",
  joined: false,
  finished: false,
  claimed: false,
  winner: "",
  myVote: "",
  opponentVote: "",
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
  const { showError, showInfo, showSuccess } = useToastContext();

  const [playerName, setPlayerName] = useState("Player");
  const [joinSessionId, setJoinSessionId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [wsUrl, setWsUrl] = useState(WS_DEFAULT_URL);

  const [walletAddress, setWalletAddress] = useState("");
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);

  const [connected, setConnected] = useState(false);
  const [myPlayerId, setMyPlayerId] = useState("");
  const [session, setSession] = useState<SessionState | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedBgId, setSelectedBgId] = useState<string>(BACKGROUNDS[0].id);
  const [statusText, setStatusText] = useState("Connect wallet + WebSocket to begin.");
  const [resultOpen, setResultOpen] = useState(false);
  const [resultSeed, setResultSeed] = useState(1);

  const [pvpStake, setPvpStake] = useState("0.05");
  const [escrow, setEscrow] = useState<EscrowState>(EMPTY_ESCROW);
  const [escrowBusy, setEscrowBusy] = useState("");
  const [contractReady, setContractReady] = useState(false);
  const [contractStatusText, setContractStatusText] = useState("");

  const socketRef = useRef<WebSocket | null>(null);
  const lastEndedTurnRef = useRef<number | null>(null);

  const ethereum =
    typeof window !== "undefined" ? ((window as Window & { ethereum?: Eip1193Provider }).ethereum ?? null) : null;

  const myPlayer = useMemo(
    () => session?.players.find((player) => player.id === myPlayerId) ?? null,
    [session, myPlayerId],
  );

  const opponent = useMemo(
    () => session?.players.find((player) => player.id !== myPlayerId) ?? null,
    [session, myPlayerId],
  );

  const myWalletInSession = (myPlayer?.walletAddress || "").toLowerCase();
  const opponentWalletInSession = (opponent?.walletAddress || "").toLowerCase();
  const normalizedWallet = walletAddress.toLowerCase();

  const matchId = useMemo(() => (session?.id ? ethers.id(session.id) : ""), [session?.id]);

  const isBattleMode = session?.status === "active" || session?.status === "ended";

  const activeBackground = useMemo(() => {
    const source = bgById.get(myPlayer?.backgroundId || selectedBgId) ?? BACKGROUNDS[0];
    return source.image.src;
  }, [myPlayer?.backgroundId, selectedBgId]);

  const escrowReady = escrow.exists && escrow.joined && !escrow.claimed;
  const canAct =
    !!session &&
    session.status === "active" &&
    session.currentTurnPlayerId === myPlayerId &&
    !!myPlayer &&
    !!opponent &&
    escrowReady;

  const canSendAction =
    !!session && session.status === "active" && !!myPlayer && !!opponent && escrowReady;

  const confettiPieces = useMemo(() => Array.from({ length: 30 }, (_, idx) => idx), []);
  const blastSparks = useMemo(() => Array.from({ length: 14 }, (_, idx) => idx), []);

  const myCard = myPlayer?.cardId ? cardById.get(myPlayer.cardId) : null;
  const opponentCard = opponent?.cardId ? cardById.get(opponent.cardId) : null;
  const winnerName = session?.players.find((player) => player.id === session.winnerId)?.name;
  const winnerWallet =
    (session?.players.find((player) => player.id === session.winnerId)?.walletAddress || "").toLowerCase();
  const didIWin = !!session && session.status === "ended" && winnerWallet !== "" && winnerWallet === normalizedWallet;
  const didILose = !!session && session.status === "ended" && winnerWallet !== "" && winnerWallet !== normalizedWallet;

  const sendEvent = useCallback((payload: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(payload));
  }, []);

  const getEscrowContract = useCallback(async () => {
    if (!ethereum) {
      throw new Error("Install MetaMask or another EVM wallet.");
    }
    if (!PVP_WAGER_CONTRACT_ADDRESS || !ethers.isAddress(PVP_WAGER_CONTRACT_ADDRESS)) {
      throw new Error("Set NEXT_PUBLIC_PVP_WAGER_CONTRACT_ADDRESS with deployed escrow contract address.");
    }

    const provider = new ethers.BrowserProvider(ethereum as ethers.Eip1193Provider);
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== monadTestnet.id) {
      const chainHex = `0x${monadTestnet.id.toString(16)}`;
      try {
        await ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: chainHex }],
        });
      } catch (switchError) {
        const err = switchError as { code?: number };
        if (err.code === 4902) {
          await ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: chainHex,
                chainName: monadTestnet.name,
                nativeCurrency: monadTestnet.nativeCurrency,
                rpcUrls: monadTestnet.rpcUrls.default.http,
                blockExplorerUrls: [monadTestnet.blockExplorers?.default.url ?? "https://testnet.monadvision.com"],
              },
            ],
          });
        } else {
          throw new Error(`Please switch wallet to ${monadTestnet.name} (${monadTestnet.id}).`);
        }
      }
    }

    const signer = await provider.getSigner();
    return new ethers.Contract(PVP_WAGER_CONTRACT_ADDRESS, PVP_WAGER_ABI, signer);
  }, [ethereum]);

  const checkContractReady = useCallback(async () => {
    if (!ethereum) {
      setContractReady(false);
      setContractStatusText("Wallet provider not detected.");
      return;
    }
    if (!PVP_WAGER_CONTRACT_ADDRESS || !ethers.isAddress(PVP_WAGER_CONTRACT_ADDRESS)) {
      setContractReady(false);
      setContractStatusText("Missing NEXT_PUBLIC_PVP_WAGER_CONTRACT_ADDRESS.");
      return;
    }

    try {
      const provider = new ethers.BrowserProvider(ethereum as ethers.Eip1193Provider);
      const code = await provider.getCode(PVP_WAGER_CONTRACT_ADDRESS);
      if (!code || code === "0x") {
        setContractReady(false);
        setContractStatusText("Escrow contract not found at configured address.");
        return;
      }
      setContractReady(true);
      setContractStatusText("Escrow contract detected.");
    } catch {
      setContractReady(false);
      setContractStatusText("Unable to verify escrow contract on current network.");
    }
  }, [ethereum]);

  const refreshEscrowState = useCallback(async () => {
    if (!matchId || !walletAddress || !opponentWalletInSession) {
      setEscrow(EMPTY_ESCROW);
      return;
    }

    try {
      const contract = await getEscrowContract();
      const [creator, contractOpponent, stake, joined, finished, claimed, winner] = await contract.getMatch(matchId);
      const myVote = await contract.winnerVotes(matchId, walletAddress);
      const opponentVote = await contract.winnerVotes(matchId, opponentWalletInSession);

      setEscrow({
        exists: true,
        creator: String(creator).toLowerCase(),
        opponent: String(contractOpponent).toLowerCase(),
        stake: ethers.formatEther(stake),
        joined: Boolean(joined),
        finished: Boolean(finished),
        claimed: Boolean(claimed),
        winner: String(winner).toLowerCase(),
        myVote: String(myVote).toLowerCase(),
        opponentVote: String(opponentVote).toLowerCase(),
      });
    } catch {
      setEscrow(EMPTY_ESCROW);
    }
  }, [getEscrowContract, matchId, opponentWalletInSession, walletAddress]);

  const connectWallet = useCallback(async () => {
    if (!ethereum) {
      showError("Install MetaMask or another EVM wallet.");
      return;
    }
    setIsConnectingWallet(true);
    try {
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const next = accounts[0] ?? "";
      setWalletAddress(next);
      if (next) {
        showSuccess("Wallet connected.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Wallet connection failed.";
      showError(message);
    } finally {
      setIsConnectingWallet(false);
    }
  }, [ethereum, showError, showSuccess]);

  const createEscrow = async () => {
    if (!session || !matchId || !myPlayer || !opponent) {
      showError("Create/join a websocket session first.");
      return;
    }
    if (!walletAddress) {
      showInfo("Connect wallet first.");
      return;
    }
    if (!opponentWalletInSession || !ethers.isAddress(opponentWalletInSession)) {
      showError("Opponent wallet is missing. Ask opponent to connect wallet.");
      return;
    }
    if (myWalletInSession !== normalizedWallet) {
      showError("Your connected wallet does not match session wallet.");
      return;
    }

    setEscrowBusy("create");
    try {
      const contract = await getEscrowContract();
      const value = ethers.parseEther((Number(pvpStake) || 0).toString());
      if (value <= 0n) throw new Error("Stake must be greater than 0.");
      const tx = await contract.createMatch(matchId, opponentWalletInSession, { value });
      await tx.wait();
      showSuccess("On-chain match created. Opponent must join with same stake.");
      await refreshEscrowState();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Create stake failed.";
      showError(message);
    } finally {
      setEscrowBusy("");
    }
  };

  const joinEscrow = async () => {
    if (!session || !matchId || !walletAddress) {
      showError("Connect wallet and session first.");
      return;
    }

    setEscrowBusy("join");
    try {
      const contract = await getEscrowContract();
      const effectiveStake = Number(escrow.stake) > 0 ? Number(escrow.stake) : Number(pvpStake);
      const value = ethers.parseEther(effectiveStake.toString());
      if (value <= 0n) throw new Error("Stake must be greater than 0.");
      const tx = await contract.joinMatch(matchId, { value });
      await tx.wait();
      showSuccess("Joined on-chain match stake.");
      await refreshEscrowState();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Join stake failed.";
      showError(message);
    } finally {
      setEscrowBusy("");
    }
  };

  const voteWinner = async () => {
    if (!session || session.status !== "ended" || !session.winnerId) {
      showInfo("Match winner is not available yet.");
      return;
    }
    if (!matchId || !winnerWallet || !ethers.isAddress(winnerWallet)) {
      showError("Winner wallet is missing.");
      return;
    }

    setEscrowBusy("vote");
    try {
      const contract = await getEscrowContract();
      const tx = await contract.voteWinner(matchId, winnerWallet);
      await tx.wait();
      showSuccess("Winner vote submitted on-chain.");
      await refreshEscrowState();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Vote winner failed.";
      showError(message);
    } finally {
      setEscrowBusy("");
    }
  };

  const claimPot = async () => {
    if (!matchId) return;
    setEscrowBusy("claim");
    try {
      const contract = await getEscrowContract();
      const tx = await contract.claimPot(matchId);
      await tx.wait();
      showSuccess("Pot claimed successfully.");
      await refreshEscrowState();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Claim pot failed.";
      showError(message);
    } finally {
      setEscrowBusy("");
    }
  };

  useEffect(() => {
    return () => {
      socketRef.current?.close();
    };
  }, []);

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

  useEffect(() => {
    if (!session || !walletAddress) return;
    if (myWalletInSession === normalizedWallet) return;
    sendEvent({ type: "set_wallet", walletAddress: normalizedWallet });
  }, [myWalletInSession, normalizedWallet, sendEvent, session, walletAddress]);

  useEffect(() => {
    if (!session || !walletAddress || !matchId) return;
    void refreshEscrowState();
  }, [matchId, refreshEscrowState, session, walletAddress]);

  useEffect(() => {
    void checkContractReady();
  }, [checkContractReady, walletAddress]);

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
    if (!walletAddress) {
      showInfo("Connect wallet first for multiplayer stake flow.");
      return;
    }
    if (!contractReady) {
      showError("Escrow contract is not configured/deployed correctly.");
      return;
    }
    sendEvent({ type: "create_session", name: playerName, walletAddress: normalizedWallet });
  };

  const joinSession = () => {
    if (!walletAddress) {
      showInfo("Connect wallet first for multiplayer stake flow.");
      return;
    }
    if (!contractReady) {
      showError("Escrow contract is not configured/deployed correctly.");
      return;
    }
    sendEvent({
      type: "join_session",
      name: playerName,
      sessionId: joinSessionId,
      walletAddress: normalizedWallet,
    });
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
    if (!escrowReady) {
      showInfo("Both players must lock stake on-chain before ready.");
      return;
    }
    sendEvent({ type: "player_ready" });
  };

  const playAction = (action: "attack" | "defend") => {
    if (!escrowReady) {
      showInfo("Escrow not funded by both players yet.");
      return;
    }
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
          <p className="text-[11px] text-cyan-200">
            {player?.walletAddress ? `${player.walletAddress.slice(0, 6)}...${player.walletAddress.slice(-4)}` : "Wallet not linked"}
          </p>
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
            Stake {escrow.stake || pvpStake} MON
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
          {!escrowReady
            ? "Waiting for both on-chain stakes"
            : session?.status === "active"
              ? canAct
                ? "Your turn"
                : `${opponent?.name || "Opponent"}'s turn`
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
          <div className="absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={voteWinner}
              disabled={escrowBusy !== "" || !winnerWallet}
              className="rounded-full border border-cyan-200/40 bg-cyan-300/20 px-4 py-2 text-xs font-semibold tracking-[0.1em] text-cyan-100 uppercase disabled:opacity-50"
            >
              {escrowBusy === "vote" ? "Voting..." : "Vote Winner"}
            </button>
            <button
              type="button"
              onClick={claimPot}
              disabled={escrowBusy !== "" || !didIWin || !escrow.finished || escrow.claimed}
              className="rounded-full border border-lime-200/40 bg-lime-300/25 px-4 py-2 text-xs font-semibold tracking-[0.1em] text-lime-100 uppercase disabled:opacity-50"
            >
              {escrowBusy === "claim" ? "Claiming..." : "Claim Pot"}
            </button>
            <button
              type="button"
              onClick={restartMatch}
              className="inline-flex items-center gap-2 rounded-full border border-lime-200/40 bg-lime-300/25 px-5 py-2 text-sm font-semibold text-lime-100"
            >
              <RotateCcw className="h-4 w-4" />
              Restart Lobby
            </button>
          </div>
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
                    ? "Excellent play. Submit winner vote and claim your on-chain pot."
                    : didILose
                      ? "Tough round. Confirm winner vote for settlement."
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
                    onClick={voteWinner}
                    disabled={escrowBusy !== "" || !winnerWallet}
                    className="rounded-xl bg-cyan-300/20 px-4 py-2 text-sm font-semibold text-cyan-100 ring-1 ring-cyan-200/50 disabled:opacity-50"
                  >
                    Vote Winner
                  </button>
                  <button
                    type="button"
                    onClick={claimPot}
                    disabled={escrowBusy !== "" || !didIWin || !escrow.finished || escrow.claimed}
                    className="inline-flex items-center gap-2 rounded-xl bg-lime-300/20 px-4 py-2 text-sm font-semibold text-lime-100 ring-1 ring-lime-200/50 disabled:opacity-50"
                  >
                    Claim Pot
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
          <p className="mt-1 text-[10px] text-cyan-200">
            Escrow {escrow.exists ? `stake ${escrow.stake} MON` : "not created"} • Votes {escrow.myVote ? "yes" : "no"}/
            {escrow.opponentVote ? "yes" : "no"}
          </p>
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
                Connect wallet, create/join session, lock on-chain stake, then ready up for battle.
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

            <button
              type="button"
              onClick={connectWallet}
              disabled={isConnectingWallet}
              className="inline-flex w-full items-center gap-2 rounded-xl border border-cyan-300/35 bg-slate-900/70 px-3 py-2 text-xs font-semibold text-cyan-100"
            >
              <Wallet className="h-4 w-4" />
              {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : "Connect Wallet"}
            </button>

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
                disabled={!connected || !walletAddress}
                className="rounded-xl bg-lime-300/20 px-4 py-2 text-sm font-semibold text-lime-100 ring-1 ring-lime-200/50 disabled:opacity-40"
              >
                Create Session
              </button>
              <button
                type="button"
                onClick={joinSession}
                disabled={!connected || !walletAddress || !joinSessionId.trim()}
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

            <label className="block text-sm text-white">
              Stake (MON)
              <input
                value={pvpStake}
                onChange={(event) => setPvpStake(event.target.value)}
                type="number"
                min="0.01"
                step="0.01"
                className="mt-2 w-full rounded-xl border border-cyan-300/30 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none focus:border-lime-300/60"
              />
            </label>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={createEscrow}
                disabled={!session || escrowBusy !== ""}
                className="rounded-xl bg-cyan-300/20 px-4 py-2 text-xs font-semibold tracking-[0.1em] text-cyan-100 uppercase disabled:opacity-50"
              >
                {escrowBusy === "create" ? "Creating..." : "Create On-chain Stake"}
              </button>
              <button
                type="button"
                onClick={joinEscrow}
                disabled={!session || escrowBusy !== ""}
                className="rounded-xl bg-purple-300/20 px-4 py-2 text-xs font-semibold tracking-[0.1em] text-purple-100 uppercase disabled:opacity-50"
              >
                {escrowBusy === "join" ? "Joining..." : "Join On-chain Stake"}
              </button>
            </div>

            <div className={`${styles.chip} rounded-xl px-3 py-3 text-xs`}>
              <p className="font-semibold text-cyan-100">Status</p>
              <p className={`${styles.muted} mt-1`}>{statusText}</p>
              {sessionId && (
                <p className="mt-2 font-semibold text-lime-200">
                  Session: <span className="tracking-wider">{sessionId}</span>
                </p>
              )}
              <p className="mt-1 text-cyan-100">Contract: {contractStatusText || "Checking..."}</p>
              <p className="mt-1 text-cyan-100">
                Escrow: {escrow.exists ? (escrow.joined ? "Funded by both" : "Waiting opponent stake") : "Not created"}
              </p>
            </div>
          </aside>

          <main className={`${styles.glass} rounded-3xl p-5`}>
            <p className="text-xs font-semibold tracking-[0.14em] uppercase text-cyan-100">Ready Check + Wallet Check</p>
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
                    <p className="mt-1 text-xs text-cyan-100">Wallet: {player?.walletAddress || "Not linked"}</p>
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
