# 🤖 AI Agent Project Index & Directory Map: Yatzy TMA

This document is optimized for parsing by LLMs and Agentic AI coders. It outlines the codebase layout, file references, data schemas, state flow, and core game logic.

---

## 📂 1. Directory Structure & Key Entry Points

*   **Workspace Root**: `C:/Projects/yatzy-app-IIM-2/yatzy-app-II`
*   **Vite React Client**: [client/](file:///C:/Projects/yatzy-app-IIM-2/yatzy-app-II/client)
    *   *Entry point*: [main.tsx](file:///C:/Projects/yatzy-app-IIM-2/yatzy-app-II/client/src/main.tsx)
    *   *Router/State Coordinator*: [App.tsx](file:///C:/Projects/yatzy-app-IIM-2/yatzy-app-II/client/src/App.tsx)
*   **Express + Socket.io Server**: [server/](file:///C:/Projects/yatzy-app-IIM-2/yatzy-app-II/server)
    *   *Entry point*: [index.ts](file:///C:/Projects/yatzy-app-IIM-2/yatzy-app-II/server/src/index.ts)
    *   *Auth/Scoring Logic*: [yatzyLogic.ts](file:///C:/Projects/yatzy-app-IIM-2/yatzy-app-II/server/src/game/yatzyLogic.ts)

---

## 🗂️ 2. Core Modules Reference

### 🎨 User Interface (UI Components)
Located in `C:/Projects/yatzy-app-IIM-2/yatzy-app-II/client/src/components/`

*   **Lobby**: [Lobby.tsx](file:///C:/Projects/yatzy-app-IIM-2/yatzy-app-II/client/src/components/Lobby.tsx) — Main landing page. Contains nickname and emoji-avatar selection. Resolves room code shortcuts:
    *   `DEBUG`: Triggers local player-vs-bot game in developer debug mode.
    *   `SONYA`: Opens the interactive birthday surprise Easter egg (Deactivated for now).
*   **GameBoard**: [GameBoard.tsx](file:///C:/Projects/yatzy-app-IIM-2/yatzy-app-II/client/src/components/GameBoard.tsx) — Renders the game board, scoring cells, interactive dice panel, and rolls/keeps state. Imports:
    *   [DebugPanel.tsx](file:///C:/Projects/yatzy-app-IIM-2/yatzy-app-II/client/src/components/DebugPanel.tsx) — Dev tools (dice override, undo, auto-score filling).
    *   [YatzyOverlay.tsx](file:///C:/Projects/yatzy-app-IIM-2/yatzy-app-II/client/src/components/YatzyOverlay.tsx) — Celebration banner and confetti activation.
    *   [Die.tsx](file:///C:/Projects/yatzy-app-IIM-2/yatzy-app-II/client/src/components/Die.tsx) — 3D-styled dice visual node.
*   **SurpriseRoom**: [SurpriseRoom.tsx](file:///C:/Projects/yatzy-app-IIM-2/yatzy-app-II/client/src/components/SurpriseRoom.tsx) — Interactive SVG birthday cake with 4 extinguishable candles. Includes `react-confetti` integration and native haptic feedback triggers.

### ⚓ React Hooks & State Management
Located in `C:/Projects/yatzy-app-IIM-2/yatzy-app-II/client/src/hooks/`

*   [useLocalGame.ts](file:///C:/Projects/yatzy-app-IIM-2/yatzy-app-II/client/src/hooks/useLocalGame.ts) — Implements local vs-Bot game. Stores game states in a history array for the `Undo` command, automates bot decisions, and runs local score updates.
*   [useSocket.ts](file:///C:/Projects/yatzy-app-IIM-2/yatzy-app-II/client/src/hooks/useSocket.ts) — Connects client to server WebSocket. Dispatches actions and synchronizes client state with the multiplayer server.
*   [useTelegram.ts](file:///C:/Projects/yatzy-app-IIM-2/yatzy-app-II/client/src/hooks/useTelegram.ts) — Wraps Telegram WebApp SDK parameters (`initData`, `hapticFeedback`).

---

## 💾 3. Game State & Typings

TypeScript types are synchronized but declared in both spaces:
- Client-side: [types/game.ts](file:///C:/Projects/yatzy-app-IIM-2/yatzy-app-II/client/src/types/game.ts)
- Server-side: [types.ts](file:///C:/Projects/yatzy-app-IIM-2/yatzy-app-II/server/src/types.ts)

### Data Models

#### 1. Player
```typescript
interface Player {
  id: string;             // Socket ID or 'local-player'/'bot'
  name: string;           // Display name
  avatar: string;         // Emoji avatar
  scores: ScoreSheet;     // Key-value of category -> score
  totalScore: number;     // Sum of all points + bonus
  upperBonus: boolean;    // true if upper section score >= 63
  lscStreak: number;      // Current LSC consecutive turns count
  lscMultiplier: number;  // Current LSC score multiplier (1.0x to 2.0x)
  connected?: boolean;    // Multiplayer connectivity status
  sessionId?: string;    // Persistent UUID for session recovery
}
```

#### 2. GameState
```typescript
interface GameState {
  roomId: string;
  players: Player[];
  currentPlayerIndex: number;
  dice: number[];          // Array of 5 integers (1-6)
  heldDice: boolean[];     // Array of 5 booleans representing keeps
  rollsLeft: number;       // 3, 2, 1, or 0
  phase: 'waiting' | 'rolling' | 'scoring' | 'finished';
  turn: number;            // Current turn count (max 26 for 2 players)
  maxTurns: number;        // 13
  winner?: string;         // Winning player ID
}
```

#### 3. ScoreSheet
```typescript
type ScoreCategory =
  | 'ones' | 'twos' | 'threes' | 'fours' | 'fives' | 'sixes' // Upper Section
  | 'threeOfAKind' | 'fourOfAKind' | 'fullHouse' 
  | 'smallStraight' | 'largeStraight' | 'yatzy' | 'chance'; // Lower Section

type ScoreSheet = Record<ScoreCategory, number | undefined>;
```

---

## 🧮 4. Custom Scoring Mechanics

Verify client-side implementation in [useLocalGame.ts (applyScore)](file:///C:/Projects/yatzy-app-IIM-2/yatzy-app-II/client/src/hooks/useLocalGame.ts) and server-side in [index.ts (score_category)](file:///C:/Projects/yatzy-app-IIM-2/yatzy-app-II/server/src/index.ts).

### Lucky Streak Multiplier (LSC)
*   **Target**: Lower Section categories (excluding `chance`).
*   **Formula**:
    $$\text{Multiplier} = \min(2.0, 1.0 + (\text{Streak} \times 0.2))$$
*   **Rule Matrix**:
    *   *Lower section score > 0*: Increments streak by 1, updates multiplier for next turn.
    *   *Lower section score = 0 (Scratch)*: Resets streak to 0, multiplier to `1.0x`.
    *   *Upper section selection*: Resets streak to 0, multiplier to `1.0x`.
    *   *Chance selection*: Resets streak to 0, multiplier to `1.0x`.

### Yatzy Bonus (Double Yatzy Rule)
*   **Conditions**:
    1.  Current roll is Yatzy (5 identical dice).
    2.  The player's score for the `yatzy` category is already recorded as `50` (meaning they have already obtained a primary Yatzy).
*   **Behavior**:
    *   If the player scores in an eligible category (matching Upper Section number category, or any sum-based Lower Section category like `threeOfAKind`, `fourOfAKind`, or `chance`), the score is forced to a flat **100 points**.
    *   *LSC application*: The 100-point bonus does **not** get multiplied by LSC.
    *   *Streak effect*: If written into a Lower Section category, it counts as a valid score, increments the LSC streak, and advances the multiplier.

---

## 🔌 5. Socket.io Event API
Communication contract between client ([useSocket.ts](file:///C:/Projects/yatzy-app-IIM-2/yatzy-app-II/client/src/hooks/useSocket.ts)) and server ([index.ts](file:///C:/Projects/yatzy-app-IIM-2/yatzy-app-II/server/src/index.ts)).

### Client to Server Events
*   `create_room` (`{ name, avatar }`) -> Initializes a new room.
*   `join_room` (`{ code, name, avatar }`) -> Joins a room by its 5-character alphanumeric uppercase code.
*   `roll_dice` () -> Roll active dice. Subject to a server-side 300ms rate-limiter.
*   `toggle_hold` (`{ index }`) -> Toggles hold flag for index (0 to 4). Invalid on roll 3 (must roll first) or roll 0 (must score).
*   `score_category` (`{ category }`) -> Writes points into selected category.
*   `surrender` () -> Forfeit game.
*   `rematch` () -> Triggers a rematch. Resets scores and switches who starts first.
*   `leave_room` () -> Safely leave room.
*   `reconnect_session` (`{ code, sessionId }`) -> Handshake to recover session.
*   `send_reaction` (`{ emoji }`) -> Sends an emoji reaction. Whitelist: `['👍', '🔥', '🎉', '💩', '😎', '😢', '😘', '🖤', '💅', '🥂', '😈']`. Subject to rate-limit of 2.5s.

### Server to Client Events
*   `room_created` (`{ code, roomId, playerId, sessionId }`)
*   `joined_room` (`{ code, roomId, playerId, sessionId }`)
*   `game_started` (`{ roomId }`)
*   `game_state` (`GameState`)
*   `game_over` (`{ winner, players, surrendered?, opponentLeft? }`)
*   `player_disconnected` (`{ id }`) -> Informs active player of connection loss. Starts 3-minute grace period before forfeit.
*   `receive_reaction` (`{ senderId, emoji }`) -> Informs client of opponent's reaction.
