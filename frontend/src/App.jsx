import { useState } from "react";
import "./App.css";
import Game from "./Game";

function App() {
  const [page, setPage] = useState("home");

  if (page === "game") {
    return <Game />;
  }

  return (
    <div className="app">
      {/* NAVBAR */}
      <header className="navbar">
        <div className="brand" onClick={() => setPage("home")}>
          <div className="brand-icon">♞</div>

          <span>
            Sandip<span>.Chess</span>
          </span>
        </div>

        <nav>
          <button
            className="nav-item active"
            onClick={() => setPage("home")}
          >
            Home
          </button>

          <button
            className="nav-item"
            onClick={() => setPage("game")}
          >
            Play
          </button>

          <button className="nav-item">
            Puzzles
          </button>

          <button className="nav-item">
            Tournaments
          </button>

          <button className="nav-item">
            Leaderboard
          </button>
        </nav>

        <div className="nav-actions">
          <button className="icon-button">
            ☾
          </button>

          <button className="login-button">
            Sign In
          </button>

          <button className="signup-button">
            Create Account
          </button>
        </div>
      </header>

      {/* HERO */}
      <main>
        <section className="hero">
          <div className="hero-content">
            <div className="eyebrow">
              <span className="live-dot"></span>
              THE NEW WAY TO PLAY CHESS
            </div>

            <h1>
              Think.
              <br />
              <span>Play.</span>
              <br />
              Conquer.
            </h1>

            <p>
              Play chess with friends, challenge players around
              the world, solve puzzles and climb the leaderboard.
            </p>

            <div className="hero-buttons">
              <button
                className="primary-button"
                onClick={() => setPage("game")}
              >
                ♟ Play Chess
              </button>

              <button
                className="secondary-button"
                onClick={() => setPage("game")}
              >
                Play a Friend
              </button>
            </div>

            <div className="quick-stats">
              <div>
                <strong>∞</strong>
                <span>Games</span>
              </div>

              <div>
                <strong>24/7</strong>
                <span>Online</span>
              </div>

              <div>
                <strong>♟</strong>
                <span>Your Chess</span>
              </div>
            </div>
          </div>

          {/* HERO BOARD */}
          <div className="hero-board-container">
            <div className="board-glow"></div>

            <div className="chess-board">
              {Array.from({ length: 64 }).map((_, index) => (
                <div
                  key={index}
                  className={`square ${
                    (Math.floor(index / 8) + index) % 2 === 0
                      ? "light"
                      : "dark"
                  }`}
                >
                  {index < 16 ? "♟" : ""}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="features">
          <div className="section-heading">
            <div>
              <span className="eyebrow">
                EVERYTHING CHESS
              </span>

              <h2>
                Your game. Your way.
              </h2>
            </div>

            <p>
              Everything you need to play, improve and compete.
            </p>
          </div>

          <div className="feature-grid">
            <div className="feature-card large-card">
              <div className="feature-icon">
                ⚡
              </div>

              <h3>
                Play instantly
              </h3>

              <p>
                Find a game in seconds or create a private
                match for your friends.
              </p>

              <button onClick={() => setPage("game")}>
                Start playing →
              </button>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                🧩
              </div>

              <h3>
                Daily puzzles
              </h3>

              <p>
                Sharpen your tactics every day.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                🏆
              </div>

              <h3>
                Compete
              </h3>

              <p>
                Climb the rankings and prove yourself.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                🤖
              </div>

              <h3>
                Play bots
              </h3>

              <p>
                Practice against different skill levels.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="cta">
          <h2>
            Ready to play?
          </h2>

          <p>
            Your next game starts here.
          </p>

          <button
            className="primary-button"
            onClick={() => setPage("game")}
          >
            Play Chess
          </button>
        </section>
      </main>

      {/* FOOTER */}
      <footer>
        <div className="brand footer-brand">
          <div className="brand-icon">
            ♞
          </div>

          <span>
            Sandip<span>.Chess</span>
          </span>
        </div>

        <p>
          Play. Think. Conquer.
        </p>

        <p>
          © 2026 Sandip.Chess
        </p>
      </footer>
    </div>
  );
}

export default App;