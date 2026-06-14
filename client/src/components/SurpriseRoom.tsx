import React, { useState, useEffect } from 'react';
import Confetti from 'react-confetti';
import { useTelegram } from '../hooks/useTelegram';
import './SurpriseRoom.css';

interface Props {
  onLeave: () => void;
}

export const SurpriseRoom: React.FC<Props> = ({ onLeave }) => {
  const { haptic } = useTelegram();
  const [candles, setCandles] = useState([true, true, true, true]); // 4 candles
  const [showHint, setShowHint] = useState(true);
  const [celebrating, setCelebrating] = useState(false);
  const [showExit, setShowExit] = useState(false);
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleCandleClick = (index: number) => {
    if (!candles[index]) return;
    
    if (showHint) setShowHint(false);
    haptic?.impactOccurred('medium');

    const newCandles = [...candles];
    newCandles[index] = false;
    setCandles(newCandles);

    if (newCandles.every(c => !c)) {
      setCelebrating(true);
      haptic?.notificationOccurred('success');
      
      // Show exit button after 15 seconds
      setTimeout(() => {
        setShowExit(true);
      }, 15000);
    }
  };

  return (
    <div className="surprise-room">
      {celebrating && <Confetti width={windowSize.width} height={windowSize.height} recycle={true} numberOfPieces={200} />}
      
      <div className="surprise-content">
        {!celebrating ? (
          <div className="cake-section">
            <div className="cake-wrapper">
              <svg viewBox="0 0 200 160" className="cake-svg">
                {/* Plate */}
                <ellipse cx="100" cy="140" rx="90" ry="15" fill="#e0e0e0" />
                <ellipse cx="100" cy="135" rx="85" ry="12" fill="#ffffff" />
                
                {/* Cake Bottom Layer */}
                <rect x="40" y="80" width="120" height="50" fill="#f08080" />
                <ellipse cx="100" cy="130" rx="60" ry="10" fill="#cd5c5c" />
                
                {/* Middle Cream Layer */}
                <rect x="40" y="95" width="120" height="10" fill="#fffaff" opacity="0.8" />
                
                {/* Cake Top & Drips */}
                <rect x="40" y="70" width="120" height="20" fill="#f08080" />
                <ellipse cx="100" cy="70" rx="60" ry="15" fill="#ffb6c1" />
                
                {/* Drips */}
                <path d="M40 75 Q45 95 50 75 Q55 100 65 75 Q75 105 85 75 Q100 110 115 75 Q130 100 140 75 Q150 95 160 75" fill="#ffb6c1" />
                
                {/* Sprinkles */}
                <circle cx="70" cy="65" r="2" fill="#ffcc00" />
                <circle cx="90" cy="72" r="2" fill="#ff69b4" />
                <circle cx="110" cy="68" r="2" fill="#00ced1" />
                <circle cx="130" cy="74" r="2" fill="#ffa500" />
                <circle cx="100" cy="62" r="2" fill="#ffffff" />
              </svg>

              <div className="candles-container">
                {candles.map((isOn, i) => (
                  <div 
                    key={i} 
                    className={`candle ${isOn ? 'on' : 'off'}`}
                    onClick={() => handleCandleClick(i)}
                  >
                    {isOn && <div className="flame"></div>}
                  </div>
                ))}
              </div>
            </div>
            {showHint && <div className="surprise-hint">Задуй свечи! 🎂</div>}
          </div>
        ) : (
          <div className="message-section">
            <h1 className="message-title">Дяреуууу, родная!)</h1>
            <div className="message-body">
              <p>Поздравляю тебя с той циферкой, после которой паспорт наконец-то обретает хоть какое-то значение хохо</p>
              <p>Пусть в твоей жизни будет побольше ятзочек и сваги 🖤</p>
              <p>Не хочу повторяться: все самое главное я изложил и положил внутри подарка, поэтому беги открывай 💋</p>
              <p className="message-footer">С днем рожденьечка тебя 🎆🎆🎆</p>
            </div>
            
            {showExit && (
              <button className="btn btn--exit fade-in" onClick={onLeave}>
                Вернуться в игру
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
