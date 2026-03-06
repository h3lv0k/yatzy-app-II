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
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (room.gameState.players.length === 0) {
      rooms.delete(code);
    }
  }
}, 10 * 60 * 1000);

function generateCode(): string {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function createPlayer(id: string, name: string, avatar: string): Player {
  return { id, name, avatar, scores: {}, totalScore: 0, upperBonus: false };
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
    const player = createPlayer(socket.id, name.trim(), avatar?.trim() || '😀');
    const gameState = initialGameState(roomId);
    gameState.players.push(player);

    const room: Room = { id: roomId, code, gameState };
    rooms.set(code, room);
    socketRoom.set(socket.id, code);
    socket.join(code);

    socket.emit('room_created', { code, roomId, playerId: socket.id });
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

    const player = createPlayer(socket.id, name.trim(), avatar?.trim() || '😎');
    room.gameState.players.push(player);
    socketRoom.set(socket.id, upperCode);
    socket.join(upperCode);

    // Start the game
    room.gameState.phase = 'rolling';
    room.gameState.rollsLeft = 3;
    room.gameState.heldDice = [false, false, false, false, false];

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
    if (gameState.players.length < 2) {
      socket.emit('error', { message: 'Противник уже покинул игру' });
      return;
    }
    const opponentId = gameState.players.find((p) => p.id !== socket.id)?.id;
    if (!opponentId || !socketRoom.has(opponentId)) {
      socket.emit('error', { message: 'Противник уже покинул игру' });
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
    const wasActive = gameState.phase !== 'waiting' && gameState.phase !== 'finished';

    // Remove disconnected player
    gameState.players = gameState.players.filter((p) => p.id !== socket.id);

    if (gameState.players.length === 0) {
      rooms.delete(code);
    } else {
      // Mark game as finished so remaining player gets a clean state
      if (wasActive) {
        gameState.phase = 'finished';
        gameState.winner = gameState.players[0]?.id;
        gameState.currentPlayerIndex = 0;
        io.to(code).emit('game_state', gameState);
        io.to(code).emit('game_over', {
          winner: gameState.winner,
          players: gameState.players,
          opponentLeft: true,
        });
      }
      io.to(code).emit('player_disconnected', { id: socket.id });
    }
    console.log(`[-] Disconnected: ${socket.id} from room ${code}`);
  });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = parseInt(process.env.PORT || '8000', 10);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Yatzy server running on 0.0.0.0:${PORT}`);
});
