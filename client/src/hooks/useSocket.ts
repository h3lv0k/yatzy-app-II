import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { GameState, ScoreCategory } from '../types/game';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

const INITIAL_STATE: SocketState = {
  connected: false,
  gameState: null,
  roomCode: null,
  playerId: null,
  error: null,
  gameOver: null,
  opponentDisconnected: false,
};

export interface SocketState {
  connected: boolean;
  gameState: GameState | null;
  roomCode: string | null;
  playerId: string | null;
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
        // Reconnect while in an active session — server lost our socket, reset to lobby
        if (wasInGameRef.current && (s.gameState !== null || s.roomCode !== null)) {
          wasInGameRef.current = false;
          return {
            ...INITIAL_STATE,
            connected: true,
            playerId: socket.id ?? null,
            error: 'Соединение прервалось. Начните новую игру.',
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

    socket.on('reconnect_failed', () => {
      setState((s) => ({ ...s, error: 'Не удалось подключиться к серверу. Перезагрузите страницу.' }));
    });

    socket.on('room_created', ({ code }: { code: string }) => {
      wasInGameRef.current = true;
      setState((s) => ({ ...s, roomCode: code, error: null }));
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

  return { state, createRoom, joinRoom, rollDice, toggleHold, scoreCategory, rematch, surrender, leaveRoom };
}
