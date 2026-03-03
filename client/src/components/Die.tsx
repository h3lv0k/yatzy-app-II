import React from 'react';
import './Die.css';
import d1 from '../assets/icons/d1.png';
import d2 from '../assets/icons/d2.png';
import d3 from '../assets/icons/d3.png';
import d4 from '../assets/icons/d4.png';
import d5 from '../assets/icons/d5.png';
import d6 from '../assets/icons/d6.png';

interface Props {
  value: number;
  held: boolean;
  canHold: boolean;
  onToggle: () => void;
  rolling?: boolean;
}

const DICE_IMAGES: Record<number, string> = { 1: d1, 2: d2, 3: d3, 4: d4, 5: d5, 6: d6 };

export const Die: React.FC<Props> = ({ value, held, canHold, onToggle, rolling }) => {
  return (
    <button
      className={`die ${held ? 'die--held' : ''} ${!canHold ? 'die--disabled' : ''} ${rolling ? 'die--rolling' : ''}`}
      onClick={canHold ? onToggle : undefined}
      aria-label={`Кубик ${value}${held ? ' (зафиксирован)' : ''}`}
    >
      <img
        src={DICE_IMAGES[value]}
        alt={`${value}`}
        className="die-img"
        draggable={false}
      />
      {held && <span className="die-label">🔒</span>}
    </button>
  );
};
