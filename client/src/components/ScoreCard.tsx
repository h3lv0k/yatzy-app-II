import React from 'react';
import {
  Player, ScoreCategory,
  UPPER_CATEGORIES, LOWER_CATEGORIES,
} from '../types/game';
import { calculateScore, computeUpperTotal } from '../utils/yatzy';
import { categoryIcons } from '../assets/icons/categoryIcons';
import './ScoreCard.css';

const CatIcon: React.FC<{ cat: ScoreCategory }> = ({ cat }) => {
  const src = categoryIcons[cat];
  if (!src) return null;
  return <img src={src} className="cat-icon" alt={cat} />;
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
