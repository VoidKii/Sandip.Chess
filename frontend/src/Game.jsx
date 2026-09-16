import { useEffect, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { io } from "socket.io-client";

const SOCKET_URL = "http://localhost:3001";

function Game() {
  const [socket] = useState(() => io(SOCKET_URL));

  const [game, setGame] = useState(new Chess());

  const [status, setStatus] = useState(
    "Create a room or join a friend's room"
  );

  const [roomCode, setRoomCode] = useState("");
  const [inputCode, setInputCode] = useState("");

  const [myColor, setMyColor] = useState(null);

  const [connected, setConnected] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);

  const [moves, setMoves] = useState([]);

  const [captured, setCaptured] = useState({
    white: [],
    black: [],
  });

  useEffect(() => {
    socket.on("connect", () => {
      console.log("Connected to Sandip.Chess server");
      setConnected(true);
      setStatus("Connected — create or join a room");
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from server");
      setConnected(false);
      setStatus("Disconnected from server");
    });

    socket.on("room-ready", ({ fen }) => {
      const newGame = new Chess(fen);

      setGame(newGame);
      setGameStarted(true);
      setGameOver(false);
      setStatus("Game started — White to move");
    });

    socket.on("game-update", (gameState) => {
      const newGame = new Chess(gameState.fen);

      setGame(newGame);

      setMoves((previous) => [
        ...previous,
        {
          color: gameState.move.color,
          san: gameState.move.san,
        },
      ]);

      if (gameState.move.captured) {
        setCaptured((previous) => ({
          ...previous,
          [gameState.move.color === "w" ? "white" : "black"]: [
            ...previous[
              gameState.move.color === "w" ? "white" : "black"
            ],
            gameState.move.captured,
          ],
        }));
      }

      if (gameState.checkmate) {
        const winner =
          gameState.turn === "w" ? "Black" : "White";

        setStatus(`Checkmate — ${winner} wins!`);
        setGameOver(true);
      } else if (gameState.draw) {
        setStatus("Draw");
        setGameOver(true);
      } else if (gameState.check) {
        const player =
          gameState.turn === "w" ? "White" : "Black";

        setStatus(`${player} is in check`);
      } else {
        const player =
          gameState.turn === "w" ? "White" : "Black";

        setStatus(`${player} to move`);
      }
    });

    socket.on("game-over", ({ winner }) => {
      setStatus(`${winner} wins by resignation`);
      setGameOver(true);
    });

    socket.on("player-disconnected", () => {
      setStatus("Your opponent left the game");
      setGameStarted(false);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("room-ready");
      socket.off("game-update");
      socket.off("game-over");
      socket.off("player-disconnected");
    };
  }, [socket]);

  function createRoom() {
    if (!connected) {
      setStatus("Not connected to server");
      return;
    }

    socket.emit("create-room", (response) => {
      if (!response.success) {
        setStatus(response.error);
        return;
      }

      setRoomCode(response.roomCode);

      // Room creator is ALWAYS White
      setMyColor("w");

      setGame(new Chess(response.fen));

      setGameStarted(false);
      setGameOver(false);

      setMoves([]);

      setCaptured({
        white: [],
        black: [],
      });

      setStatus(
        "Room created — waiting for opponent"
      );
    });
  }

  function joinRoom() {
    const code = inputCode.trim().toUpperCase();

    if (!code) {
      setStatus("Enter a room code");
      return;
    }

    if (!connected) {
      setStatus("Not connected to server");
      return;
    }

    socket.emit("join-room", code, (response) => {
      if (!response.success) {
        setStatus(response.error);
        return;
      }

      setRoomCode(response.roomCode);

      // Room joiner is ALWAYS Black
      setMyColor("b");

      setGame(new Chess(response.fen));

      setGameStarted(true);
      setGameOver(false);

      setMoves([]);

      setCaptured({
        white: [],
        black: [],
      });

      setStatus("Joined room — game starting");
    });
  }

  function handlePieceDrop({ sourceSquare, targetSquare }) {
    if (!targetSquare) {
      return false;
    }

    if (!gameStarted || gameOver) {
      return false;
    }

    if (!myColor) {
      return false;
    }

    if (game.turn() !== myColor) {
      setStatus("It's not your turn");
      return false;
    }

    const gameCopy = new Chess(game.fen());

    try {
      const move = gameCopy.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      });

      if (!move) {
        return false;
      }

      socket.emit(
        "make-move",
        {
          roomCode,

          move: {
            from: sourceSquare,
            to: targetSquare,
            promotion: "q",
          },
        },
        (response) => {
          if (!response.success) {
            setStatus(response.error);
          }
        }
      );

      return true;
    } catch (error) {
      console.log("Invalid move:", error);
      return false;
    }
  }

  function resign() {
    if (!roomCode || gameOver) {
      return;
    }

    socket.emit("resign", {
      roomCode,
    });
  }

  function resetGame() {
    setGame(new Chess());

    setRoomCode("");
    setInputCode("");

    setMyColor(null);

    setGameStarted(false);
    setGameOver(false);

    setMoves([]);

    setCaptured({
      white: [],
      black: [],
    });

    setStatus(
      "Create a room or join a friend's room"
    );
  }

  function formatCaptured(pieces) {
    const symbols = {
      p: "♟",
      n: "♞",
      b: "♝",
      r: "♜",
      q: "♛",
      k: "♚",
    };

    return pieces.map((piece, index) => (
      <span key={index}>
        {symbols[piece] || piece}
      </span>
    ));
  }

  function getMoveRows() {
    const rows = [];

    for (let i = 0; i < moves.length; i += 2) {
      rows.push({
        number: i / 2 + 1,
        white: moves[i]?.san || "",
        black: moves[i + 1]?.san || "",
      });
    }

    return rows;
  }

  return (
    <div className="game-page">

      {/* HEADER */}

      <div className="game-header">
        <div>
          <div className="game-brand">
            ♞ Sandip.Chess
          </div>

          <div className="game-status">
            {status}
          </div>
        </div>

        <button
          className="back-button"
          onClick={resetGame}
        >
          New Game
        </button>
      </div>

      {/* CREATE / JOIN */}

      {!roomCode && (
        <div
          style={{
            maxWidth: "700px",
            margin: "0 auto 25px",
            padding: "20px",
            border:
              "1px solid rgba(255,255,255,0.08)",
            borderRadius: "14px",
            background:
              "rgba(255,255,255,0.025)",
          }}
        >
          <h2
            style={{
              marginTop: 0,
              fontFamily:
                "Space Grotesk, sans-serif",
            }}
          >
            Play with a friend
          </h2>

          <p
            style={{
              color: "#858890",
              fontSize: "14px",
            }}
          >
            Create a private room and send the
            code to your friend.
          </p>

          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
              marginTop: "18px",
            }}
          >
            <button
              className="primary-button"
              onClick={createRoom}
            >
              Create Room
            </button>

            <input
              value={inputCode}
              onChange={(event) =>
                setInputCode(
                  event.target.value.toUpperCase()
                )
              }
              placeholder="ROOM CODE"
              maxLength={6}
              style={{
                flex: 1,
                minWidth: "150px",
                padding: "13px",
                borderRadius: "9px",
                border:
                  "1px solid rgba(255,255,255,0.1)",
                background: "#111216",
                color: "white",
                outline: "none",
                textTransform: "uppercase",
                fontWeight: "700",
                letterSpacing: "2px",
              }}
            />

            <button
              className="secondary-button"
              onClick={joinRoom}
            >
              Join Room
            </button>
          </div>
        </div>
      )}

      {/* ROOM CODE */}

      {roomCode && (
        <div
          style={{
            maxWidth: "700px",
            margin: "0 auto 25px",
            padding: "18px",
            textAlign: "center",
            border:
              "1px solid rgba(255,255,255,0.08)",
            borderRadius: "14px",
            background:
              "rgba(255,255,255,0.025)",
          }}
        >
          <div
            style={{
              color: "#858890",
              fontSize: "12px",
              letterSpacing: "1.5px",
              fontWeight: "700",
            }}
          >
            ROOM CODE
          </div>

          <div
            style={{
              marginTop: "8px",
              fontFamily:
                "Space Grotesk, sans-serif",
              fontSize: "32px",
              fontWeight: "700",
              letterSpacing: "6px",
            }}
          >
            {roomCode}
          </div>

          <div
            style={{
              marginTop: "7px",
              color: "#777a82",
              fontSize: "13px",
            }}
          >
            You are playing as{" "}
            <strong>
              {myColor === "w"
                ? "White"
                : "Black"}
            </strong>
          </div>
        </div>
      )}

      {/* GAME */}

      <div className="game-layout">

        <div className="board-wrapper">
          <Chessboard
            options={{
              position: game.fen(),

              onPieceDrop:
                handlePieceDrop,

              // White is always at the bottom
              boardOrientation: myColor === "b" ? "black" : "white",

              boardStyle: {
                borderRadius: "14px",
                boxShadow:
                  "0 25px 80px rgba(0,0,0,0.55)",
              },
            }}
          />
        </div>

        <aside className="game-sidebar">

          {/* BLACK */}

          <div
            className={`player-box ${
              game.turn() === "b" &&
              !gameOver
                ? "active-player"
                : ""
            }`}
          >
            <div className="player-avatar">
              ♟
            </div>

            <div className="player-info">
              <strong>
                {myColor === "b"
                  ? "You"
                  : "Opponent"}
              </strong>

              <span>
                Black • 1200
              </span>
            </div>
          </div>

          {/* CAPTURED WHITE */}

          <div className="captured-pieces">
            {formatCaptured(
              captured.white
            )}
          </div>

          {/* MOVES */}

          <div className="moves-box">

            <div className="moves-title">
              Game
            </div>

            <div className="moves-content">

              {moves.length === 0 ? (
                <p>
                  No moves yet
                </p>
              ) : (
                getMoveRows().map(
                  (row) => (
                    <div
                      className="move-row"
                      key={row.number}
                    >
                      <span className="move-number">
                        {row.number}.
                      </span>

                      <span>
                        {row.white}
                      </span>

                      <span>
                        {row.black}
                      </span>
                    </div>
                  )
                )
              )}

            </div>
          </div>

          {/* CAPTURED BLACK */}

          <div className="captured-pieces">
            {formatCaptured(
              captured.black
            )}
          </div>

          {/* WHITE */}

          <div
            className={`player-box ${
              game.turn() === "w" &&
              !gameOver
                ? "active-player"
                : ""
            }`}
          >
            <div className="player-avatar white">
              ♙
            </div>

            <div className="player-info">
              <strong>
                {myColor === "w"
                  ? "You"
                  : "Opponent"}
              </strong>

              <span>
                White • 1200
              </span>
            </div>
          </div>

          {/* GAME OVER */}

          {gameOver && (
            <div className="game-over">

              <strong>
                Game Over
              </strong>

              <span>
                {status}
              </span>

              <button
                onClick={resetGame}
              >
                🔄 New Game
              </button>

            </div>
          )}

          {/* ACTIONS */}

          {gameStarted &&
            !gameOver && (
              <div className="game-actions">

                <button
                  onClick={resign}
                >
                  🏳️ Resign
                </button>

              </div>
            )}

        </aside>
      </div>
    </div>
  );
}

export default Game;