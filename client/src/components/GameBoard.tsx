import React, { useState, useEffect, useRef } from 'react';
import { GameState, ScoreCategory } from '../types/game';
import { Die } from './Die';
import { ScoreCard } from './ScoreCard';
import { YatzyOverlay } from './YatzyOverlay';
import { DebugPanel } from './DebugPanel';
import './GameBoard.css';

interface Props {
  gameState: GameState;
  myId: string;
  onRoll: () => void;
  onToggleHold: (i: number) => void;
  onScore: (cat: ScoreCategory) => void;
  onSurrender: () => void;
  onLeave: () => void;
  error: string | null;
  opponentDisconnected: boolean;
  // Bot game extras
  isBotGame?: boolean;
  adBonusAvailable?: boolean;
  onWatchAd?: () => void;
  // Debug mode
  isDebugMode?: boolean;
  debugUndo?: () => void;
  debugSetDice?: (dice: number[]) => void;
  debugForceFinish?: (win: boolean) => void;
  debugSetUpperScore?: (score: number) => void;
  debugFillScores?: () => void;
  historyCount?: number;
  lscMultiplier?: number;
  lscStreak?: number;
}

export const GameBoard: React.FC<Props> = ({
  gameState, myId, onRoll, onToggleHold, onScore, onSurrender, onLeave, error, opponentDisconnected,
  isBotGame = false, adBonusAvailable = false, onWatchAd,
  isDebugMode = false, debugUndo, debugSetDice, debugForceFinish, 
  debugSetUpperScore, debugFillScores,
  historyCount = 0, lscMultiplier = 1, lscStreak = 0
}) => {
  const [confirmSurrender, setConfirmSurrender] = useState(false);

  const handleSurrenderClick = () => setConfirmSurrender(true);
  const handleSurrenderConfirm = () => { setConfirmSurrender(false); onSurrender(); };
  const handleSurrenderCancel = () => setConfirmSurrender(false);
  const { players, currentPlayerIndex, dice, heldDice, rollsLeft, phase } = gameState;
  const currentPlayer = players[currentPlayerIndex];
  const isMyTurn = currentPlayer?.id === myId;
  const [rolling, setRolling] = useState(false);
  
  // Detect if current dice is a Yatzy
  const isYatzy = dice.every(d => d === dice[0]) && rollsLeft < 3;

  const [waitingForRoll, setWaitingForRoll] = useState(false);
  const [rollTrigger, setRollTrigger] = useState(0); // Counter to force animation
  const rollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Trigger animation only when rollTrigger changes (i.e., after actual dice roll)
  useEffect(() => {
    if (rollTrigger > 0) {
      setRolling(true);
      const t = setTimeout(() => setRolling(false), 400);
      return () => clearTimeout(t);
    }
  }, [rollTrigger]); // Only trigger on rollTrigger change, NOT on dice change

  // Clear waitingForRoll when rollsLeft changes (server confirmed the roll)
  const prevRollsLeftRef = useRef(rollsLeft);
  useEffect(() => {
    if (rollsLeft !== prevRollsLeftRef.current) {
      prevRollsLeftRef.current = rollsLeft;
      setWaitingForRoll(false);
      setRollTrigger(prev => prev + 1); // Increment to trigger animation
      if (rollTimeoutRef.current) clearTimeout(rollTimeoutRef.current);
    }
  }, [rollsLeft]);

  // Clear waiting flag whenever it's no longer our turn (e.g. after scoring)
  useEffect(() => {
    if (!isMyTurn) {
      setWaitingForRoll(false);
      if (rollTimeoutRef.current) clearTimeout(rollTimeoutRef.current);
    }
  }, [isMyTurn]);

  // Cleanup timeout on unmount
  useEffect(() => () => { if (rollTimeoutRef.current) clearTimeout(rollTimeoutRef.current); }, []);

  const me = players.find((p) => p.id === myId);
  const opponent = players.find((p) => p.id !== myId);

  const canRoll = isMyTurn && rollsLeft > 0 && phase === 'rolling' && !waitingForRoll;

  const handleRoll = () => {
    if (!canRoll) return;
    setWaitingForRoll(true);
    // Safety fallback: clear lock after 3s in case server response is lost
    rollTimeoutRef.current = setTimeout(() => setWaitingForRoll(false), 3000);
    onRoll();
  };

  const rollsLabel = rollsLeft === 3
    ? '🎲🎲🎲'
    : rollsLeft === 0
    ? '📋 ↓'
    : `🎲 ×${rollsLeft}`;

  return (
    <div className="board">
      <YatzyOverlay show={isYatzy} />
      {/* Header */}
      <div className="board-header">
        <div className={`turn-indicator ${isMyTurn ? 'turn-indicator--mine' : 'turn-indicator--theirs'}`}>
          {isMyTurn ? '⚡ Ваш ход' : `⏳ Ход: ${currentPlayer?.name}`}
        </div>
        <div className="score-summary">
          <span className="my-score">{me?.avatar ?? '👤'} {me?.totalScore ?? 0}</span>
          <span className="vs">vs</span>
          <span className="opp-score">{opponent?.totalScore ?? 0} {opponent?.avatar ?? '🤖'}</span>
        </div>
        <button className="surrender-btn" title="Сдаться" onClick={handleSurrenderClick}>🏳️</button>
      </div>

      {confirmSurrender && (
        <div className="surrender-confirm">
          <span>🏳️❓</span>
          <button className="surrender-confirm__yes" onClick={handleSurrenderConfirm}>✔</button>
          <button className="surrender-confirm__no" onClick={handleSurrenderCancel}>✕</button>
        </div>
      )}

      {opponentDisconnected && (
        <div className="alert alert--warn">
          <span>📡 Противник отключился (до 3 мин)...</span>
          <button className="leave-btn leave-btn--inline" onClick={onLeave} title="Отменить ожидание">🚪</button>
        </div>
      )}
      {error && <div className="alert alert--error">{error}</div>}

      {/* Dice area */}
      <div className="dice-section">
        {isMyTurn && <p className="rolls-label">{rollsLabel}</p>}
        <div className="dice-row">
          {dice.map((val, i) => (
            <Die
              key={i}
              value={val}
              held={heldDice[i]}
              rolling={rolling && !heldDice[i]}
              canHold={isMyTurn && rollsLeft < 3 && rollsLeft > 0}
              onToggle={() => onToggleHold(i)}
              isYatzy={isYatzy}
            />
          ))}
        </div>
        {isMyTurn && (
          <button
            className={`roll-btn ${!canRoll ? 'roll-btn--disabled' : ''}`}
            onClick={handleRoll}
            disabled={!canRoll}
          >
            {rollsLeft === 0 ? '🎯 Выберите категорию' : `🎲 Бросить (${rollsLeft} осталось)`}
          </button>
        )}

        {/* Bonus roll — once per game */}
        {isBotGame && isMyTurn && adBonusAvailable && (
          <button className="ad-btn ad-btn--free" onClick={onWatchAd}>
            🎁 +1 бросок (1 раз за игру)
          </button>
        )}

        {!isMyTurn && (
          <p className="wait-text">⏳</p>
        )}
      </div>

      {/* Score table */}
      <div className="scorecard-section">
        <ScoreCard
          players={players}
          myId={myId}
          currentPlayerId={currentPlayer?.id ?? ''}
          dice={dice}
          rollsLeft={rollsLeft}
          phase={phase}
          onScore={onScore}
        />
      </div>

      {isDebugMode && debugUndo && debugSetDice && debugForceFinish && (
        <DebugPanel
          dice={dice}
          historyCount={historyCount}
          onSetDice={debugSetDice}
          onUndo={debugUndo}
          onForceFinish={debugForceFinish}
          onSetUpperScore={debugSetUpperScore}
          onFillScores={debugFillScores}
          lscMultiplier={lscMultiplier}
          lscStreak={lscStreak}
        />
      )}
    </div>
  );
};
