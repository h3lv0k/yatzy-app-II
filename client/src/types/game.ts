export type ScoreCategory =
  | 'ones' | 'twos' | 'threes' | 'fours' | 'fives' | 'sixes'
  | 'threeOfAKind' | 'fourOfAKind' | 'fullHouse'
  | 'smallStraight' | 'largeStraight' | 'yatzy' | 'chance';

export const UPPER_CATEGORIES: ScoreCategory[] = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
];

export const LOWER_CATEGORIES: ScoreCategory[] = [
  'threeOfAKind', 'fourOfAKind', 'fullHouse',
  'smallStraight', 'largeStraight', 'yatzy', 'chance',
];

export const CATEGORY_LABELS: Record<ScoreCategory, string> = {
  ones:         'Единицы',
  twos:         'Двойки',
  threes:       'Тройки',
  fours:        'Четвёрки',
  fives:        'Пятёрки',
  sixes:        'Шестёрки',
  threeOfAKind: 'Три одинаковых',
  fourOfAKind:  'Четыре одинаковых',
  fullHouse:    'Фулл-хаус (25)',
  smallStraight:'Малая улица (30)',
  largeStraight:'Большая улица (40)',
  yatzy:        'Yatzy (50)',
  chance:       'Шанс',
};

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
  lscStreak: number;
  lscMultiplier: number;
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
