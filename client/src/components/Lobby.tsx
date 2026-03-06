import React, { useState, useEffect, useRef } from 'react';
import './Lobby.css';

const AVATAR_CATEGORIES = [
  {
    label: '😊',
    title: 'Счастливые',
    emojis: ['😀','😁','😄','😆','😎','🤩','🥳','😇','🤗','😋','😍','🥰','😂','🤣','😅'],
  },
  {
    label: '😢',
    title: 'Грустные',
    emojis: ['😢','😭','😔','😟','😕','🙁','☹️','😞','😩','😫','💔','😿','🥺','😥','😰'],
  },
  {
    label: '😲',
    title: 'Удивлённые',
    emojis: ['😮','😯','😲','🤯','😱','🙀','😳','🤫','🤔','😶','😑','🫠','😬','🥴','🤪'],
  },
  {
    label: '🐱',
    title: 'Животные',
    emojis: ['🐱','🐶','🐸','🦊','🐼','🦁','🐯','🐻','🐺','🦄','🐲','🐮','🐧','🦋','🐨'],
  },
  {
    label: '🎲',
    title: 'Символы',
    emojis: ['🎲','🃏','🏆','🎯','💎','🔥','⚡','🌈','🎸','🚀','👾','🧩','🎮','🎃','🤖'],
  },
];

interface Props {
  defaultName: string;
  onCreateRoom: (name: string, avatar: string) => void;
  onJoinRoom: (code: string, name: string, avatar: string) => void;
  onPlayVsBot: (name: string, avatar: string) => void;
  roomCode: string | null;
  error: string | null;
  connected: boolean;
}

export const Lobby: React.FC<Props> = ({
  defaultName, onCreateRoom, onJoinRoom, onPlayVsBot, roomCode, error, connected,
}) => {
  const [name, setName] = useState(defaultName);
  const [joinCode, setJoinCode] = useState('');
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [avatar, setAvatar] = useState('😀');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCategory, setPickerCategory] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  // Sync Telegram name if it arrives after first render
  useEffect(() => {
    if (defaultName) setName(defaultName);
  }, [defaultName]);

  const handleCreate = () => {
    if (!name.trim()) { setLocalError('Введи имя'); return; }
    if (name.trim().length < 2) { setLocalError('Имя слишком короткое (мин. 2 символа)'); return; }
    setLocalError(null);
    onCreateRoom(name.trim(), avatar);
  };

  const handleJoin = () => {
    if (!name.trim()) { setLocalError('Введи имя'); return; }
    if (name.trim().length < 2) { setLocalError('Имя слишком короткое (мин. 2 символа)'); return; }
    if (joinCode.trim().length !== 5) { setLocalError('Код комнаты должен содержать 5 символов'); return; }
    if (!/^[A-Z0-9]+$/.test(joinCode.trim())) { setLocalError('Недопустимые символы в коде'); return; }
    setLocalError(null);
    onJoinRoom(joinCode.trim(), name.trim(), avatar);
  };

  const handleVsBot = () => {
    if (!name.trim()) { setLocalError('Введи имя'); return; }
    if (name.trim().length < 2) { setLocalError('Имя слишком короткое (мин. 2 символа)'); return; }
    setLocalError(null);
    onPlayVsBot(name.trim(), avatar);
  };

  return (
    <div className="lobby">
      <div className="lobby-header">
        <div className="lobby-icon">🎲</div>
        <h1>Yatzy</h1>
        <p className="lobby-subtitle">Multiplayer · Telegram Mini App</p>
        <span className="lobby-version">v3.0</span>
      </div>

      <div className="lobby-card">
        <div className="field">
          <label>Твоё имя</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Введи имя..."
            maxLength={20}
          />
        </div>

        <div className="field">
          <label>Аватар</label>
          <div className="avatar-picker" ref={pickerRef}>
            <button
              className="avatar-trigger"
              onClick={() => setPickerOpen((v) => !v)}
              type="button"
            >
              <span className="avatar-trigger-emoji">{avatar}</span>
              <span className="avatar-trigger-label">Выбрать {pickerOpen ? '▲' : '▼'}</span>
            </button>

            {pickerOpen && (
              <div className="avatar-dropdown">
                <div className="avatar-category-tabs">
                  {AVATAR_CATEGORIES.map((cat, i) => (
                    <button
                      key={cat.title}
                      className={`avatar-cat-tab ${pickerCategory === i ? 'avatar-cat-tab--active' : ''}`}
                      onClick={() => setPickerCategory(i)}
                      title={cat.title}
                      type="button"
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
                <div className="avatar-grid">
                  {AVATAR_CATEGORIES[pickerCategory].emojis.map((em) => (
                    <button
                      key={em}
                      className={`avatar-btn ${avatar === em ? 'avatar-btn--selected' : ''}`}
                      onClick={() => { setAvatar(em); setPickerOpen(false); }}
                      type="button"
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="tabs">
          <button
            className={`tab ${tab === 'create' ? 'tab--active' : ''}`}
            onClick={() => setTab('create')}
          >
            Создать игру
          </button>
          <button
            className={`tab ${tab === 'join' ? 'tab--active' : ''}`}
            onClick={() => setTab('join')}
          >
            Подключиться
          </button>
        </div>

        {tab === 'create' ? (
          <div className="tab-content">
            {roomCode ? (
              <div className="room-code-box">
                <p>Поделись кодом с другом:</p>
                <div className="room-code">{roomCode}</div>
                <p className="waiting-text">⏳ Ожидаем второго игрока…</p>
              </div>
            ) : (
              <button
                className="btn btn--primary"
                onClick={handleCreate}
                disabled={!connected || !name.trim()}
              >
                Создать комнату
              </button>
            )}
          </div>
        ) : (
          <div className="tab-content">
            <div className="field">
              <label>Код комнаты</label>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="XXXXX"
                maxLength={5}
                style={{ textTransform: 'uppercase', letterSpacing: '4px', fontSize: '20px', textAlign: 'center' }}
              />
            </div>
            <button
              className="btn btn--primary"
              onClick={handleJoin}
              disabled={!connected || !name.trim() || joinCode.length < 5}
            >
              Войти в комнату
            </button>
          </div>
        )}

        {(error || localError) && <div className="error-msg">{localError || error}</div>}
        {!connected && <div className="error-msg">Подключение к серверу…</div>}
      </div>

      <div className="lobby-card lobby-card--bot">
        <div className="bot-section-label">или</div>
        <button
          className="btn btn--bot"
          onClick={handleVsBot}
          disabled={!name.trim()}
        >
          🤖 Играть против бота
        </button>
        <p className="bot-hint">Без ожидания · 1 бонусный бросок за игру</p>
      </div>
    </div>
  );
};
