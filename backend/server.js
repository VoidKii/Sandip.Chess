const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { Chess } = require("chess.js");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const OWNER_DISCORD_ID = process.env.OWNER_DISCORD_ID || "1523916325859229737";
const DEFAULT_START_TIME = 5 * 60;

app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

const io = new Server(server, {
  cors: { origin: FRONTEND_URL, methods: ["GET", "POST"] },
});

const rooms = new Map();

function createRoomCode() {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => characters[Math.floor(Math.random() * characters.length)]).join("");
}

function getUniqueRoomCode() {
  let code = createRoomCode();
  while (rooms.has(code)) code = createRoomCode();
  return code;
}

function emitGameOver(roomCode, winner, reason) {
  io.to(roomCode).emit("game-over", { winner, reason });
}

function normalizeTimeControl(timeControl) {
  const initial = Number(timeControl?.initial);
  const increment = Number(timeControl?.increment);

  if (!Number.isFinite(initial) || !Number.isFinite(increment)) {
    return { initial: DEFAULT_START_TIME, increment: 0, label: "5+0" };
  }

  const safeInitial = Math.min(Math.max(Math.floor(initial), 30), 60 * 60);
  const safeIncrement = Math.min(Math.max(Math.floor(increment), 0), 120);

  return {
    initial: safeInitial,
    increment: safeIncrement,
    label: `${Math.floor(safeInitial / 60)}+${safeIncrement}`,
  };
}

function getRemainingTime(room, color) {
  let remaining = room.clocks[color];
  if (!room.frozen[color] && !room.finished && room.started && room.chess.turn() === color && room.turnStartedAt) {
    remaining -= Date.now() - room.turnStartedAt;
  }
  return Math.max(0, remaining);
}

function getClockState(room) {
  return {
    w: Math.ceil(getRemainingTime(room, "w") / 1000),
    b: Math.ceil(getRemainingTime(room, "b") / 1000),
    turn: room.chess.turn(),
    frozen: { ...room.frozen },
    timeControl: room.timeControl,
  };
}

function syncClock(room) {
  if (!room.started || room.finished || !room.turnStartedAt) return false;
  const color = room.chess.turn();
  if (room.frozen[color]) return false;
  const remaining = getRemainingTime(room, color);
  if (remaining <= 0) {
    room.clocks[color] = 0;
    room.finished = true;
    room.turnStartedAt = null;
    emitGameOver(room.code, color === "w" ? "Black" : "White", "timeout");
    return true;
  }
  return false;
}

function isOwner(socket, room) {
  return Boolean(socket.data.isOwner) && room && room.players.white === socket.id;
}

app.get("/", (req, res) => res.json({ name: "Sandip.Chess", status: "online" }));
app.get("/health", (req, res) => res.json({ status: "OK" }));

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);
  socket.data.isOwner = false;

  socket.on("create-room", ({ userId, timeControl } = {}, callback = () => {}) => {
    const normalizedUserId = String(userId || "").trim();
    const owner = normalizedUserId === OWNER_DISCORD_ID;
    const selectedTimeControl = normalizeTimeControl(timeControl);
    socket.data.isOwner = owner;

    const roomCode = getUniqueRoomCode();
    const chess = new Chess();
    rooms.set(roomCode, {
      code: roomCode,
      chess,
      players: { white: socket.id, black: null },
      drawOfferedBy: null,
      finished: false,
      started: false,
      clocks: { w: selectedTimeControl.initial * 1000, b: selectedTimeControl.initial * 1000 },
      frozen: { w: false, b: false },
      turnStartedAt: null,
      timeControl: selectedTimeControl,
    });
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.color = "w";
    callback({
      success: true,
      roomCode,
      color: "w",
      owner,
      fen: chess.fen(),
      clocks: { w: selectedTimeControl.initial, b: selectedTimeControl.initial, frozen: { w: false, b: false }, timeControl: selectedTimeControl },
      turn: "w",
      timeControl: selectedTimeControl,
    });
    console.log(`Room ${roomCode} created${owner ? " by owner" : ""} with ${selectedTimeControl.label}`);
  });

  socket.on("join-room", (roomCode, callback) => {
    const code = String(roomCode).trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return callback({ success: false, error: "Room not found." });
    if (room.players.black) return callback({ success: false, error: "Room is already full." });
    room.players.black = socket.id;
    room.started = true;
    room.turnStartedAt = Date.now();
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.color = "b";
    socket.data.isOwner = false;
    callback({ success: true, roomCode: code, color: "b", owner: false, fen: room.chess.fen(), clocks: getClockState(room), turn: room.chess.turn(), timeControl: room.timeControl });
    io.to(code).emit("room-ready", { fen: room.chess.fen(), clocks: getClockState(room), turn: room.chess.turn(), timeControl: room.timeControl });
  });

  socket.on("make-move", ({ roomCode, move }, callback) => {
    const room = rooms.get(roomCode);
    if (!room) return callback({ success: false, error: "Room not found." });
    if (room.finished) return callback({ success: false, error: "Game is over." });
    if (!room.started) return callback({ success: false, error: "Waiting for opponent." });
    if (room.chess.turn() !== socket.data.color) return callback({ success: false, error: "It is not your turn." });
    if (syncClock(room)) return callback({ success: false, error: "Time expired." });

    const movingColor = room.chess.turn();
    room.clocks[movingColor] = getRemainingTime(room, movingColor);
    room.turnStartedAt = null;

    try {
      const result = room.chess.move(move);
      if (!result) {
        room.turnStartedAt = Date.now();
        return callback({ success: false, error: "Invalid move." });
      }

      room.clocks[movingColor] += room.timeControl.increment * 1000;
      room.drawOfferedBy = null;
      room.turnStartedAt = Date.now();

      const state = {
        fen: room.chess.fen(),
        move: result,
        checkmate: room.chess.isCheckmate(),
        draw: room.chess.isDraw(),
        check: room.chess.isCheck(),
        turn: room.chess.turn(),
        clocks: getClockState(room),
        timeControl: room.timeControl,
      };

      if (state.checkmate || state.draw) {
        room.finished = true;
        room.turnStartedAt = null;
      }

      io.to(roomCode).emit("game-update", state);
      callback({ success: true });
    } catch {
      room.turnStartedAt = Date.now();
      callback({ success: false, error: "Invalid move." });
    }
  });

  socket.on("clock-sync", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (syncClock(room)) return;
    socket.emit("clock-update", getClockState(room));
  });

  socket.on("owner-cheat", ({ roomCode, action }, callback = () => {}) => {
    const room = rooms.get(roomCode);
    if (!room) return callback({ success: false, error: "Room not found." });
    if (!isOwner(socket, room)) return callback({ success: false, error: "Owner only." });
    if (!room.started) return callback({ success: false, error: "Start a game first." });
    if (room.finished && action !== "reset") return callback({ success: false, error: "Game is already over." });

    if (action === "freeze-opponent") {
      room.frozen.b = !room.frozen.b;
      room.clocks.b = getRemainingTime(room, "b");
      room.turnStartedAt = Date.now();
    } else if (action === "drain-opponent") {
      room.clocks.b = Math.min(getRemainingTime(room, "b"), 10 * 1000);
      room.turnStartedAt = Date.now();
    } else if (action === "give-owner-time") {
      room.clocks.w = Math.min(getRemainingTime(room, "w") + 60 * 1000, 60 * 60 * 1000);
      room.turnStartedAt = Date.now();
    } else if (action === "reset") {
      room.clocks = { w: room.timeControl.initial * 1000, b: room.timeControl.initial * 1000 };
      room.frozen = { w: false, b: false };
      room.finished = false;
      room.drawOfferedBy = null;
      room.turnStartedAt = Date.now();
    } else if (action === "force-win") {
      room.finished = true;
      room.turnStartedAt = null;
      emitGameOver(roomCode, "White", "owner cheat");
      return callback({ success: true });
    } else {
      return callback({ success: false, error: "Unknown owner action." });
    }

    io.to(roomCode).emit("clock-update", getClockState(room));
    callback({ success: true });
  });

  socket.on("resign", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || room.finished) return;
    if (syncClock(room)) return;
    room.finished = true;
    room.turnStartedAt = null;
    emitGameOver(roomCode, socket.data.color === "w" ? "Black" : "White", "resignation");
  });

  socket.on("offer-draw", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || room.finished) return;
    if (syncClock(room)) return;
    room.drawOfferedBy = socket.data.color;
    socket.to(roomCode).emit("draw-offer");
  });

  socket.on("answer-draw", ({ roomCode, accepted }) => {
    const room = rooms.get(roomCode);
    if (!room || room.finished || !room.drawOfferedBy) return;
    if (syncClock(room)) return;
    if (accepted) {
      room.finished = true;
      room.turnStartedAt = null;
      io.to(roomCode).emit("draw-result", { accepted: true });
      io.to(roomCode).emit("game-over", { winner: "Nobody", reason: "draw" });
    } else {
      room.drawOfferedBy = null;
      io.to(roomCode).emit("draw-result", { accepted: false });
    }
  });

  const clockInterval = setInterval(() => {
    const roomCode = socket.data.roomCode;
    const room = roomCode ? rooms.get(roomCode) : null;
    if (!room || room.players.white !== socket.id && room.players.black !== socket.id) return;
    if (syncClock(room)) return;
    io.to(roomCode).emit("clock-update", getClockState(room));
  }, 500);

  socket.on("disconnect", () => {
    clearInterval(clockInterval);
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;
    io.to(roomCode).emit("player-disconnected");
    rooms.delete(roomCode);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`♞ Sandip.Chess server running on port ${PORT}`));