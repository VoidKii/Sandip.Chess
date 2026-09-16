const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { Chess } = require("chess.js");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

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

app.get("/", (req, res) => res.json({ name: "Sandip.Chess", status: "online" }));
app.get("/health", (req, res) => res.json({ status: "OK" }));

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  socket.on("create-room", (callback) => {
    const roomCode = getUniqueRoomCode();
    const chess = new Chess();
    rooms.set(roomCode, {
      chess,
      players: { white: socket.id, black: null },
      drawOfferedBy: null,
      finished: false,
    });
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.color = "w";
    callback({ success: true, roomCode, color: "w", fen: chess.fen() });
    console.log(`Room ${roomCode} created`);
  });

  socket.on("join-room", (roomCode, callback) => {
    const code = String(roomCode).trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return callback({ success: false, error: "Room not found." });
    if (room.players.black) return callback({ success: false, error: "Room is already full." });
    room.players.black = socket.id;
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.color = "b";
    callback({ success: true, roomCode: code, color: "b", fen: room.chess.fen() });
    io.to(code).emit("room-ready", { fen: room.chess.fen() });
  });

  socket.on("make-move", ({ roomCode, move }, callback) => {
    const room = rooms.get(roomCode);
    if (!room) return callback({ success: false, error: "Room not found." });
    if (room.finished) return callback({ success: false, error: "Game is over." });
    if (room.chess.turn() !== socket.data.color) return callback({ success: false, error: "It is not your turn." });
    try {
      const result = room.chess.move(move);
      if (!result) return callback({ success: false, error: "Invalid move." });
      room.drawOfferedBy = null;
      const state = {
        fen: room.chess.fen(),
        move: result,
        checkmate: room.chess.isCheckmate(),
        draw: room.chess.isDraw(),
        check: room.chess.isCheck(),
        turn: room.chess.turn(),
      };
      if (state.checkmate || state.draw) room.finished = true;
      io.to(roomCode).emit("game-update", state);
      callback({ success: true });
    } catch {
      callback({ success: false, error: "Invalid move." });
    }
  });

  socket.on("resign", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || room.finished) return;
    room.finished = true;
    emitGameOver(roomCode, socket.data.color === "w" ? "Black" : "White", "resignation");
  });

  socket.on("timeout", ({ roomCode, color }) => {
    const room = rooms.get(roomCode);
    if (!room || room.finished || room.chess.turn() !== color) return;
    room.finished = true;
    emitGameOver(roomCode, color === "w" ? "Black" : "White", "timeout");
  });

  socket.on("offer-draw", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || room.finished) return;
    room.drawOfferedBy = socket.data.color;
    socket.to(roomCode).emit("draw-offer");
  });

  socket.on("answer-draw", ({ roomCode, accepted }) => {
    const room = rooms.get(roomCode);
    if (!room || room.finished || !room.drawOfferedBy) return;
    if (accepted) {
      room.finished = true;
      io.to(roomCode).emit("draw-result", { accepted: true });
      io.to(roomCode).emit("game-over", { winner: "Nobody", reason: "draw" });
    } else {
      room.drawOfferedBy = null;
      io.to(roomCode).emit("draw-result", { accepted: false });
    }
  });

  socket.on("disconnect", () => {
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
