import { ScoreCategory, ScoreSheet } from '../types';

export function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

export function rollDice(dice: number[], held: boolean[]): number[] {
  return dice.map((d, i) => (held[i] ? d : rollDie()));
}

function countFaces(dice: number[]): Record<number, number> {
  const counts: Record<number, number> = {};
  dice.forEach((d) => { counts[d] = (counts[d] || 0) + 1; });
  return counts;
}

function sumDice(dice: number[]): number {
  return dice.reduce((a, b) => a + b, 0);
}

export function calculateScore(category: ScoreCategory, dice: number[]): number {
  const counts = countFaces(dice);
  const vals = Object.values(counts);
  const total = sumDice(dice);

  switch (category) {
    case 'ones':    return (counts[1] || 0) * 1;
    case 'twos':    return (counts[2] || 0) * 2;
    case 'threes':  return (counts[3] || 0) * 3;
    case 'fours':   return (counts[4] || 0) * 4;
    case 'fives':   return (counts[5] || 0) * 5;
    case 'sixes':   return (counts[6] || 0) * 6;

    case 'threeOfAKind':
      return vals.some((v) => v >= 3) ? total : 0;

    case 'fourOfAKind':
      return vals.some((v) => v >= 4) ? total : 0;

    case 'fullHouse': {
      const hasThree = vals.some((v) => v === 3);
      const hasTwo   = vals.some((v) => v === 2);
      return hasThree && hasTwo ? 25 : 0;
    }

    case 'smallStraight': {
      const unique = [...new Set(dice)].sort((a, b) => a - b);
      const straights = [[1,2,3,4],[2,3,4,5],[3,4,5,6]];
      return straights.some((s) => s.every((v) => unique.includes(v))) ? 30 : 0;
    }

    case 'largeStraight': {
      const sorted = [...new Set(dice)].sort((a, b) => a - b);
      return (JSON.stringify(sorted) === JSON.stringify([1,2,3,4,5]) ||
              JSON.stringify(sorted) === JSON.stringify([2,3,4,5,6])) ? 40 : 0;
    }

    case 'yatzy':
      return vals.length === 1 ? 50 : 0;

    case 'chance':
      return total;

    default:
      return 0;
  }
}

export function getStraightComboScore(scores: ScoreSheet): number {
  const hasSmall = scores.smallStraight !== undefined && scores.smallStraight > 0;
  const hasLarge = scores.largeStraight !== undefined && scores.largeStraight > 0;
  return hasSmall && hasLarge ? 20 : 0;
}

export function getKindComboScore(scores: ScoreSheet): number {
  const hasThree = scores.threeOfAKind !== undefined && scores.threeOfAKind > 0;
  const hasFour = scores.fourOfAKind !== undefined && scores.fourOfAKind > 0;
  const hasFull = scores.fullHouse !== undefined && scores.fullHouse > 0;
  return hasThree && hasFour && hasFull ? 25 : 0;
}

export function getLowRiderComboScore(scores: ScoreSheet): number {
  const hasOnes = scores.ones !== undefined;
  const hasTwos = scores.twos !== undefined;
  const hasThrees = scores.threes !== undefined;
  if (hasOnes && hasTwos && hasThrees) {
    const sum = (scores.ones ?? 0) + (scores.twos ?? 0) + (scores.threes ?? 0);
    return sum >= 13 ? 12 : 0;
  }
  return 0;
}

export function computeUpperTotal(scores: ScoreSheet): number {
  return (scores.ones ?? 0) + (scores.twos ?? 0) + (scores.threes ?? 0) +
         (scores.fours ?? 0) + (scores.fives ?? 0) + (scores.sixes ?? 0);
}

export function computeTotalScore(scores: ScoreSheet): number {
  const upperTotal = computeUpperTotal(scores);
  const bonus = upperTotal >= 63 ? 35 : 0;
  const lower = (scores.threeOfAKind ?? 0) + (scores.fourOfAKind ?? 0) +
                (scores.fullHouse ?? 0) + (scores.smallStraight ?? 0) +
                (scores.largeStraight ?? 0) + (scores.yatzy ?? 0) + (scores.chance ?? 0);
  const combos = getStraightComboScore(scores) + getKindComboScore(scores) + getLowRiderComboScore(scores);
  return upperTotal + bonus + lower + combos;
}
