import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { GameState, ScoreCategory } from '../types/game';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'https://improved-sybilla-h3lv0k-561baea7.koyeb.app';

const INITIAL_STATE: SocketState = {
  connected: false,
  gameState: null,
  roomCode: null,
  playerId: null,
  sessionId: null,
  error: null,
  gameOver: null,
  opponentDisconnected: false,
};

export interface SocketState {
  connected: boolean;
  gameState: GameState | null;
  roomCode: string | null;
  playerId: string | null;
  sessionId: string | null;
  error: string | null;
  gameOver: {
    winner: string;
    players: GameState['players'];
    surrendered?: string;
    opponentLeft?: boolean;
  } | null;
  opponentDisconnected: boolean;
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<SocketState>(INITIAL_STATE);
  // Track whether we were already in a session before a reconnect
  const wasInGameRef = useRef(false);

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setState((s) => {
        // Reconnect while in an active session — try to recover
        if (wasInGameRef.current && s.roomCode !== null && s.sessionId !== null) {
          socket.emit('reconnect_session', { code: s.roomCode, sessionId: s.sessionId });
          // Keep current state while we wait for successful reconnection
          return { ...s, connected: true, playerId: socket.id ?? null, error: 'Восстановление сессии...' };
        }
        
        // Otherwise, reset to lobby
        if (wasInGameRef.current && (s.gameState !== null || s.roomCode !== null)) {
          wasInGameRef.current = false;
          return {
            ...INITIAL_STATE,
            connected: true,
            playerId: socket.id ?? null,
            error: 'Сессия не найдена. Начните новую игру.',
          };
        }
        return { ...s, connected: true, playerId: socket.id ?? null };
      });
    });

    socket.on('disconnect', () => {
      setState((s) => {
        if (s.gameState !== null || s.roomCode !== null) {
          wasInGameRef.current = true;
        }
        return { ...s, connected: false };
      });
    });

    socket.on('connect_error', (err) => {
      setState((s) => ({ ...s, connected: false, error: `Ошибка подключения: ${err.message}` }));
    });

    socket.on('reconnect_failed', (data?: { message?: string }) => {
      wasInGameRef.current = false;
      setState((s) => ({
        ...INITIAL_STATE,
        connected: socket.connected,
        playerId: socket.id ?? null,
        error: data?.message || 'Не удалось восстановить сессию. Перезагрузите страницу.',
      }));
    });

    socket.on('reconnected_successfully', ({ code, sessionId }: { code: string; sessionId: string }) => {
      wasInGameRef.current = true;
      setState((s) => ({ ...s, roomCode: code, sessionId, error: null, opponentDisconnected: false }));
    });

    socket.on('player_reconnected', () => {
      setState((s) => ({ ...s, opponentDisconnected: false }));
    });

    socket.on('player_temporarily_disconnected', () => {
      setState((s) => ({ ...s, opponentDisconnected: true }));
    });

    socket.on('room_created', ({ code, sessionId }: { code: string; sessionId?: string }) => {
      wasInGameRef.current = true;
      setState((s) => ({ ...s, roomCode: code, sessionId: sessionId ?? null, error: null }));
    });

    socket.on('joined_room', ({ code, sessionId }: { code: string; sessionId?: string }) => {
      wasInGameRef.current = true;
      setState((s) => ({ ...s, roomCode: code, sessionId: sessionId ?? null, error: null }));
    });

    socket.on('game_started', () => {
      wasInGameRef.current = true;
      setState((s) => ({ ...s, gameOver: null, opponentDisconnected: false }));
    });

    socket.on('game_state', (gameState: GameState) => {
      setState((s) => ({ ...s, gameState, error: null }));
    });

    socket.on('game_over', (data: { winner: string; players: GameState['players'] }) => {
      setState((s) => ({ ...s, gameOver: data }));
    });

    socket.on('player_disconnected', () => {
      setState((s) => ({ ...s, opponentDisconnected: true }));
    });

    socket.on('error', ({ message }: { message: string }) => {
      setState((s) => ({ ...s, error: message }));
      setTimeout(() => setState((s) => ({ ...s, error: null })), 4000);
    });

    socket.on('connect_timeout', () => {
      setState((s) => ({ ...s, error: 'Таймаут подключения. Проверьте интернет.' }));
    });

    return () => { socket.disconnect(); };
  }, []);

  const createRoom = useCallback((name: string, avatar: string) => {
    if (!socketRef.current?.connected) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 2) return;
    socketRef.current.emit('create_room', { name: trimmed, avatar });
  }, []);

  const joinRoom = useCallback((code: string, name: string, avatar: string) => {
    if (!socketRef.current?.connected) return;
    const trimmed = name.trim();
    const trimCode = code.trim().toUpperCase();
    if (!trimmed || trimmed.length < 2) return;
    if (trimCode.length !== 5) return;
    socketRef.current.emit('join_room', { code: trimCode, name: trimmed, avatar });
  }, []);

  const rollDice = useCallback(() => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit('roll_dice');
  }, []);

  const toggleHold = useCallback((index: number) => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit('toggle_hold', { index });
  }, []);

  const scoreCategory = useCallback((category: ScoreCategory) => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit('score_category', { category });
  }, []);

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit('leave_room');
    wasInGameRef.current = false;
    setState((s) => ({
      ...s,
      gameState: null,
      roomCode: null,
      gameOver: null,
      opponentDisconnected: false,
      error: null,
    }));
  }, []);

  const rematch = useCallback(() => {
    socketRef.current?.emit('rematch');
  }, []);

  const surrender = useCallback(() => {
    socketRef.current?.emit('surrender');
  }, []);

  const sendReaction = useCallback((emoji: string) => {
    socketRef.current?.emit('send_reaction', { emoji });
  }, []);

  const onReaction = useCallback((cb: (data: { senderId: string; emoji: string }) => void) => {
    const s = socketRef.current;
    if (!s) return () => {};
    s.on('receive_reaction', cb);
    return () => {
      s.off('receive_reaction', cb);
    };
  }, []);

  return {
    state,
    createRoom,
    joinRoom,
    rollDice,
    toggleHold,
    scoreCategory,
    rematch,
    surrender,
    leaveRoom,
    sendReaction,
    onReaction,
  };
}
