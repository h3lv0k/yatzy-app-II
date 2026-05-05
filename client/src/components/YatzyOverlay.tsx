import React, { useEffect, useState } from 'react';
import './YatzyOverlay.css';

interface Props {
  show: boolean;
}

export const YatzyOverlay: React.FC<Props> = ({ show }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [show]);

  if (!visible) return null;

  return (
    <div className="yatzy-overlay">
      <div className="yatzy-text">YATZY!</div>
      <div className="confetti-container">
        {[...Array(50)].map((_, i) => (
          <div key={i} className={`confetti confetti-${i % 5}`} style={{
            left: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 2}s`,
            backgroundColor: ['#ffd700', '#ff4500', '#ffffff', '#00ff00', '#1e90ff'][i % 5]
          }} />
        ))}
      </div>
    </div>
  );
};
