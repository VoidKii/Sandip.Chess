import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { io } from "socket.io-client";
import "./Game.css";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3001";
const START_TIME = 5 * 60;

function Game() {
  const [socket] = useState(() => io(SOCKET_URL));
  const [game, setGame] = useState(new Chess());
  const [status, setStatus] = useState("Create a room or join a friend's room");
  const [roomCode, setRoomCode] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [myColor, setMyColor] = useState(null);
  const [connected, setConnected] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [moves, setMoves] = useState([]);
  const [captured, setCaptured] = useState({ white: [], black: [] });
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [promotion, setPromotion] = useState(null);
  const [clocks, setClocks] = useState({ w: START_TIME, b: START_TIME });
  const [drawOffered, setDrawOffered] = useState(false);

  useEffect(() => {
    const onConnect = () => { setConnected(true); setStatus("Connected — create or join a room"); };
    const onDisconnect = () => { setConnected(false); setStatus("Disconnected from server"); };
    const onReady = ({ fen, clocks: serverClocks }) => {
      setGame(new Chess(fen));
      setClocks(serverClocks || { w: START_TIME, b: START_TIME });
      setGameStarted(true);
      setGameOver(false);
      setSelectedSquare(null);
      setStatus("Game started — White to move");
    };
    const onUpdate = (state) => {
      setGame(new Chess(state.fen));
      setSelectedSquare(null);
      if (state.clocks) setClocks(state.clocks);
      setMoves((previous) => [...previous, { color: state.move.color, san: state.move.san }]);
      if (state.move.captured) setCaptured((previous) => ({ ...previous, [state.move.color === "w" ? "white" : "black"]: [...previous[state.move.color === "w" ? "white" : "black"], state.move.captured] }));
      if (state.checkmate) { setStatus(`${state.turn === "w" ? "Black" : "White"} wins by checkmate!`); setGameOver(true); }
      else if (state.draw) { setStatus("Draw"); setGameOver(true); }
      else if (state.check) setStatus(`${state.turn === "w" ? "White" : "Black"} is in check`);
      else setStatus(`${state.turn === "w" ? "White" : "Black"} to move`);
    };
    const onClockUpdate = (state) => {
      setClocks(state);
    };
    const onOver = ({ winner, reason }) => {
      if (reason === "timeout") {
        setStatus(`${winner} wins on time!`);
      } else if (reason === "draw") {
        setStatus("Draw agreed");
      } else {
        setStatus(`${winner} wins by ${reason}`);
      }
      setGameOver(true);
    };
    const onDisconnectPlayer = () => { setStatus("Your opponent left the game"); setGameStarted(false); };
    const onDrawOffer = () => { setDrawOffered(true); setStatus("Your opponent offered a draw"); };
    const onDrawResult = ({ accepted }) => { setDrawOffered(false); if (accepted) { setStatus("Draw agreed"); setGameOver(true); } };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room-ready", onReady);
    socket.on("game-update", onUpdate);
    socket.on("clock-update", onClockUpdate);
    socket.on("game-over", onOver);
    socket.on("player-disconnected", onDisconnectPlayer);
    socket.on("draw-offer", onDrawOffer);
    socket.on("draw-result", onDrawResult);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room-ready", onReady);
      socket.off("game-update", onUpdate);
      socket.off("clock-update", onClockUpdate);
      socket.off("game-over", onOver);
      socket.off("player-disconnected", onDisconnectPlayer);
      socket.off("draw-offer", onDrawOffer);
      socket.off("draw-result", onDrawResult);
    };
  }, [socket]);

  useEffect(() => {
    if (!gameStarted || gameOver || !roomCode) return;
    const sync = () => socket.emit("clock-sync", { roomCode });
    const timer = setInterval(sync, 500);
    sync();
    return () => clearInterval(timer);
  }, [gameStarted, gameOver, roomCode, socket]);

  function createRoom() {
    if (!connected) return setStatus("Not connected to server");
    socket.emit("create-room", (response) => {
      if (!response.success) return setStatus(response.error);
      setRoomCode(response.roomCode);
      setMyColor("w");
      setGame(new Chess(response.fen));
      setGameStarted(false);
      setGameOver(false);
      setMoves([]);
      setCaptured({ white: [], black: [] });
      setClocks(response.clocks || { w: START_TIME, b: START_TIME });
      setStatus("Room created — waiting for opponent");
    });
  }

  function joinRoom() {
    const code = inputCode.trim().toUpperCase();
    if (!code) return setStatus("Enter a room code");
    if (!connected) return setStatus("Not connected to server");
    socket.emit("join-room", code, (response) => {
      if (!response.success) return setStatus(response.error);
      setRoomCode(response.roomCode);
      setMyColor("b");
      setGame(new Chess(response.fen));
      setGameStarted(true);
      setGameOver(false);
      setMoves([]);
      setCaptured({ white: [], black: [] });
      setClocks(response.clocks || { w: START_TIME, b: START_TIME });
      setStatus("Joined room — game starting");
    });
  }

  function sendMove(from, to, promotionPiece = "q") {
    if (!roomCode || !gameStarted || gameOver || !myColor || game.turn() !== myColor) return false;
    const test = new Chess(game.fen());
    try {
      const move = test.move({ from, to, promotion: promotionPiece });
      if (!move) return false;
      socket.emit("make-move", { roomCode, move: { from, to, promotion: promotionPiece } }, (response) => {
        if (!response.success) setStatus(response.error);
      });
      return true;
    } catch {
      return false;
    }
  }

  function chooseMove(from, to) {
    if (!gameStarted || gameOver || game.turn() !== myColor) return;
    if (game.get(from)?.color !== myColor) return;
    const target = game.moves({ square: from, verbose: true }).find((move) => move.to === to);
    if (!target) return setSelectedSquare(from);
    if (target.promotion) return setPromotion({ from, to });
    sendMove(from, to);
  }

  function handleSquareClick(square) {
    if (!gameStarted || gameOver || game.turn() !== myColor) return;
    if (!selectedSquare) {
      if (game.get(square)?.color === myColor) setSelectedSquare(square);
      return;
    }
    if (selectedSquare === square) return setSelectedSquare(null);
    if (game.get(square)?.color === myColor) return setSelectedSquare(square);
    chooseMove(selectedSquare, square);
  }

  function handlePieceDrop({ sourceSquare, targetSquare }) {
    if (!targetSquare) return false;
    setSelectedSquare(null);
    try {
      const move = game.moves({ square: sourceSquare, verbose: true }).find((m) => m.to === targetSquare);
      if (move?.promotion) {
        setPromotion({ from: sourceSquare, to: targetSquare });
        return false;
      }
      return sendMove(sourceSquare, targetSquare);
    } catch {
      return false;
    }
  }

  function answerDraw(accepted) {
    socket.emit("answer-draw", { roomCode, accepted });
    setDrawOffered(false);
  }

  function resetGame() {
    socket.disconnect();
    socket.connect();
    setGame(new Chess());
    setRoomCode("");
    setInputCode("");
    setMyColor(null);
    setGameStarted(false);
    setGameOver(false);
    setMoves([]);
    setCaptured({ white: [], black: [] });
    setSelectedSquare(null);
    setPromotion(null);
    setClocks({ w: START_TIME, b: START_TIME });
    setDrawOffered(false);
    setStatus("Create a room or join a friend's room");
  }

  function formatTime(seconds) {
    const safe = Math.max(0, Math.ceil(Number(seconds) || 0));
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
  }

  function formatCaptured(pieces) {
    const symbols = { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" };
    return pieces.map((piece, index) => <span key={index}>{symbols[piece] || piece}</span>);
  }

  function getMoveRows() {
    const rows = [];
    for (let i = 0; i < moves.length; i += 2) rows.push({ number: i / 2 + 1, white: moves[i]?.san || "", black: moves[i + 1]?.san || "" });
    return rows;
  }

  const squareStyles = useMemo(() => {
    if (!selectedSquare) return {};
    const styles = { [selectedSquare]: { background: "rgba(255, 214, 80, 0.55)" } };
    game.moves({ square: selectedSquare, verbose: true }).forEach((move) => {
      styles[move.to] = { background: game.get(move.to) ? "rgba(220,70,70,0.65)" : "radial-gradient(circle, rgba(60,190,100,.65) 18%, transparent 20%)" };
    });
    return styles;
  }, [game, selectedSquare]);

  return <div className="game-page">
    <div className="game-header"><div><div className="game-brand">♞ Sandip.Chess</div><div className="game-status"><span className={connected ? "connection-dot online" : "connection-dot"}></span>{status}</div></div><button className="back-button" onClick={resetGame}>New Game</button></div>
    {!roomCode && <div className="room-panel"><h2>Play with a friend</h2><p>Create a private room and send the code to your friend.</p><div className="room-controls"><button className="primary-button" onClick={createRoom}>Create Room</button><input value={inputCode} onChange={(e) => setInputCode(e.target.value.toUpperCase())} placeholder="ROOM CODE" maxLength={6}/><button className="secondary-button" onClick={joinRoom}>Join Room</button></div></div>}
    {roomCode && <div className="room-panel room-code-panel"><small>ROOM CODE</small><div className="room-code">{roomCode}</div><span>You are <strong>{myColor === "w" ? "White" : "Black"}</strong> • 5+0</span></div>}
    <div className="game-layout">
      <div className="board-wrapper"><Chessboard options={{ position: game.fen(), onPieceDrop: handlePieceDrop, onSquareClick: handleSquareClick, allowDragging: gameStarted && !gameOver && game.turn() === myColor, boardOrientation: myColor === "b" ? "black" : "white", squareStyles, boardStyle: { borderRadius: "14px", boxShadow: "0 25px 80px rgba(0,0,0,0.55)" } }}/></div>
      <aside className="game-sidebar">
        <div className={`clock ${game.turn() === "b" && !gameOver ? "active-clock" : ""}`}>{formatTime(clocks.b)}</div><div className="player-box"><div className="player-avatar">♟</div><div className="player-info"><strong>{myColor === "b" ? "You" : "Opponent"}</strong><span>Black • 1200</span></div></div>
        <div className="captured-pieces">{formatCaptured(captured.white)}</div><div className="moves-box"><div className="moves-title">Game</div><div className="moves-content">{moves.length === 0 ? <p>No moves yet</p> : getMoveRows().map((row) => <div className="move-row" key={row.number}><span className="move-number">{row.number}.</span><span>{row.white}</span><span>{row.black}</span></div>)}</div></div>
        <div className="captured-pieces">{formatCaptured(captured.black)}</div><div className={`clock ${game.turn() === "w" && !gameOver ? "active-clock" : ""}`}>{formatTime(clocks.w)}</div><div className="player-box"><div className="player-avatar white">♙</div><div className="player-info"><strong>{myColor === "w" ? "You" : "Opponent"}</strong><span>White • 1200</span></div></div>
        {drawOffered && <div className="draw-offer"><strong>Draw offered</strong><div><button onClick={() => answerDraw(true)}>Accept</button><button onClick={() => answerDraw(false)}>Decline</button></div></div>}
        {gameOver ? <div className="game-over"><strong>Game Over</strong><span>{status}</span><button onClick={resetGame}>🔄 New Game</button></div> : gameStarted && <div className="game-actions"><button onClick={() => socket.emit("offer-draw", { roomCode })}>🤝 Draw</button><button onClick={() => socket.emit("resign", { roomCode })}>🏳️ Resign</button></div>}
      </aside>
    </div>
    {promotion && <div className="promotion-overlay"><div className="promotion-box"><h3>Choose promotion</h3><div>{[["q","♛"],["r","♜"],["b","♝"],["n","♞"]].map(([piece, icon]) => <button key={piece} onClick={() => { sendMove(promotion.from, promotion.to, piece); setPromotion(null); }}>{icon}</button>)}</div></div></div>}
  </div>;
}

export default Game;
