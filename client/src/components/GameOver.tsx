import React, { useEffect, useRef } from 'react';
import { Player } from '../types/game';
import './GameOver.css';

interface Particle {
  id: number;
  emoji: string;
  x: number;
  duration: number;
  delay: number;
  size: number;
  rotation: number;
}

const WIN_EMOJIS  = ['🎆','🎇','✨','🎉','🥳','⭐','💛','🌟'];
const LOSE_EMOJIS = ['💔','😢','😭','🥀','😔','💧'];

const Particles: React.FC<{ win: boolean }> = ({ win }) => {
  const emojis = win ? WIN_EMOJIS : LOSE_EMOJIS;
  const count  = win ? 28 : 20;

  const particles: Particle[] = Array.from({ length: count }, (_, i) => ({
    id: i,
    emoji: emojis[i % emojis.length],
    x: Math.random() * 100,
    duration: 2.2 + Math.random() * 2.5,
    delay: Math.random() * 2.5,
    size: 18 + Math.random() * 22,
    rotation: Math.random() * 720 - 360,
  }));

  return (
    <div className="particles" aria-hidden>
      {particles.map((p) => (
        <span
          key={p.id}
          className="particle"
          style={{
            left: `${p.x}%`,
            fontSize: `${p.size}px`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            '--rot': `${p.rotation}deg`,
          } as React.CSSProperties}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
};

interface Props {
  winner: string;
  players: Player[];
  myId: string;
  onRematch: () => void;
  onLeave: () => void;
  error: string | null;
  surrendered?: string;
  opponentLeft?: boolean;
}

export const GameOver: React.FC<Props> = ({ winner, players, myId, onRematch, onLeave, error, surrendered, opponentLeft }) => {
  const iWon = winner === myId;
  const iSurrendered = surrendered === myId;
  const winnerPlayer = players.find((p) => p.id === winner);

  let resultTitle: string;
  let resultIcon: string;
  if (opponentLeft) {
    resultTitle = 'Противник покинул игру';
    resultIcon = '🏆';
  } else if (iSurrendered) {
    resultTitle = 'Вы сдались';
    resultIcon = '🏳️';
  } else if (iWon) {
    resultTitle = 'Вы победили!';
    resultIcon = '🏆';
  } else {
    resultTitle = 'Вы проиграли';
    resultIcon = '😔';
  }

  const showWin  = iWon || opponentLeft;
  const showLose = !showWin && !iSurrendered;

  return (
    <div className="gameover">
      {showWin  && <Particles win={true}  />}
      {showLose && <Particles win={false} />}
      <div className="gameover-card">
        <div className="result-icon">{resultIcon}</div>
        <h2 className="result-title">{resultTitle}</h2>
        <p className="winner-name">{winnerPlayer?.name}</p>

        <div className="scores-final">
          {players.map((p) => (
            <div key={p.id} className={`score-row ${p.id === winner ? 'score-row--winner' : ''} ${p.id === myId ? 'score-row--me' : ''}`}>
              <span className="pname">
                {p.avatar} {p.name}
                {p.id === winner && <span className="winner-badge">🏆</span>}
              </span>
              <span className="pscore">{p.totalScore}</span>
            </div>
          ))}
        </div>

        <button className="rematch-btn" onClick={onRematch}>
          🎲 Реванш
        </button>
        <button className="leave-btn" onClick={onLeave}>
          🚪 Выйти в лобби
        </button>
        {error && <p className="gameover-error">{error}</p>}
      </div>
    </div>
  );
};
