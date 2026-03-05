import { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, Player, ScoreCategory, ScoreSheet, UPPER_CATEGORIES, LOWER_CATEGORIES } from '../types/game';
import { calculateScore, computeUpperTotal } from '../utils/yatzy';
import { chooseDiceToKeep, chooseBestCategory } from '../bot/botStrategy';
import { showRewardedAd } from '../services/adService';

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

function computeTotal(scores: ScoreSheet): number {
  const upper = computeUpperTotal(scores);
  const bonus = upper >= 63 ? 35 : 0;
  const lower = (scores.threeOfAKind ?? 0) + (scores.fourOfAKind ?? 0) +
                (scores.fullHouse ?? 0) + (scores.smallStraight ?? 0) +
                (scores.largeStraight ?? 0) + (scores.yatzy ?? 0) + (scores.chance ?? 0);
  return upper + bonus + lower;
}

function makePlayer(id: string, name: string, avatar: string): Player {
  return { id, name, avatar, scores: {}, totalScore: 0, upperBonus: false };
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
  /** Can the player watch an ad this turn to get +1 roll? */
  adBonusAvailable: boolean;
  /** Is the ad currently "playing"? */
  isWatchingAd: boolean;
  /** Countdown seconds remaining while ad plays */
  adCountdown: number;
  /** True when the next bonus roll is free (first per game); false = requires ad */
  isNextBonusFree: boolean;
}

// ────────────────────────────────────────────────
//  Hook
// ────────────────────────────────────────────────

export function useLocalGame(playerName: string, playerAvatar: string) {
  const [gs, setGs] = useState<GameState | null>(null);
  const [gameOver, setGameOver] = useState<LocalGameOver | null>(null);
  const [adBonusUsedThisTurn, setAdBonusUsedThisTurn] = useState(false);
  const [freeBonusUsed, setFreeBonusUsed] = useState(false);
  const [isWatchingAd, setIsWatchingAd] = useState(false);
  const [adCountdown, setAdCountdown] = useState(0);
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // adIntervalRef no longer needed — real ad SDK handles its own lifecycle

  // ── Derived ──────────────────────────────────
  const currentPlayer = gs?.players[gs.currentPlayerIndex];
  const isBotTurn = currentPlayer?.id === BOT_PLAYER_ID;
  const adBonusAvailable =
    !isBotTurn &&
    !adBonusUsedThisTurn &&
    !isWatchingAd &&
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

  // Reset ad bonus when player's turn starts
  useEffect(() => {
    if (gs && !isBotTurn) {
      setAdBonusUsedThisTurn(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs?.turn, gs?.currentPlayerIndex]);

  // ── Actions ──────────────────────────────────

  const start = useCallback(() => {
    setGs(initialState(playerName, playerAvatar));
    setGameOver(null);
    setAdBonusUsedThisTurn(false);
    setFreeBonusUsed(false);
    setIsWatchingAd(false);
    setAdCountdown(0);
  }, [playerName, playerAvatar]);

  const rollDice = useCallback(() => {
    setGs((prev) => {
      if (!prev) return prev;
      if (prev.phase !== 'rolling') return prev;
      if (prev.rollsLeft <= 0) return prev;
      const state = structuredClone(prev);
      state.dice = rollDiceArr(state.dice, state.heldDice);
      state.rollsLeft -= 1;
      if (state.rollsLeft === 0) state.phase = 'scoring';
      return state;
    });
  }, []);

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
      const state = structuredClone(prev);
      return applyScore(state, LOCAL_PLAYER_ID, category, setGameOver);
    });
  }, []);

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
    setGs(initialState(playerName, playerAvatar));
    setGameOver(null);
    setAdBonusUsedThisTurn(false);
    setFreeBonusUsed(false);
    setIsWatchingAd(false);
    setAdCountdown(0);
  }, [playerName, playerAvatar]);

  const leaveGame = useCallback(() => {
    setGs(null);
    setGameOver(null);
  }, []);

  /** Grant 1 bonus roll — free the first time per game, ad-gated afterwards */
  const watchAdForBonusRoll = useCallback(async () => {
    if (!adBonusAvailable || isWatchingAd) return;

    const grantRoll = () => {
      setAdBonusUsedThisTurn(true);
      setFreeBonusUsed(true);
      setGs((prev) => {
        if (!prev) return prev;
        const state = structuredClone(prev);
        state.rollsLeft = 1;
        state.phase = 'rolling';
        state.heldDice = [true, true, true, true, true];
        return state;
      });
    };

    if (!freeBonusUsed) {
      // First bonus roll this game — free, instant
      grantRoll();
      return;
    }

    // Subsequent bonus rolls — show real ad
    setIsWatchingAd(true);
    setAdCountdown(3); // visual hint while ad loads

    // Tick the countdown for UX (actual reward comes from SDK callback)
    const countInterval = setInterval(() => {
      setAdCountdown((c) => (c > 1 ? c - 1 : 0));
    }, 1000);

    try {
      const result = await showRewardedAd();
      clearInterval(countInterval);
      setIsWatchingAd(false);
      setAdCountdown(0);
      if (result.rewarded) {
        grantRoll();
      }
    } catch {
      // Ad failed / was skipped — no reward
      clearInterval(countInterval);
      setIsWatchingAd(false);
      setAdCountdown(0);
    }
  }, [adBonusAvailable, freeBonusUsed, isWatchingAd]);

  return {
    localState: { gameState: gs, gameOver, adBonusAvailable, isWatchingAd, adCountdown, isNextBonusFree: !freeBonusUsed },
    start,
    rollDice,
    toggleHold,
    scoreCategory,
    surrender,
    rematch,
    leaveGame,
    watchAdForBonusRoll,
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
