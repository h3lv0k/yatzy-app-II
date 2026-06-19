import { ScoreCategory, ScoreSheet, UPPER_CATEGORIES, LOWER_CATEGORIES } from '../types/game';
import { calculateScore, computeUpperTotal } from '../utils/yatzy';

// ────────────────────────────────────────────────
//  HELPER
// ────────────────────────────────────────────────

function countFaces(dice: number[]): Record<number, number> {
  const counts: Record<number, number> = {};
  dice.forEach((d) => { counts[d] = (counts[d] || 0) + 1; });
  return counts;
}

// ────────────────────────────────────────────────
//  DICE-KEEP DECISION
// ────────────────────────────────────────────────

/**
 * Returns a boolean[] where true = keep that die.
 * Strategy (in priority order):
 *  1. 5-of-a-kind → keep all
 *  2. 4-of-a-kind
 *  3. Full house (3+2) → keep all
 *  4. 4 dice forming a straight → keep them
 *  5. 3-of-a-kind → keep those
 *  6. 3+ dice forming a straight → keep them
 *  7. 2-of-a-kind (highest pair)
 *  8. Keep highest die
 */
export function chooseDiceToKeep(dice: number[]): boolean[] {
  const counts = countFaces(dice);
  const entries = Object.entries(counts).map(([v, c]) => ({ v: Number(v), c }));
  const maxCount = Math.max(...entries.map((e) => e.c));

  // 5-of-a-kind
  if (maxCount === 5) return dice.map(() => true);

  // 4-of-a-kind
  if (maxCount === 4) {
    const val = entries.find((e) => e.c === 4)!.v;
    return dice.map((d) => d === val);
  }

  // Full house (3+2) — keep all
  const hasThree = entries.some((e) => e.c === 3);
  const hasTwo   = entries.some((e) => e.c === 2);
  if (hasThree && hasTwo) return dice.map(() => true);

  // 3-of-a-kind — keep those
  if (hasThree) {
    const val = entries.find((e) => e.c === 3)!.v;
    return dice.map((d) => d === val);
  }

  // Check for straights
  const unique = [...new Set(dice)].sort((a, b) => a - b);

  // Large straight sequences
  const largeSeqs = [[1,2,3,4,5],[2,3,4,5,6]];
  for (const seq of largeSeqs) {
    const coverage = seq.filter((v) => unique.includes(v));
    if (coverage.length >= 4) {
      // Keep dice that are part of the sequence, no duplicates
      const kept = new Set(coverage);
      const result: boolean[] = dice.map(() => false);
      const used = new Set<number>();
      dice.forEach((d, i) => {
        if (kept.has(d) && !used.has(d)) { result[i] = true; used.add(d); }
      });
      return result;
    }
  }

  // Small straight sequences
  const smallSeqs = [[1,2,3,4],[2,3,4,5],[3,4,5,6]];
  for (const seq of smallSeqs) {
    const coverage = seq.filter((v) => unique.includes(v));
    if (coverage.length >= 3) {
      const kept = new Set(coverage);
      const result: boolean[] = dice.map(() => false);
      const used = new Set<number>();
      dice.forEach((d, i) => {
        if (kept.has(d) && !used.has(d)) { result[i] = true; used.add(d); }
      });
      return result;
    }
  }

  // Pair — keep the highest pair
  const pairs = entries.filter((e) => e.c >= 2).sort((a, b) => b.v - a.v);
  if (pairs.length > 0) {
    const val = pairs[0].v;
    return dice.map((d) => d === val);
  }

  // Fallback: keep the highest die
  const max = Math.max(...dice);
  let found = false;
  return dice.map((d) => {
    if (d === max && !found) { found = true; return true; }
    return false;
  });
}

// ────────────────────────────────────────────────
//  CATEGORY CHOICE
// ────────────────────────────────────────────────

/**
 * Picks the best available category for the current dice.
 * Priority:
 *  - Score desc
 *  - Upper section if upper total < 63 (to chase the bonus)
 *  - Sacrifice the worst category last (like ones/chance)
 */
export function chooseBestCategory(
  dice: number[],
  scores: ScoreSheet,
): ScoreCategory {
  const allCategories: ScoreCategory[] = [...UPPER_CATEGORIES, ...LOWER_CATEGORIES];
  const available = allCategories.filter((cat) => scores[cat] === undefined);

  const upperTotal = computeUpperTotal(scores);
  const upperDeficit = Math.max(0, 63 - upperTotal);

  let best: ScoreCategory = available[0];
  let bestValue = -Infinity;

  for (const cat of available) {
    const raw = calculateScore(cat, dice);
    let value = raw;

    // Bonus for upper categories if we still need points for the 35-pt bonus
    if (upperDeficit > 0 && UPPER_CATEGORIES.includes(cat)) {
      value += 5;
    }

    // Slight penalty for cheap sacrificial categories (ones, twos) to use them last
    if (cat === 'ones' || cat === 'twos') value -= 1;

    if (value > bestValue) {
      bestValue = value;
      best = cat;
    }
  }

  return best;
}
