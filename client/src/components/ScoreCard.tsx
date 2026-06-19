import React from 'react';
import {
  Player, ScoreCategory,
  UPPER_CATEGORIES, LOWER_CATEGORIES,
} from '../types/game';
import { calculateScore, computeUpperTotal, isYatzyRoll } from '../utils/yatzy';
import { categoryIcons } from '../assets/icons/categoryIcons';
import './ScoreCard.css';

const CatIcon: React.FC<{ cat: ScoreCategory }> = ({ cat }) => {
  const src = categoryIcons[cat];
  if (!src) return null;
  return <img src={src} className="cat-icon" alt={cat} />;
};

const getStraightComboProgress = (player: Player): { label: string; score: number } => {
  const hasSmall = player.scores.smallStraight !== undefined && player.scores.smallStraight > 0;
  const hasLarge = player.scores.largeStraight !== undefined && player.scores.largeStraight > 0;
  if (hasSmall && hasLarge) return { label: '20', score: 20 };
  let count = 0;
  if (hasSmall) count++;
  if (hasLarge) count++;
  return { label: count > 0 ? `${count}/2` : '—', score: 0 };
};

const getKindComboProgress = (player: Player): { label: string; score: number } => {
  const hasThree = player.scores.threeOfAKind !== undefined && player.scores.threeOfAKind > 0;
  const hasFour = player.scores.fourOfAKind !== undefined && player.scores.fourOfAKind > 0;
  const hasFull = player.scores.fullHouse !== undefined && player.scores.fullHouse > 0;
  if (hasThree && hasFour && hasFull) return { label: '25', score: 25 };
  let count = 0;
  if (hasThree) count++;
  if (hasFour) count++;
  if (hasFull) count++;
  return { label: count > 0 ? `${count}/3` : '—', score: 0 };
};

const getLowRiderProgress = (player: Player): { label: string; score: number } => {
  const hasOnes = player.scores.ones !== undefined;
  const hasTwos = player.scores.twos !== undefined;
  const hasThrees = player.scores.threes !== undefined;
  
  let count = 0;
  if (hasOnes) count++;
  if (hasTwos) count++;
  if (hasThrees) count++;
  
  if (hasOnes && hasTwos && hasThrees) {
    const sum = (player.scores.ones ?? 0) + (player.scores.twos ?? 0) + (player.scores.threes ?? 0);
    return sum >= 13 ? { label: '12', score: 12 } : { label: '✕', score: 0 };
  }
  return { label: count > 0 ? `${count}/3` : '—', score: 0 };
};

interface Props {
  players: Player[];
  myId: string;
  currentPlayerId: string;
  dice: number[];
  rollsLeft: number;
  phase: string;
  onScore: (cat: ScoreCategory) => void;
}

export const ScoreCard: React.FC<Props> = ({
  players, myId, currentPlayerId, dice, rollsLeft, phase, onScore,
}) => {
  const isMyTurn = myId === currentPlayerId;
  const canScore  = isMyTurn && rollsLeft < 3 && phase !== 'finished';

  const renderCell = (player: Player, cat: ScoreCategory) => {
    const scored = player.scores[cat];
    const isMe = player.id === myId;
    const isCurrent = player.id === currentPlayerId;

    if (scored !== undefined) {
      return (
        <td key={cat} className={`cell cell--scored ${scored === 0 ? 'cell--zero' : ''}`}>
          {scored}
        </td>
      );
    }

    if (isMe && canScore) {
      const preview = calculateScore(cat, dice);

      return (
        <td
          key={cat}
          className={`cell cell--preview ${preview === 0 ? 'cell--preview-zero' : ''}`}
          onClick={() => onScore(cat)}
          title={String(preview)}
        >
          <span className="preview-score">{preview > 0 ? preview : '✕'}</span>
        </td>
      );
    }

    return <td key={cat} className={`cell cell--empty ${isCurrent ? 'cell--current-turn' : ''}`}>—</td>;
  };

  return (
    <div className="scorecard">
      <table>
        <thead>
          <tr>
            <th className="cat-header">🎮</th>
            {players.map((p) => (
              <th
                key={p.id}
                className={`player-header ${p.id === currentPlayerId ? 'player-header--active' : ''} ${p.id === myId ? 'player-header--me' : ''}`}
              >
                <span className="player-avatar">{p.avatar}</span>
                <span className="player-name">{p.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="section-header">
            <td colSpan={players.length + 1}>⬆️</td>
          </tr>
          {UPPER_CATEGORIES.map((cat) => (
            <tr key={cat}>
              <td className="cat-label">
                <CatIcon cat={cat} />
              </td>
              {players.map((p) => renderCell(p, cat))}
            </tr>
          ))}
          <tr className="bonus-row">
            <td className="cat-label"><span className="cat-emoji">Σ</span></td>
            {players.map((p) => (
              <td key={p.id} className="cell">
                {computeUpperTotal(p.scores)}
              </td>
            ))}
          </tr>
          <tr className="bonus-row">
            <td className="cat-label"><span className="cat-emoji">⭐+35</span></td>
            {players.map((p) => (
              <td key={p.id} className={`cell ${p.upperBonus ? 'cell--bonus' : ''}`}>
                {p.upperBonus ? '✔' : `ещё ${Math.max(0, 63 - computeUpperTotal(p.scores))}`}
              </td>
            ))}
          </tr>

          <tr className="section-header">
            <td colSpan={players.length + 1}>⬇️</td>
          </tr>
          {LOWER_CATEGORIES.map((cat) => (
            <tr key={cat}>
              <td className="cat-label">
                <CatIcon cat={cat} />
              </td>
              {players.map((p) => renderCell(p, cat))}
            </tr>
          ))}

          <tr className="section-header">
            <td colSpan={players.length + 1}>🔥 Комбо-бонусы</td>
          </tr>
          <tr>
            <td className="cat-label cat-label--combo" title="Малая улица + Большая улица (>0 очков)">
              🏃‍♂️ Уличный забег (+20)
            </td>
            {players.map((p) => {
              const { label, score } = getStraightComboProgress(p);
              return (
                <td key={p.id} className={`cell ${score > 0 ? 'cell--bonus' : label === '—' ? 'cell--empty' : ''}`}>
                  {label}
                </td>
              );
            })}
          </tr>
          <tr>
            <td className="cat-label cat-label--combo" title="3 одинаковых + 4 одинаковых + Фулл-хаус (>0 очков)">
              👑 Сила равных (+25)
            </td>
            {players.map((p) => {
              const { label, score } = getKindComboProgress(p);
              return (
                <td key={p.id} className={`cell ${score > 0 ? 'cell--bonus' : label === '—' ? 'cell--empty' : ''}`}>
                  {label}
                </td>
              );
            })}
          </tr>
          <tr>
            <td className="cat-label cat-label--combo" title="Сумма Единиц, Двоек и Троек должна быть >= 13">
              🧸 Детский сад (+12)
            </td>
            {players.map((p) => {
              const { label, score } = getLowRiderProgress(p);
              return (
                <td key={p.id} className={`cell ${score > 0 ? 'cell--bonus' : label === '✕' ? 'cell--zero' : label === '—' ? 'cell--empty' : ''}`}>
                  {label}
                </td>
              );
            })}
          </tr>

          <tr className="total-row">
            <td className="cat-label"><span className="cat-emoji">🏆</span></td>
            {players.map((p) => (
              <td key={p.id} className="cell cell--total">{p.totalScore}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
};
