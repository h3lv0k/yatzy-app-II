import { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, Player, ScoreCategory, ScoreSheet, UPPER_CATEGORIES, LOWER_CATEGORIES } from '../types/game';
import { calculateScore, computeUpperTotal, isYatzyRoll } from '../utils/yatzy';
import { chooseDiceToKeep, chooseBestCategory } from '../bot/botStrategy';

// ────────────────────────────────────────────────
//  Constants
// ────────────────────────────────────────────────

export const LOCAL_PLAYER_ID = 'local-player';
export const BOT_PLAYER_ID   = 'bot';

const ALL_CATEGORIES: ScoreCategory[] = [...UPPER_CATEGORIES, ...LOWER_CATEGORIES];
const MAX_TURNS = ALL_CATEGORIES.length; // 13

// ────────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────────

function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

function rollDiceArr(dice: number[], held: boolean[]): number[] {
  return dice.map((d, i) => (held[i] ? d : rollDie()));
}

function getStraightComboScore(scores: ScoreSheet): number {
  const hasSmall = scores.smallStraight !== undefined && scores.smallStraight > 0;
  const hasLarge = scores.largeStraight !== undefined && scores.largeStraight > 0;
  return hasSmall && hasLarge ? 20 : 0;
}

function getKindComboScore(scores: ScoreSheet): number {
  const hasThree = scores.threeOfAKind !== undefined && scores.threeOfAKind > 0;
  const hasFour = scores.fourOfAKind !== undefined && scores.fourOfAKind > 0;
  const hasFull = scores.fullHouse !== undefined && scores.fullHouse > 0;
  return hasThree && hasFour && hasFull ? 25 : 0;
}

function getLowRiderComboScore(scores: ScoreSheet): number {
  const hasOnes = scores.ones !== undefined;
  const hasTwos = scores.twos !== undefined;
  const hasThrees = scores.threes !== undefined;
  if (hasOnes && hasTwos && hasThrees) {
    const sum = (scores.ones ?? 0) + (scores.twos ?? 0) + (scores.threes ?? 0);
    return sum >= 10 ? 12 : 0;
  }
  return 0;
}

function computeTotal(scores: ScoreSheet): number {
  const upper = computeUpperTotal(scores);
  const bonus = upper >= 63 ? 35 : 0;
  const lower = (scores.threeOfAKind ?? 0) + (scores.fourOfAKind ?? 0) +
                (scores.fullHouse ?? 0) + (scores.smallStraight ?? 0) +
                (scores.largeStraight ?? 0) + (scores.yatzy ?? 0) + (scores.chance ?? 0);
  const combos = getStraightComboScore(scores) + getKindComboScore(scores) + getLowRiderComboScore(scores);
  return upper + bonus + lower + combos;
}

function makePlayer(id: string, name: string, avatar: string): Player {
  return {
    id, name, avatar, scores: {}, totalScore: 0, upperBonus: false,
  };
}

function isTurnComplete(player: Player): boolean {
  return ALL_CATEGORIES.every((cat) => player.scores[cat] !== undefined);
}

function initialState(playerName: string, playerAvatar: string): GameState {
  return {
    roomId: 'local',
    players: [
      makePlayer(LOCAL_PLAYER_ID, playerName, playerAvatar),
      makePlayer(BOT_PLAYER_ID, '🤖 Бот', '🤖'),
    ],
    currentPlayerIndex: 0,
    dice: [1, 1, 1, 1, 1],
    heldDice: [false, false, false, false, false],
    rollsLeft: 3,
    phase: 'rolling',
    turn: 0,
    maxTurns: MAX_TURNS,
  };
}

// ────────────────────────────────────────────────
//  Types
// ────────────────────────────────────────────────

export interface LocalGameOver {
  winner: string;
  players: Player[];
  surrendered?: string;
}

export interface LocalGameState {
  gameState: GameState | null;
  gameOver: LocalGameOver | null;
  /** Can the player use the bonus roll this turn? */
  adBonusAvailable: boolean;
}

// ────────────────────────────────────────────────
//  Hook
// ────────────────────────────────────────────────

export function useLocalGame(playerName: string, playerAvatar: string) {
  const [gs, setGs] = useState<GameState | null>(null);
  const [history, setHistory] = useState<GameState[]>([]);
  const [gameOver, setGameOver] = useState<LocalGameOver | null>(null);
  const [bonusRollUsed, setBonusRollUsed] = useState(false);
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushHistory = useCallback((state: GameState) => {
    setHistory((prev) => [...prev, structuredClone(state)]);
  }, []);

  // ── Derived ──────────────────────────────────
  const currentPlayer = gs?.players[gs.currentPlayerIndex];
  const isBotTurn = currentPlayer?.id === BOT_PLAYER_ID;
  const adBonusAvailable =
    !isBotTurn &&
    !bonusRollUsed &&
    !!gs &&
    gs.phase === 'scoring' &&
    gs.rollsLeft === 0;

  // ── Bot automation ───────────────────────────
  useEffect(() => {
    if (!gs || !isBotTurn || gs.phase === 'finished') return;

    if (botTimerRef.current) clearTimeout(botTimerRef.current);

    botTimerRef.current = setTimeout(() => {
      setGs((prev) => {
        if (!prev) return prev;
        const state = structuredClone(prev);
        const bot = state.players[state.currentPlayerIndex];
        if (bot.id !== BOT_PLAYER_ID) return prev;

        if (state.phase === 'rolling' && state.rollsLeft > 0) {
          // Bot decides which dice to keep
          const keepFlags = chooseDiceToKeep(state.dice);
          state.heldDice = keepFlags;
          state.dice = rollDiceArr(state.dice, state.heldDice);
          state.rollsLeft -= 1;
          if (state.rollsLeft === 0) state.phase = 'scoring';
          return state;
        }

        if (state.phase === 'scoring') {
          // Bot picks the best category
          const category = chooseBestCategory(state.dice, bot.scores);
          return applyScore(state, bot.id, category, setGameOver);
        }

        return prev;
      });
    }, 900 + Math.random() * 400);

    return () => { if (botTimerRef.current) clearTimeout(botTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs?.currentPlayerIndex, gs?.rollsLeft, gs?.phase, isBotTurn]);

  // ── Actions ──────────────────────────────────

  const start = useCallback(() => {
    const state = initialState(playerName, playerAvatar);
    setGs(state);
    setHistory([]);
    setGameOver(null);
    setBonusRollUsed(false);
  }, [playerName, playerAvatar]);

  const rollDice = useCallback(() => {
    setGs((prev) => {
      if (!prev) return prev;
      if (prev.phase !== 'rolling') return prev;
      if (prev.rollsLeft <= 0) return prev;
      pushHistory(prev);
      const state = structuredClone(prev);
      state.dice = rollDiceArr(state.dice, state.heldDice);
      state.rollsLeft -= 1;
      if (state.rollsLeft === 0) state.phase = 'scoring';
      return state;
    });
  }, [pushHistory]);

  const toggleHold = useCallback((index: number) => {
    setGs((prev) => {
      if (!prev) return prev;
      if (prev.rollsLeft === 3 || prev.rollsLeft === 0) return prev;
      const state = structuredClone(prev);
      state.heldDice[index] = !state.heldDice[index];
      return state;
    });
  }, []);

  const scoreCategory = useCallback((category: ScoreCategory) => {
    setGs((prev) => {
      if (!prev) return prev;
      const player = prev.players[prev.currentPlayerIndex];
      if (player.id !== LOCAL_PLAYER_ID) return prev;
      if (prev.rollsLeft === 3) return prev;
      if (player.scores[category] !== undefined) return prev;
      pushHistory(prev);
      const state = structuredClone(prev);
      return applyScore(state, LOCAL_PLAYER_ID, category, setGameOver);
    });
  }, [pushHistory]);

  const surrender = useCallback(() => {
    setGs((prev) => {
      if (!prev || prev.phase === 'finished') return prev;
      const state = structuredClone(prev);
      state.phase = 'finished';
      const bot = state.players.find((p) => p.id === BOT_PLAYER_ID)!;
      state.winner = bot.id;
      setGameOver({ winner: bot.id, players: state.players, surrendered: LOCAL_PLAYER_ID });
      return state;
    });
  }, []);

  const rematch = useCallback(() => {
    const state = initialState(playerName, playerAvatar);
    setGs(state);
    setHistory([]);
    setGameOver(null);
    setBonusRollUsed(false);
  }, [playerName, playerAvatar]);

  const leaveGame = useCallback(() => {
    setGs(null);
    setHistory([]);
    setGameOver(null);
  }, []);

  /** Grant 1 free bonus roll (once per game) */
  const watchAdForBonusRoll = useCallback(() => {
    if (!adBonusAvailable) return;
    setBonusRollUsed(true);
    setGs((prev) => {
      if (!prev) return prev;
      pushHistory(prev);
      const state = structuredClone(prev);
      state.rollsLeft = 1;
      state.phase = 'rolling';
      state.heldDice = [true, true, true, true, true];
      return state;
    });
  }, [adBonusAvailable, pushHistory]);

  // ── Debug Tools ──────────────────────────────
  const debugUndo = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const newHistory = [...prev];
      const lastState = newHistory.pop()!;
      setGs(lastState);
      setGameOver(null);
      return newHistory;
    });
  }, []);

  const debugSetDice = useCallback((newDice: number[]) => {
    setGs((prev) => {
      if (!prev) return prev;
      pushHistory(prev);
      const state = structuredClone(prev);
      state.dice = [...newDice];
      return state;
    });
  }, [pushHistory]);

  const debugForceFinish = useCallback((win: boolean) => {
    setGs((prev) => {
      if (!prev) return prev;
      pushHistory(prev);
      const state = structuredClone(prev);
      state.phase = 'finished';
      const winnerId = win ? LOCAL_PLAYER_ID : BOT_PLAYER_ID;
      state.winner = winnerId;
      setGameOver({ winner: winnerId, players: state.players });
      return state;
    });
  }, [pushHistory]);

  const debugSetUpperScore = useCallback((score: number) => {
    setGs((prev) => {
      if (!prev) return prev;
      pushHistory(prev);
      const state = structuredClone(prev);
      const player = state.players[state.currentPlayerIndex];
      // Distribute score across upper categories
      player.scores.ones = score;
      player.scores.twos = 0;
      player.scores.threes = 0;
      player.scores.fours = 0;
      player.scores.fives = 0;
      player.scores.sixes = 0;
      player.totalScore = computeTotal(player.scores);
      player.upperBonus = computeUpperTotal(player.scores) >= 63;
      return state;
    });
  }, [pushHistory]);

  const debugFillScores = useCallback(() => {
    setGs((prev) => {
      if (!prev) return prev;
      pushHistory(prev);
      const state = structuredClone(prev);
      state.players.forEach(player => {
        ALL_CATEGORIES.forEach(cat => {
          if (player.scores[cat] === undefined) {
            player.scores[cat] = Math.floor(Math.random() * 20);
          }
        });
        player.totalScore = computeTotal(player.scores);
        player.upperBonus = computeUpperTotal(player.scores) >= 63;
      });
      return state;
    });
  }, [pushHistory]);

  return {
    localState: { 
      gameState: gs, 
      gameOver, 
      adBonusAvailable, 
      historyCount: history.length,
    },
    start,
    rollDice,
    toggleHold,
    scoreCategory,
    surrender,
    rematch,
    leaveGame,
    watchAdForBonusRoll,
    debugUndo,
    debugSetDice,
    debugForceFinish,
    debugSetUpperScore,
    debugFillScores,
  };
}

// ────────────────────────────────────────────────
//  Pure helper (used in both player and bot paths)
// ────────────────────────────────────────────────

function applyScore(
  state: GameState,
  _playerId: string,
  category: ScoreCategory,
  setGameOver: (go: LocalGameOver) => void,
): GameState {
  const player = state.players[state.currentPlayerIndex];
  const score = calculateScore(category, state.dice);
  player.scores[category] = score;

  player.totalScore = computeTotal(player.scores);
  player.upperBonus = computeUpperTotal(player.scores) >= 63;

  const allDone = state.players.every((p) => isTurnComplete(p));
  if (allDone) {
    state.phase = 'finished';
    const [p0, p1] = state.players;
    state.winner = p0.totalScore >= p1.totalScore ? p0.id : p1.id;
    setGameOver({ winner: state.winner, players: state.players });
    return state;
  }

  const nextIndex = (state.currentPlayerIndex + 1) % state.players.length;
  state.currentPlayerIndex = nextIndex;
  state.rollsLeft = 3;
  state.heldDice = [false, false, false, false, false];
  state.phase = 'rolling';
  state.turn += 1;

  return state;
}
