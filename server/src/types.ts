export type ScoreCategory =
  | 'ones' | 'twos' | 'threes' | 'fours' | 'fives' | 'sixes'
  | 'threeOfAKind' | 'fourOfAKind' | 'fullHouse'
  | 'smallStraight' | 'largeStraight' | 'yatzy' | 'chance';

export const SCORE_CATEGORIES: ScoreCategory[] = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  'threeOfAKind', 'fourOfAKind', 'fullHouse',
  'smallStraight', 'largeStraight', 'yatzy', 'chance',
];

export const UPPER_CATEGORIES: ScoreCategory[] = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
];

export const LOWER_CATEGORIES: ScoreCategory[] = [
  'threeOfAKind', 'fourOfAKind', 'fullHouse',
  'smallStraight', 'largeStraight', 'yatzy', 'chance',
];

export interface ScoreSheet {
  ones?: number;
  twos?: number;
  threes?: number;
  fours?: number;
  fives?: number;
  sixes?: number;
  threeOfAKind?: number;
  fourOfAKind?: number;
  fullHouse?: number;
  smallStraight?: number;
  largeStraight?: number;
  yatzy?: number;
  chance?: number;
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  scores: ScoreSheet;
  totalScore: number;
  upperBonus: boolean;
  sessionId?: string;
  connected?: boolean;
}

export interface GameState {
  roomId: string;
  players: Player[];
  currentPlayerIndex: number;
  dice: number[];
  heldDice: boolean[];
  rollsLeft: number;
  phase: 'waiting' | 'rolling' | 'scoring' | 'finished';
  turn: number;
  maxTurns: number;
  winner?: string;
}

export interface Room {
  id: string;
  code: string;
  gameState: GameState;
  temporarilyDisconnected: Map<string, { playerId: string; timestamp: number }>;
  disconnectTimers: Map<string, NodeJS.Timeout>;
}

