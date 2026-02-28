import { WebSocketServer } from "ws";
import os from "node:os";

const PORT = Number(process.env.NFT_WS_PORT || 8081);
const HOST = process.env.NFT_WS_HOST || "0.0.0.0";
const MAX_HP = 100;

const sessions = new Map();
const playerToSession = new Map();
const sockets = new Map();

const randomId = (prefix = "") => `${prefix}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const safeName = (value) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "Player";
  return trimmed.slice(0, 24);
};

const send = (ws, payload) => {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(payload));
};

const getPublicSession = (session) => ({
  id: session.id,
  status: session.status,
  winnerId: session.winnerId,
  currentTurnPlayerId: session.currentTurnPlayerId,
  turn: session.turn,
  lastAction: session.lastAction,
  log: session.log.slice(-12),
  players: session.players.map((player) => ({
    id: player.id,
    name: player.name,
    hp: player.hp,
    cardId: player.cardId,
    ready: player.ready,
    guard: player.guard,
    backgroundId: player.backgroundId,
    connected: player.connected,
  })),
});

const broadcastSession = (session, extra = {}) => {
  const publicSession = getPublicSession(session);
  for (const player of session.players) {
    const ws = sockets.get(player.id);
    if (!ws) continue;
    send(ws, {
      type: "session_state",
      session: publicSession,
      you: player.id,
      ...extra,
    });
  }
};

const appendLog = (session, text) => {
  session.log.push(text);
  if (session.log.length > 50) {
    session.log = session.log.slice(-50);
  }
};

const startMatchIfReady = (session) => {
  if (session.players.length !== 2) return;
  const everyoneReady = session.players.every((player) => player.ready && player.cardId);
  if (!everyoneReady) return;
  session.status = "active";
  session.winnerId = null;
  session.turn = 1;
  session.lastAction = "Match started";
  session.players.forEach((player) => {
    player.hp = MAX_HP;
    player.guard = false;
  });
  const firstPlayer = session.players[Math.floor(Math.random() * 2)];
  session.currentTurnPlayerId = firstPlayer.id;
  appendLog(session, `Match started. ${firstPlayer.name} takes the first turn.`);
  broadcastSession(session, { type: "match_started" });
};

const removePlayer = (playerId) => {
  const sessionId = playerToSession.get(playerId);
  if (!sessionId) return;

  const session = sessions.get(sessionId);
  if (!session) {
    playerToSession.delete(playerId);
    return;
  }

  const index = session.players.findIndex((player) => player.id === playerId);
  if (index === -1) {
    playerToSession.delete(playerId);
    return;
  }

  session.players[index].connected = false;

  if (session.status === "active") {
    const opponent = session.players.find((player) => player.id !== playerId);
    session.status = "ended";
    session.winnerId = opponent?.id || null;
    session.lastAction = "Player disconnected";
    appendLog(session, `${session.players[index].name} disconnected.`);
    if (opponent) {
      appendLog(session, `${opponent.name} wins by disconnect.`);
    }
    broadcastSession(session);
    return;
  }

  session.players = session.players.filter((player) => player.id !== playerId);
  playerToSession.delete(playerId);

  if (session.players.length === 0) {
    sessions.delete(session.id);
    return;
  }

  session.status = "waiting";
  session.currentTurnPlayerId = null;
  session.turn = 0;
  session.lastAction = "Waiting for an opponent";
  appendLog(session, "A player left. Waiting for opponent.");
  broadcastSession(session);
};

const handleCreate = (ws, playerId, name) => {
  const sessionId = randomId("ROOM-");
  const player = {
    id: playerId,
    name: safeName(name),
    hp: MAX_HP,
    cardId: null,
    ready: false,
    guard: false,
    backgroundId: "astral",
    connected: true,
  };

  const session = {
    id: sessionId,
    status: "waiting",
    players: [player],
    winnerId: null,
    currentTurnPlayerId: null,
    turn: 0,
    log: [`${player.name} created the session.`],
    lastAction: "Session created",
  };

  sessions.set(sessionId, session);
  playerToSession.set(playerId, sessionId);
  send(ws, { type: "session_created", sessionId, you: playerId });
  broadcastSession(session);
};

const handleJoin = (ws, playerId, sessionId, name) => {
  const room = sessions.get(String(sessionId || "").trim());
  if (!room) {
    send(ws, { type: "error", message: "Session not found." });
    return;
  }
  if (room.players.length >= 2) {
    send(ws, { type: "error", message: "Session is full." });
    return;
  }

  const newPlayer = {
    id: playerId,
    name: safeName(name),
    hp: MAX_HP,
    cardId: null,
    ready: false,
    guard: false,
    backgroundId: "astral",
    connected: true,
  };

  room.players.push(newPlayer);
  room.status = "waiting";
  room.lastAction = "Opponent joined";
  appendLog(room, `${newPlayer.name} joined the session.`);
  playerToSession.set(playerId, room.id);
  send(ws, { type: "session_joined", sessionId: room.id, you: playerId });
  broadcastSession(room);
};

const performAction = (playerId, action) => {
  const sessionId = playerToSession.get(playerId);
  if (!sessionId) return;
  const session = sessions.get(sessionId);
  if (!session) return;

  if (session.status !== "active") {
    const ws = sockets.get(playerId);
    if (ws) send(ws, { type: "error", message: "Match is not active." });
    return;
  }

  if (session.currentTurnPlayerId !== playerId) {
    const ws = sockets.get(playerId);
    if (ws) send(ws, { type: "error", message: "Not your turn." });
    return;
  }

  const attacker = session.players.find((player) => player.id === playerId);
  const defender = session.players.find((player) => player.id !== playerId);
  if (!attacker || !defender) return;

  if (action === "defend") {
    const heal = 4 + Math.floor(Math.random() * 6);
    attacker.guard = true;
    attacker.hp = Math.min(MAX_HP, attacker.hp + heal);
    session.lastAction = `${attacker.name} is defending`; 
    appendLog(session, `${attacker.name} defended and restored ${heal} HP.`);
  } else if (action === "attack") {
    let damage = 12 + Math.floor(Math.random() * 15);
    let blocked = false;
    if (defender.guard) {
      damage = Math.max(4, Math.floor(damage * 0.45));
      defender.guard = false;
      blocked = true;
    }

    defender.hp = Math.max(0, defender.hp - damage);
    session.lastAction = `${attacker.name} attacked ${defender.name}`;
    appendLog(
      session,
      blocked
        ? `${attacker.name} attacked for ${damage}. ${defender.name} blocked part of the hit.`
        : `${attacker.name} attacked for ${damage}.`,
    );
  } else {
    const ws = sockets.get(playerId);
    if (ws) send(ws, { type: "error", message: "Unknown action." });
    return;
  }

  if (defender.hp <= 0) {
    session.status = "ended";
    session.winnerId = attacker.id;
    session.currentTurnPlayerId = null;
    appendLog(session, `${attacker.name} won the match.`);
    broadcastSession(session, { type: "match_ended" });
    return;
  }

  session.turn += 1;
  session.currentTurnPlayerId = defender.id;
  broadcastSession(session);
};

const wss = new WebSocketServer({ host: HOST, port: PORT });

wss.on("connection", (ws) => {
  const playerId = randomId("P-");
  sockets.set(playerId, ws);
  send(ws, { type: "connected", you: playerId });

  ws.on("message", (raw) => {
    let payload;
    try {
      payload = JSON.parse(String(raw));
    } catch {
      send(ws, { type: "error", message: "Invalid payload." });
      return;
    }

    const type = payload?.type;

    if (type === "create_session") {
      handleCreate(ws, playerId, payload.name);
      return;
    }

    if (type === "join_session") {
      handleJoin(ws, playerId, payload.sessionId, payload.name);
      return;
    }

    const sessionId = playerToSession.get(playerId);
    const session = sessionId ? sessions.get(sessionId) : null;

    if (!session) {
      send(ws, { type: "error", message: "Join or create a session first." });
      return;
    }

    const me = session.players.find((player) => player.id === playerId);
    if (!me) {
      send(ws, { type: "error", message: "Player not found in session." });
      return;
    }

    if (type === "select_card") {
      if (session.status !== "waiting") {
        send(ws, { type: "error", message: "Cannot change card during an active match." });
        return;
      }
      me.cardId = String(payload.cardId || "").trim() || null;
      me.ready = false;
      session.lastAction = `${me.name} selected a card`;
      appendLog(session, `${me.name} selected card ${me.cardId || "none"}.`);
      broadcastSession(session);
      return;
    }

    if (type === "set_background") {
      me.backgroundId = String(payload.backgroundId || "").trim() || "astral";
      broadcastSession(session);
      return;
    }

    if (type === "player_ready") {
      if (!me.cardId) {
        send(ws, { type: "error", message: "Select a card first." });
        return;
      }
      me.ready = true;
      session.lastAction = `${me.name} is ready`;
      appendLog(session, `${me.name} is ready.`);
      broadcastSession(session);
      startMatchIfReady(session);
      return;
    }

    if (type === "action") {
      performAction(playerId, payload.action);
      return;
    }

    if (type === "restart_match") {
      if (session.status !== "ended") {
        send(ws, { type: "error", message: "Match has not ended." });
        return;
      }
      session.status = "waiting";
      session.winnerId = null;
      session.currentTurnPlayerId = null;
      session.turn = 0;
      session.lastAction = "Waiting for both players to ready up";
      session.players.forEach((player) => {
        player.ready = false;
        player.hp = MAX_HP;
        player.guard = false;
      });
      appendLog(session, "New round lobby opened.");
      broadcastSession(session);
      return;
    }

    if (type === "ping") {
      send(ws, { type: "pong", t: Date.now() });
      return;
    }

    send(ws, { type: "error", message: "Unknown message type." });
  });

  ws.on("close", () => {
    sockets.delete(playerId);
    removePlayer(playerId);
  });
});

const getLocalIps = () =>
  Object.values(os.networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address);

console.log(`NFT card WebSocket server listening on ws://${HOST}:${PORT}`);
for (const ip of getLocalIps()) {
  console.log(`LAN access: ws://${ip}:${PORT}`);
}
