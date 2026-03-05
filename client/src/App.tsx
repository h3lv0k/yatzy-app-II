import React, { useEffect, useState } from 'react';
import { useSocket } from './hooks/useSocket';
import { useLocalGame, LOCAL_PLAYER_ID } from './hooks/useLocalGame';
import { useTelegram } from './hooks/useTelegram';
import { Lobby } from './components/Lobby';
import { GameBoard } from './components/GameBoard';
import { GameOver } from './components/GameOver';
import { ScoreCategory } from './types/game';
import './App.css';

function App() {
  const { state, createRoom, joinRoom, rollDice, toggleHold, scoreCategory, rematch, surrender, leaveRoom } = useSocket();
  const { defaultName, haptic } = useTelegram();

  // ── Bot game state ──────────────────────────────────────────────────────
  const [botPlayerName, setBotPlayerName] = useState('');
  const [botPlayerAvatar, setBotPlayerAvatar] = useState('😀');
  const {
    localState, start: startBotGame, rollDice: botRoll, toggleHold: botToggleHold,
    scoreCategory: botScore, surrender: botSurrender, rematch: botRematch,
    leaveGame: botLeave, watchAdForBonusRoll,
  } = useLocalGame(botPlayerName, botPlayerAvatar);
  const [isBotMode, setIsBotMode] = useState(false);

  const { gameState, playerId, roomCode, error, gameOver, connected, opponentDisconnected } = state;

  // ── Multiplayer handlers ─────────────────────────────────────────────────
  const handleRoll = () => {
    haptic?.impactOccurred('medium');
    rollDice();
  };

  const handleScore = (cat: ScoreCategory) => {
    haptic?.notificationOccurred('success');
    scoreCategory(cat);
  };

  const handleRematch = () => {
    haptic?.impactOccurred('light');
    rematch();
  };

  // ── Bot game handlers ────────────────────────────────────────────────────
  const handlePlayVsBot = (name: string, avatar: string) => {
    setBotPlayerName(name);
    setBotPlayerAvatar(avatar);
    setIsBotMode(true);
  };

  // Start local game once player info is committed
  useEffect(() => {
    if (isBotMode && botPlayerName) {
      startBotGame();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBotMode, botPlayerName]);

  const handleBotRoll = () => {
    haptic?.impactOccurred('medium');
    botRoll();
  };

  const handleBotScore = (cat: ScoreCategory) => {
    haptic?.notificationOccurred('success');
    botScore(cat);
  };

  const handleBotRematch = () => {
    haptic?.impactOccurred('light');
    botRematch();
  };

  const handleBotLeave = () => {
    setIsBotMode(false);
    setBotPlayerName('');
    botLeave();
  };

  // ── Routing: BOT MODE ────────────────────────────────────────────────────
  if (isBotMode) {
    const { gameState: botGs, gameOver: botGo, adBonusAvailable, isWatchingAd, adCountdown, isNextBonusFree } = localState;

    if (botGo && botGs) {
      return (
        <GameOver
          winner={botGo.winner}
          players={botGo.players}
          myId={LOCAL_PLAYER_ID}
          onRematch={handleBotRematch}
          onLeave={handleBotLeave}
          error={null}
          surrendered={botGo.surrendered}
          opponentLeft={false}
        />
      );
    }

    if (botGs && botGs.phase !== 'waiting') {
      return (
        <GameBoard
          gameState={botGs}
          myId={LOCAL_PLAYER_ID}
          onRoll={handleBotRoll}
          onToggleHold={botToggleHold}
          onScore={handleBotScore}
          onSurrender={botSurrender}
          onLeave={handleBotLeave}
          error={null}
          opponentDisconnected={false}
          isBotGame
          adBonusAvailable={adBonusAvailable}
          isWatchingAd={isWatchingAd}
          adCountdown={adCountdown}
          isNextBonusFree={isNextBonusFree}
          onWatchAd={watchAdForBonusRoll}
        />
      );
    }

    // Waiting for localState to initialise (instant)
    return <div className="loading">Загрузка…</div>;
  }

  // ── Routing: MULTIPLAYER ─────────────────────────────────────────────────
  const inGame = gameState && gameState.phase !== 'waiting' && gameState.players.length === 2;
  const isFinished = gameOver !== null;

  if (isFinished && gameState && playerId) {
    return (
      <GameOver
        winner={gameOver!.winner}
        players={gameOver!.players}
        myId={playerId}
        onRematch={handleRematch}
        onLeave={leaveRoom}
        error={error}
        surrendered={gameOver!.surrendered}
        opponentLeft={gameOver!.opponentLeft}
      />
    );
  }

  if (inGame && playerId) {
    return (
      <GameBoard
        gameState={gameState!}
        myId={playerId}
        onRoll={handleRoll}
        onToggleHold={toggleHold}
        onScore={handleScore}
        onSurrender={surrender}
        onLeave={leaveRoom}
        error={error}
        opponentDisconnected={opponentDisconnected}
      />
    );
  }

  return (
    <Lobby
      defaultName={defaultName}
      onCreateRoom={createRoom}
      onJoinRoom={joinRoom}
      onPlayVsBot={handlePlayVsBot}
      roomCode={roomCode}
      error={error}
      connected={connected}
    />
  );
}

export default App;

