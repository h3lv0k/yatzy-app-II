import React, { useEffect, useState } from 'react';
import './YatzyOverlay.css';

interface Props {
  show: boolean;
}

export const YatzyOverlay: React.FC<Props> = ({ show }) => {
  const [visible, setVisible] = useState(false);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    let fadeTimer: ReturnType<typeof setTimeout>;
    let hideTimer: ReturnType<typeof setTimeout>;

    if (show) {
      setVisible(true);
      setIsFading(false);

      // Start fading out at 2.6 seconds
      fadeTimer = setTimeout(() => setIsFading(true), 2600);
      // Completely remove from DOM at 3 seconds
      hideTimer = setTimeout(() => setVisible(false), 3000);
    } else {
      // Trigger fade out immediately, hide after transition
      setIsFading(true);
      hideTimer = setTimeout(() => setVisible(false), 400);
    }

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, [show]);

  if (!visible) return null;

  return (
    <div className={`yatzy-overlay ${isFading ? 'yatzy-overlay--fade-out' : ''}`}>
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
