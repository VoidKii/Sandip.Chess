const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { Chess } = require("chess.js");
require("dotenv").config();

const app = express();
const server = http.createServer(app);

app.use(
  cors({
    origin: "http://localhost:5173",
  })
);

app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

const rooms = new Map();

function createRoomCode() {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code = "";

  for (let i = 0; i < 6; i++) {
    code += characters[Math.floor(Math.random() * characters.length)];
  }

  return code;
}

function getUniqueRoomCode() {
  let code = createRoomCode();

  while (rooms.has(code)) {
    code = createRoomCode();
  }

  return code;
}

app.get("/", (req, res) => {
  res.json({
    name: "Sandip.Chess",
    status: "online",
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
  });
});

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  // CREATE ROOM
  socket.on("create-room", (callback) => {
    const roomCode = getUniqueRoomCode();

    const chess = new Chess();

    rooms.set(roomCode, {
      chess,
      players: {
        white: socket.id,
        black: null,
      },
    });

    socket.join(roomCode);

    socket.data.roomCode = roomCode;
    socket.data.color = "w";

    callback({
      success: true,
      roomCode,
      color: "w",
      fen: chess.fen(),
    });

    console.log(`Room ${roomCode} created`);
  });

  // JOIN ROOM
  socket.on("join-room", (roomCode, callback) => {
    const code = String(roomCode).trim().toUpperCase();

    const room = rooms.get(code);

    if (!room) {
      callback({
        success: false,
        error: "Room not found.",
      });

      return;
    }

    if (room.players.black) {
      callback({
        success: false,
        error: "Room is already full.",
      });

      return;
    }

    room.players.black = socket.id;

    socket.join(code);

    socket.data.roomCode = code;
    socket.data.color = "b";

    callback({
      success: true,
      roomCode: code,
      color: "b",
      fen: room.chess.fen(),
    });

    io.to(code).emit("room-ready", {
      fen: room.chess.fen(),
    });

    console.log(`Player joined room ${code}`);
  });

  // MAKE MOVE
  socket.on("make-move", ({ roomCode, move }, callback) => {
    const room = rooms.get(roomCode);

    if (!room) {
      callback({
        success: false,
        error: "Room not found.",
      });

      return;
    }

    const playerColor = socket.data.color;

    if (room.chess.turn() !== playerColor) {
      callback({
        success: false,
        error: "It is not your turn.",
      });

      return;
    }

    try {
      const result = room.chess.move(move);

      if (!result) {
        callback({
          success: false,
          error: "Invalid move.",
        });

        return;
      }

      const gameState = {
        fen: room.chess.fen(),
        move: result,
        checkmate: room.chess.isCheckmate(),
        draw: room.chess.isDraw(),
        check: room.chess.isCheck(),
        turn: room.chess.turn(),
      };

      io.to(roomCode).emit("game-update", gameState);

      callback({
        success: true,
      });
    } catch (error) {
      callback({
        success: false,
        error: "Invalid move.",
      });
    }
  });

  // RESIGN
  socket.on("resign", ({ roomCode }) => {
    const room = rooms.get(roomCode);

    if (!room) return;

    const winner =
      socket.data.color === "w"
        ? "Black"
        : "White";

    io.to(roomCode).emit("game-over", {
      reason: "resignation",
      winner,
    });
  });

  // DISCONNECT
  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);

    const roomCode = socket.data.roomCode;

    if (!roomCode) return;

    const room = rooms.get(roomCode);

    if (!room) return;

    io.to(roomCode).emit("player-disconnected");

    rooms.delete(roomCode);
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log("");
  console.log("♞ Sandip.Chess server");
  console.log(`🚀 Running on port ${PORT}`);
  console.log("");
});