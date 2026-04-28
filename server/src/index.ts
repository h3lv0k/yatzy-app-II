import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import {
  GameState, Player, Room, ScoreSheet, SCORE_CATEGORIES, ScoreCategory,
} from './types';
import {
  rollDice, calculateScore, computeTotalScore, computeUpperTotal,
} from './game/yatzyLogic';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// In-memory rooms: code -> Room
const rooms = new Map<string, Room>();
// socketId -> roomCode
const socketRoom = new Map<string, string>();
// socketId -> last roll timestamp (rate limiting)
const lastRoll = new Map<string, number>();

// Cleanup stale empty rooms every 10 minutes
setInterval(() => {
  for (const [code, room] of rooms.entries()) {
    if (room.gameState.players.length === 0) {
      for (const timer of room.disconnectTimers.values()) {
        clearTimeout(timer);
      }
      rooms.delete(code);
    }
  }
}, 10 * 60 * 1000);

function generateCode(): string {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function createPlayer(id: string, name: string, avatar: string, sessionId?: string): Player {
  return { id, name, avatar, scores: {}, totalScore: 0, upperBonus: false, sessionId, connected: true };
}

function initialGameState(roomId: string): GameState {
  return {
    roomId,
    players: [],
    currentPlayerIndex: 0,
    dice: [1, 1, 1, 1, 1],
    heldDice: [false, false, false, false, false],
    rollsLeft: 3,
    phase: 'waiting',
    turn: 0,
    maxTurns: SCORE_CATEGORIES.length, // 13 turns per player
  };
}

function isTurnComplete(player: Player): boolean {
  return SCORE_CATEGORIES.every((cat) => player.scores[cat] !== undefined);
}

function updateWinner(state: GameState): void {
  const [p0, p1] = state.players;
  if (!p0 || !p1) return;
  if (p0.totalScore > p1.totalScore) state.winner = p0.id;
  else if (p1.totalScore > p0.totalScore) state.winner = p1.id;
  else state.winner = p0.id; // tie — player who started wins
}

io.on('connection', (socket: Socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  function safeHandler(name: string, fn: () => void) {
    try { fn(); } catch (err) {
      console.error(`[error] handler '${name}':`, err);
      socket.emit('error', { message: 'Внутренняя ошибка сервера' });
    }
  }

  // Create a room
  socket.on('create_room', ({ name, avatar }: { name: string; avatar?: string }) => safeHandler('create_room', () => {
    if (!name || typeof name !== 'string' || !name.trim()) {
      socket.emit('error', { message: 'Введите имя игрока' });
      return;
    }
    if (name.trim().length < 2) {
      socket.emit('error', { message: 'Имя слишком короткое (мин. 2 символа)' });
      return;
    }
    if (name.trim().length > 20) {
      socket.emit('error', { message: 'Имя слишком длинное (макс. 20 символов)' });
      return;
    }
    // If already in a room — leave it first
    const existingCode = socketRoom.get(socket.id);
    if (existingCode) {
      const existingRoom = rooms.get(existingCode);
      if (existingRoom) {
        existingRoom.gameState.players = existingRoom.gameState.players.filter((p) => p.id !== socket.id);
        if (existingRoom.gameState.players.length === 0) rooms.delete(existingCode);
        else io.to(existingCode).emit('player_disconnected', { id: socket.id });
      }
      socketRoom.delete(socket.id);
      socket.leave(existingCode);
    }

    const code = generateCode();
    const roomId = uuidv4();
    const sessionId = uuidv4();
    const player = createPlayer(socket.id, name.trim(), avatar?.trim() || '😀', sessionId);
    const gameState = initialGameState(roomId);
    gameState.players.push(player);

    const room: Room = { 
      id: roomId, 
      code, 
      gameState,
      temporarilyDisconnected: new Map(),
      disconnectTimers: new Map()
    };
    rooms.set(code, room);
    socketRoom.set(socket.id, code);
    socket.join(code);

    socket.emit('room_created', { code, roomId, playerId: socket.id, sessionId });
    socket.emit('game_state', gameState);
    console.log(`Room created: ${code} by ${name}`);
  }));

  // Join a room
  socket.on('join_room', ({ code, name, avatar }: { code: string; name: string; avatar?: string }) => safeHandler('join_room', () => {
    if (!code || typeof code !== 'string' || !code.trim()) {
      socket.emit('error', { message: 'Введите код комнаты' });
      return;
    }
    if (!name || typeof name !== 'string' || !name.trim()) {
      socket.emit('error', { message: 'Введите имя игрока' });
      return;
    }
    if (name.trim().length < 2) {
      socket.emit('error', { message: 'Имя слишком короткое (мин. 2 символа)' });
      return;
    }
    if (name.trim().length > 20) {
      socket.emit('error', { message: 'Имя слишком длинное (макс. 20 символов)' });
      return;
    }
    const upperCode = code.toUpperCase().trim();
    const room = rooms.get(upperCode);

    if (!room) {
      socket.emit('error', { message: 'Комната не найдена' });
      return;
    }
    if (room.gameState.players.some((p) => p.id === socket.id)) {
      socket.emit('error', { message: 'Вы уже в этой комнате' });
      return;
    }
    if (room.gameState.players.length >= 2) {
      socket.emit('error', { message: 'Комната заполнена' });
      return;
    }
    if (room.gameState.phase !== 'waiting') {
      socket.emit('error', { message: 'Игра уже началась' });
      return;
    }

    const sessionId = uuidv4();
    const player = createPlayer(socket.id, name.trim(), avatar?.trim() || '😎', sessionId);
    room.gameState.players.push(player);
    socketRoom.set(socket.id, upperCode);
    socket.join(upperCode);

    // Start the game
    room.gameState.phase = 'rolling';
    room.gameState.rollsLeft = 3;
    room.gameState.heldDice = [false, false, false, false, false];

    // Inform the joining player
    socket.emit('joined_room', { code: upperCode, roomId: room.id, playerId: socket.id, sessionId });

    io.to(upperCode).emit('game_started', { roomId: room.id });
    io.to(upperCode).emit('game_state', room.gameState);
    console.log(`${name} joined room ${upperCode}`);
  }));

  // Roll dice
  socket.on('roll_dice', () => safeHandler('roll_dice', () => {
    // Rate limit: max 1 roll per 300ms
    const now = Date.now();
    const last = lastRoll.get(socket.id) ?? 0;
    if (now - last < 300) {
      socket.emit('error', { message: 'Слишком быстро!' });
      return;
    }
    lastRoll.set(socket.id, now);

    const code = socketRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    const { gameState } = room;

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (!currentPlayer) return;
    if (currentPlayer.id !== socket.id) {
      socket.emit('error', { message: 'Не ваш ход' });
      return;
    }
    if (gameState.rollsLeft <= 0) {
      socket.emit('error', { message: 'Нет бросков' });
      return;
    }
    if (gameState.phase !== 'rolling') {
      socket.emit('error', { message: 'Нельзя бросить сейчас' });
      return;
    }

    gameState.dice = rollDice(gameState.dice, gameState.heldDice);
    gameState.rollsLeft -= 1;
    if (gameState.rollsLeft === 0) gameState.phase = 'scoring';

    io.to(code).emit('game_state', gameState);
  }));

  // Toggle hold
  socket.on('toggle_hold', ({ index }: { index: number }) => safeHandler('toggle_hold', () => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    const { gameState } = room;

    if (typeof index !== 'number' || index < 0 || index > 4) return;
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== socket.id) return;
    if (gameState.rollsLeft === 3) return; // must roll first
    if (gameState.rollsLeft === 0) return; // must score

    gameState.heldDice[index] = !gameState.heldDice[index];
    io.to(code).emit('game_state', gameState);
  }));

  // Score a category
  socket.on('score_category', ({ category }: { category: ScoreCategory }) => safeHandler('score_category', () => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    const { gameState } = room;

    if (!SCORE_CATEGORIES.includes(category)) {
      socket.emit('error', { message: 'Неверная категория' });
      return;
    }
    if (gameState.phase === 'finished') {
      socket.emit('error', { message: 'Игра уже завершена' });
      return;
    }
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (!currentPlayer) return;
    if (currentPlayer.id !== socket.id) {
      socket.emit('error', { message: 'Не ваш ход' });
      return;
    }
    if (gameState.rollsLeft === 3) {
      socket.emit('error', { message: 'Сначала бросьте кубики' });
      return;
    }
    if (currentPlayer.scores[category] !== undefined) {
      socket.emit('error', { message: 'Категория уже заполнена' });
      return;
    }

    // Apply score (0 if using category as scratch)
    const score = calculateScore(category, gameState.dice);
    currentPlayer.scores[category] = score;
    currentPlayer.totalScore = computeTotalScore(currentPlayer.scores);
    currentPlayer.upperBonus = computeUpperTotal(currentPlayer.scores) >= 63;

    // Check if all players finished
    const allDone = gameState.players.every((p) => isTurnComplete(p));
    if (allDone) {
      gameState.phase = 'finished';
      updateWinner(gameState);
      io.to(code).emit('game_state', gameState);
      io.to(code).emit('game_over', {
        winner: gameState.winner,
        players: gameState.players,
      });
      return;
    }

    // Move to next player
    const nextIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
    gameState.currentPlayerIndex = nextIndex;
    gameState.rollsLeft = 3;
    gameState.heldDice = [false, false, false, false, false];
    gameState.phase = 'rolling';
    gameState.turn += 1;

    io.to(code).emit('game_state', gameState);
  }));

  // Leave room
  socket.on('leave_room', () => safeHandler('leave_room', () => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    socketRoom.delete(socket.id);
    socket.leave(code);
    if (!room) return;
    
    room.gameState.players = room.gameState.players.filter((p) => p.id !== socket.id);
    if (room.gameState.players.length === 0) {
      Array.from(room.disconnectTimers.values()).forEach(clearTimeout);
      rooms.delete(code);
    } else {
      io.to(code).emit('player_disconnected', { id: socket.id });
    }
  }));

  // Surrender
  socket.on('surrender', () => safeHandler('surrender', () => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    const { gameState } = room;
    if (gameState.phase === 'finished' || gameState.phase === 'waiting') return;

    const opponent = gameState.players.find((p) => p.id !== socket.id);
    if (!opponent) return;

    gameState.phase = 'finished';
    gameState.winner = opponent.id;

    io.to(code).emit('game_state', gameState);
    io.to(code).emit('game_over', {
      winner: gameState.winner,
      players: gameState.players,
      surrendered: socket.id,
    });
  }));

  // Rematch
  socket.on('rematch', () => safeHandler('rematch', () => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    const { gameState } = room;

    // Check both players are still connected
    if (gameState.players.length < 2 || gameState.players.some(p => !p.connected)) {
      socket.emit('error', { message: 'Противник не в сети или уже покинул игру' });
      return;
    }
    const opponentId = gameState.players.find((p) => p.id !== socket.id)?.id;
    if (!opponentId || !socketRoom.has(opponentId)) {
      socket.emit('error', { message: 'Противник не в сети или уже покинул игру' });
      return;
    }
    // Reset scores, keep players, alternate who goes first
    const prevFirst = gameState.currentPlayerIndex;
    gameState.players.forEach((p) => {
      p.scores = {} as ScoreSheet;
      p.totalScore = 0;
      p.upperBonus = false;
    });
    gameState.currentPlayerIndex = prevFirst === 0 ? 1 : 0;
    gameState.dice = [1, 1, 1, 1, 1];
    gameState.heldDice = [false, false, false, false, false];
    gameState.rollsLeft = 3;
    gameState.phase = 'rolling';
    gameState.turn = 0;
    gameState.winner = undefined;

    io.to(code).emit('game_started');
    io.to(code).emit('game_state', gameState);
  }));

  // Disconnect
  socket.on('disconnect', () => {
    const code = socketRoom.get(socket.id);
    socketRoom.delete(socket.id);
    lastRoll.delete(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;

    const { gameState } = room;
    const player = gameState.players.find((p) => p.id === socket.id);
    
    // If game hasn't started yet, just remove them immediately
    if (gameState.phase === 'waiting') {
      gameState.players = gameState.players.filter((p) => p.id !== socket.id);
      if (gameState.players.length === 0) {
        Array.from(room.disconnectTimers.values()).forEach(clearTimeout);
        rooms.delete(code);
      } else {
        io.to(code).emit('player_disconnected', { id: socket.id });
      }
      return;
    }

    if (!player || !player.sessionId) return;
    
    player.connected = false;
    room.temporarilyDisconnected.set(player.sessionId, { playerId: player.id, timestamp: Date.now() });

    const timeout = setTimeout(() => {
      // 3 minutes passed, player hasn't returned
      if (!rooms.has(code)) return;
      const currentRoom = rooms.get(code)!;
      currentRoom.temporarilyDisconnected.delete(player.sessionId!);
      currentRoom.disconnectTimers.delete(player.sessionId!);
      
      currentRoom.gameState.players = currentRoom.gameState.players.filter((p) => p.id !== player.id);
      
      const wasActive = currentRoom.gameState.phase !== 'finished';
      if (currentRoom.gameState.players.length === 0) {
        Array.from(currentRoom.disconnectTimers.values()).forEach(clearTimeout);
        rooms.delete(code);
      } else {
        if (wasActive) {
          currentRoom.gameState.phase = 'finished';
          currentRoom.gameState.winner = currentRoom.gameState.players[0]?.id;
          currentRoom.gameState.currentPlayerIndex = 0;
          io.to(code).emit('game_state', currentRoom.gameState);
          io.to(code).emit('game_over', {
            winner: currentRoom.gameState.winner,
            players: currentRoom.gameState.players,
            opponentLeft: true,
          });
        }
        io.to(code).emit('player_disconnected', { id: player.id });
      }
    }, 3 * 60 * 1000); // 3 minutes timeout

    room.disconnectTimers.set(player.sessionId, timeout);
    io.to(code).emit('player_temporarily_disconnected', { 
      id: player.id, 
      timeLeft: 3 * 60 * 1000 
    });
    io.to(code).emit('game_state', gameState); // update connected status

    console.log(`[-] Temorarily Disconnected (3m timeout): ${socket.id} from room ${code}`);
  });

  // Reconnect a session
  socket.on('reconnect_session', ({ code, sessionId }: { code: string; sessionId: string }) => safeHandler('reconnect_session', () => {
    if (!code || !sessionId) return;
    const upperCode = code.toUpperCase().trim();
    const room = rooms.get(upperCode);
    
    if (!room) {
      socket.emit('reconnect_failed', { message: 'Комната не найдена или была удалена' });
      return;
    }

    if (!room.temporarilyDisconnected.has(sessionId)) {
      // Maybe player wasn't disconnected or is invalid
      socket.emit('reconnect_failed', { message: 'Сессия не найдена' });
      return;
    }

    // Found! Cancel the timeout
    const timer = room.disconnectTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      room.disconnectTimers.delete(sessionId);
    }
    room.temporarilyDisconnected.delete(sessionId);

    // Rebind the socket
    const player = room.gameState.players.find((p) => p.sessionId === sessionId);
    if (player) {
      player.id = socket.id; // Update player id to new socket id
      player.connected = true;
      socketRoom.set(socket.id, upperCode);
      socket.join(upperCode);

      // We might need to fix `winner` or `currentPlayerIndex` if they relied on socket.id?
      // currentPlayerIndex is index (0/1), so it's fine. `winner` uses ID, but winner might not be set.
      
      socket.emit('reconnected_successfully', { code: upperCode, roomId: room.id, playerId: socket.id, sessionId });
      io.to(upperCode).emit('player_reconnected', { id: socket.id });
      io.to(upperCode).emit('game_state', room.gameState);
      console.log(`[+] Reconnected: ${socket.id} into room ${upperCode}`);
    }
  }));
});

app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = parseInt(process.env.PORT || '8000', 10);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Yatzy server running on 0.0.0.0:${PORT}`);
});
