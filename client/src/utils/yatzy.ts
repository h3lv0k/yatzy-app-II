import { ScoreCategory, ScoreSheet } from '../types/game';

function countFaces(dice: number[]): Record<number, number> {
  const counts: Record<number, number> = {};
  dice.forEach((d) => { counts[d] = (counts[d] || 0) + 1; });
  return counts;
}

function sumDice(dice: number[]): number {
  return dice.reduce((a, b) => a + b, 0);
}

export function isYatzyRoll(dice: number[]): boolean {
  if (dice.length === 0) return false;
  return dice.every(d => d === dice[0]);
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
    case 'threeOfAKind': return vals.some((v) => v >= 3) ? total : 0;
    case 'fourOfAKind':  return vals.some((v) => v >= 4) ? total : 0;
    case 'fullHouse': {
      return (vals.some((v) => v === 3) && vals.some((v) => v === 2)) ? 25 : 0;
    }
    case 'smallStraight': {
      const unique = [...new Set(dice)].sort((a, b) => a - b);
      return [[1,2,3,4],[2,3,4,5],[3,4,5,6]].some((s) =>
        s.every((v) => unique.includes(v))) ? 30 : 0;
    }
    case 'largeStraight': {
      const sorted = [...new Set(dice)].sort((a, b) => a - b);
      return (JSON.stringify(sorted) === JSON.stringify([1,2,3,4,5]) ||
              JSON.stringify(sorted) === JSON.stringify([2,3,4,5,6])) ? 40 : 0;
    }
    case 'yatzy':  return vals.length === 1 ? 50 : 0;
    case 'chance': return total;
    default:       return 0;
  }
}

export function computeUpperTotal(scores: ScoreSheet): number {
  return (scores.ones ?? 0) + (scores.twos ?? 0) + (scores.threes ?? 0) +
         (scores.fours ?? 0) + (scores.fives ?? 0) + (scores.sixes ?? 0);
}
