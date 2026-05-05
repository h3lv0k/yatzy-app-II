import React, { useState } from 'react';
import './DebugPanel.css';

interface Props {
  dice: number[];
  historyCount: number;
  onSetDice: (dice: number[]) => void;
  onUndo: () => void;
  onForceFinish: (win: boolean) => void;
  onSetUpperScore?: (score: number) => void;
  onFillScores?: () => void;
  lscMultiplier?: number;
  lscStreak?: number;
}

export const DebugPanel: React.FC<Props> = ({ 
  dice, historyCount, onSetDice, onUndo, onForceFinish,
  onSetUpperScore, onFillScores, lscMultiplier, lscStreak
}) => {
  const [customDice, setCustomDice] = useState<number[]>([...dice]);
  const [isOpen, setIsOpen] = useState(false);

  const handleDieChange = (index: number, value: string) => {
    const val = parseInt(value, 10);
    if (isNaN(val)) return;
    const newDice = [...customDice];
    newDice[index] = val;
    setCustomDice(newDice);
  };

  const applyDice = () => {
    onSetDice(customDice);
  };

  if (!isOpen) {
    return (
      <button className="debug-toggle" onClick={() => setIsOpen(true)}>
        🛠️ Debug
      </button>
    );
  }

  return (
    <div className="debug-panel">
      <div className="debug-header">
        <span>🛠️ Developer Tools</span>
        <button className="debug-close" onClick={() => setIsOpen(false)}>×</button>
      </div>
      
      {lscMultiplier !== undefined && (
        <div className="debug-info">
          LSC: x{lscMultiplier.toFixed(1)} (Streak: {lscStreak})
        </div>
      )}

      <div className="debug-section">
        <label>Set Dice Combinations:</label>
        <div className="debug-dice-inputs">
          {customDice.map((d, i) => (
            <select 
              key={i} 
              value={d} 
              onChange={(e) => handleDieChange(i, e.target.value)}
            >
              {[1, 2, 3, 4, 5, 6].map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          ))}
        </div>
        <button className="debug-btn debug-btn--primary" onClick={applyDice}>
          Apply Dice
        </button>
      </div>

      <div className="debug-section">
        <label>Quick Scoring:</label>
        <button 
          className="debug-btn" 
          onClick={() => onSetUpperScore?.(63)}
        >
          ✨ Set Upper Score 63 (Bonus)
        </button>
        <button 
          className="debug-btn" 
          onClick={() => onFillScores?.()}
        >
          🎲 Fill All with Random
        </button>
      </div>

      <div className="debug-section">
        <button 
          className="debug-btn" 
          onClick={onUndo} 
          disabled={historyCount === 0}
        >
          ↩️ Undo Turn ({historyCount})
        </button>
      </div>

      <div className="debug-section debug-actions--row">
        <button className="debug-btn debug-btn--win" onClick={() => onForceFinish(true)}>
          🏆 Force Win
        </button>
        <button className="debug-btn debug-btn--lose" onClick={() => onForceFinish(false)}>
          💀 Force Lose
        </button>
      </div>
      
      <div className="debug-footer">
        Active in local bot mode only
      </div>
    </div>
  );
};
