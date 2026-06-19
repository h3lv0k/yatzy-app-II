import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameState, ScoreCategory } from '../types/game';
import { Die } from './Die';
import { ScoreCard } from './ScoreCard';
import { YatzyOverlay } from './YatzyOverlay';
import { DebugPanel } from './DebugPanel';
import { isYatzyRoll } from '../utils/yatzy';
import { useTelegram } from '../hooks/useTelegram';
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
  sendReaction?: (emoji: string) => void;
  onReaction?: (cb: (data: { senderId: string; emoji: string }) => void) => () => void;
}

export const GameBoard: React.FC<Props> = ({
  gameState, myId, onRoll, onToggleHold, onScore, onSurrender, onLeave, error, opponentDisconnected,
  isBotGame = false, adBonusAvailable = false, onWatchAd,
  isDebugMode = false, debugUndo, debugSetDice, debugForceFinish, 
  debugSetUpperScore, debugFillScores,
  historyCount = 0,
  sendReaction, onReaction
}) => {
  const [confirmSurrender, setConfirmSurrender] = useState(false);

  const handleSurrenderClick = () => setConfirmSurrender(true);
  const handleSurrenderConfirm = () => { setConfirmSurrender(false); onSurrender(); };
  const handleSurrenderCancel = () => setConfirmSurrender(false);
  const { players, currentPlayerIndex, dice, heldDice, rollsLeft, phase } = gameState;
  const me = players.find((p) => p.id === myId);
  const opponent = players.find((p) => p.id !== myId);
  const currentPlayer = players[currentPlayerIndex];
  const isMyTurn = currentPlayer?.id === myId;
  const [rolling, setRolling] = useState(false);
  
  // State to track players who have already triggered the Yatzy effect
  const [triggeredYatzyPlayers, setTriggeredYatzyPlayers] = useState<string[]>([]);
  const lastTurnYatzyRef = useRef<Record<string, boolean>>({});

  // Detect if current dice is a Yatzy
  const isYatzyRollCurrent = isYatzyRoll(dice) && rollsLeft < 3;
  const isYatzy = isYatzyRollCurrent && currentPlayer && !triggeredYatzyPlayers.includes(currentPlayer.id);

  // Track when a Yatzy is rolled for the first time by a player (deferred update to turn transitions)
  const prevTurnRef = useRef(gameState.turn);
  const prevPlayerIdRef = useRef(currentPlayer?.id);

  useEffect(() => {
    if (gameState.turn === 0) {
      setTriggeredYatzyPlayers([]);
      lastTurnYatzyRef.current = {};
    }

    if (gameState.turn !== prevTurnRef.current || currentPlayer?.id !== prevPlayerIdRef.current) {
      const prevPlayerId = prevPlayerIdRef.current;
      if (prevPlayerId && lastTurnYatzyRef.current[prevPlayerId]) {
        setTriggeredYatzyPlayers((prev) => {
          if (!prev.includes(prevPlayerId)) {
            return [...prev, prevPlayerId];
          }
          return prev;
        });
      }
      if (currentPlayer?.id) {
        lastTurnYatzyRef.current[currentPlayer.id] = false;
      }
      prevTurnRef.current = gameState.turn;
      prevPlayerIdRef.current = currentPlayer?.id;
    }

    if (isYatzyRollCurrent && currentPlayer?.id) {
      lastTurnYatzyRef.current[currentPlayer.id] = true;
    }
  }, [gameState.turn, currentPlayer?.id, isYatzyRollCurrent]);

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

  // ── Reactions State & Logic ──────────────────
  const { haptic } = useTelegram();

  // Celebrate with haptic feedback on Yatzy!
  useEffect(() => {
    if (isYatzy) {
      haptic?.notificationOccurred('success');
    }
  }, [isYatzy, haptic]);
  const [reactionTrayOpen, setReactionTrayOpen] = useState(false);
  const [reactionTab, setReactionTab] = useState<'emoji' | 'phrases'>('emoji');
  const [activeReactions, setActiveReactions] = useState<Array<{
    id: string;
    emoji: string;
    senderId: string;
    avatar: string;
    offsetX: number;
    offsetY: number;
  }>>([]);
  const trayRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const triggerReactionAnim = useCallback((emoji: string, senderId: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    
    // Find sender avatar
    const sender = players.find((p) => p.id === senderId);
    const avatar = sender?.avatar ?? '👤';

    // Random offset around the center (-25px to +25px)
    const offsetX = (Math.random() - 0.5) * 50;
    const offsetY = (Math.random() - 0.5) * 50;

    setActiveReactions((prev) => [...prev, { id, emoji, senderId, avatar, offsetX, offsetY }]);

    if (senderId !== myId) {
      haptic?.impactOccurred('light');
    }

    setTimeout(() => {
      setActiveReactions((prev) => prev.filter((r) => r.id !== id));
    }, 1800);
  }, [players, myId, haptic]);

  const handleSendReaction = (emoji: string) => {
    haptic?.impactOccurred('medium');
    triggerReactionAnim(emoji, myId);

    if (isBotGame) {
      // Simulate bot reaction
      setTimeout(() => {
        if (Math.random() < 0.7) {
          const responses: Record<string, string[]> = {
            '👍': ['👍', '😎', '🎉'],
            '🔥': ['🔥', '😎', '🎉'],
            '🎉': ['🎉', '😎', '👍'],
            '💩': ['😎', '😢', '👍'],
            '😎': ['😎', '👍', '🔥'],
            '😢': ['😢', '👍', '😎'],
            '😘': ['😘', '🖤', '🥂'],
            '🖤': ['🖤', '😘', '👍'],
            '💅': ['💅', '😎', '🖤'],
            '🥂': ['🥂', '🎉', '😎'],
            '😈': ['😈', '😎', '🔥'],
            '🫦': ['🫦', '😘', '🖤', '😈'],
            '🖕': ['🖕', '😈', '💩', '😢'],
            '💥': ['💥', '🔥', '😎'],
            'Сосать': ['😢', '💩', '🖕', 'иди нахуй'],
            'иди нахуй': ['😈', '🖕', 'Сосать'],
            'Королева': ['👑', '😘', '🖤'],
          };
          const list = responses[emoji] || ['👍'];
          const botEmoji = list[Math.floor(Math.random() * list.length)];
          triggerReactionAnim(botEmoji, 'bot');
        }
      }, 800 + Math.random() * 700);
    } else {
      sendReaction?.(emoji);
    }
    setReactionTrayOpen(false);
  };

  // Close reaction tray on click outside
  useEffect(() => {
    if (!reactionTrayOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        trayRef.current && 
        !trayRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setReactionTrayOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [reactionTrayOpen]);

  // Listen for socket reactions
  useEffect(() => {
    if (!onReaction || isBotGame) return;
    const unsubscribe = onReaction(({ senderId, emoji }) => {
      triggerReactionAnim(emoji, senderId);
    });
    return () => unsubscribe();
  }, [onReaction, isBotGame, triggerReactionAnim]);

  // Auto-reactions from Bot (when Bot rolls Yatzy)
  const lastDiceStrRef = useRef('');
  useEffect(() => {
    if (!isBotGame) return;
    const isBotTurn = currentPlayer?.id === 'bot';
    if (!isBotTurn) return;

    const diceStr = dice.join(',');
    if (diceStr !== lastDiceStrRef.current) {
      lastDiceStrRef.current = diceStr;
      if (isYatzyRoll(dice) && rollsLeft < 3) {
        setTimeout(() => {
          triggerReactionAnim(Math.random() > 0.5 ? '🔥' : '😎', 'bot');
        }, 600);
      }
    }
  }, [dice, isBotGame, currentPlayer, rollsLeft, triggerReactionAnim]);

  // Auto-reactions from Bot (when Bot scores 0 or high values)
  const lastBotScoresRef = useRef<Record<string, number | undefined>>({});
  useEffect(() => {
    if (!isBotGame || !opponent) return;
    const currentScores = opponent.scores;
    const lastScores = lastBotScoresRef.current;

    const newCat = Object.keys(currentScores).find(
      (cat) => currentScores[cat as ScoreCategory] !== undefined && lastScores[cat] === undefined
    ) as ScoreCategory | undefined;

    if (newCat) {
      const scoredValue = currentScores[newCat];
      if (scoredValue === 0) {
        setTimeout(() => {
          triggerReactionAnim('😢', 'bot');
        }, 800);
      } else if (scoredValue !== undefined && scoredValue >= 40) {
        setTimeout(() => {
          triggerReactionAnim('😎', 'bot');
        }, 800);
      }
    }
    lastBotScoresRef.current = { ...currentScores };
  }, [opponent?.scores, isBotGame, opponent, triggerReactionAnim]);

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

      {/* Floating Reactions overlay */}
      <div className="reactions-container">
        {activeReactions.map((r) => {
          const isPhrase = ['Сосать', 'иди нахуй', 'Королева'].includes(r.emoji);
          if (isPhrase) {
            let phraseClass = '';
            let extraEmojis: string[] = [];
            if (r.emoji === 'Сосать') {
              phraseClass = 'phrase-suck';
              extraEmojis = ['😈', '🍓', '🔞', '🫦'];
            } else if (r.emoji === 'иди нахуй') {
              phraseClass = 'phrase-fucking-go';
              extraEmojis = ['🖕', '🖕', '🖕'];
            } else if (r.emoji === 'Королева') {
              phraseClass = 'phrase-queen';
              extraEmojis = ['👑', '💎', '✨'];
            }

            return (
              <div
                key={r.id}
                className={`floating-phrase ${phraseClass}`}
                style={{
                  left: `calc(50% + ${r.offsetX}px)`,
                  top: `calc(50% + ${r.offsetY}px)`,
                } as React.CSSProperties}
              >
                <div className="phrase-text-wrapper">
                  <span className="phrase-text">{r.emoji}</span>
                  <span className="phrase-avatar">{r.avatar}</span>
                </div>
                <div className="surrounding-emojis">
                  {extraEmojis.map((em, idx) => (
                    <span key={idx} className={`surrounding-emoji emoji-${idx}`}>
                      {em}
                    </span>
                  ))}
                </div>
              </div>
            );
          }

          return (
            <div
              key={r.id}
              className="floating-reaction"
              style={{
                left: `calc(50% + ${r.offsetX}px)`,
                top: `calc(50% + ${r.offsetY}px)`,
              } as React.CSSProperties}
            >
              <span className="floating-reaction-emoji">{r.emoji}</span>
              <span className="floating-reaction-avatar">{r.avatar}</span>
            </div>
          );
        })}
      </div>

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
        />
      )}

      {/* Floating Reaction Trigger Button */}
      <button 
        ref={btnRef}
        className={`reaction-trigger-btn ${reactionTrayOpen ? 'reaction-trigger-btn--active' : ''}`}
        onClick={() => setReactionTrayOpen(v => !v)}
        title="Отправить реакцию"
      >
        💬
      </button>

      {/* Floating Reaction Tray */}
      {reactionTrayOpen && (
        <div className="reaction-tray" ref={trayRef}>
          <div className="reaction-tabs">
            <button 
              className={`reaction-tab-btn ${reactionTab === 'emoji' ? 'reaction-tab-btn--active' : ''}`}
              onClick={() => setReactionTab('emoji')}
            >
              😀
            </button>
            <button 
              className={`reaction-tab-btn ${reactionTab === 'phrases' ? 'reaction-tab-btn--active' : ''}`}
              onClick={() => setReactionTab('phrases')}
            >
              💬
            </button>
          </div>
          <div className="reaction-options-grid">
            {reactionTab === 'emoji' ? (
              ['👍', '🔥', '🎉', '💩', '😎', '😢', '😘', '🖤', '💅', '🥂', '😈', '🫦', '🖕', '💥'].map((em) => (
                <button
                  key={em}
                  className="reaction-option"
                  onClick={() => handleSendReaction(em)}
                >
                  {em}
                </button>
              ))
            ) : (
              ['Сосать', 'иди нахуй', 'Королева'].map((ph) => (
                <button
                  key={ph}
                  className="reaction-option phrase-option"
                  onClick={() => handleSendReaction(ph)}
                >
                  {ph}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
