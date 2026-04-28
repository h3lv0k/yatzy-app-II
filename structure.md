# Project Structure: Yatzy Telegram Mini App

This project is a multiplayer Yatzy game designed as a Telegram Mini App. It features both real-time multiplayer (via WebSockets) and a local "vs Bot" mode.

## Core Directory Structure

```text
yatzy-app-II/
├── client/              # React + Vite Frontend (TypeScript)
│   ├── src/
│   │   ├── assets/      # Game icons (dice, categories)
│   │   ├── bot/         # Bot AI logic and strategy
│   │   ├── components/  # React UI components (Lobby, GameBoard, etc.)
│   │   ├── hooks/       # Custom hooks (Socket.io, Telegram SDK, Local Game)
│   │   ├── services/    # External services (Ads integration)
│   │   ├── types/       # Shared game TypeScript interfaces
│   │   ├── utils/       # Scoring and game utility functions
│   │   ├── App.tsx      # Main application routing and state management
│   │   └── main.tsx     # Entry point
│   ├── index.html       # Telegram Web App SDK initialization
│   └── vite.config.ts   # Vite configuration
│
└── server/              # Node.js + Express Backend (TypeScript)
    ├── src/
    │   ├── game/        # Server-side game logic (scoring, dice rolls)
    │   ├── index.ts     # Socket.io events, room management, server entry
    │   └── types.ts     # Server-side type definitions
    ├── Dockerfile       # Containerization for deployment
    └── Procfile         # Deployment config (e.g., for Heroku/Railway)
```

## Module Breakdown

### Client-Side (`/client`)
- **`src/bot/botStrategy.ts`**: Implements the decision-making logic for the AI player (which dice to keep, which category to score).
- **`src/hooks/useSocket.ts`**: Manages the connection to the backend server and handles all multiplayer events.
- **`src/hooks/useLocalGame.ts`**: Manages the state machine for the "vs Bot" mode, allowing offline play.
- **`src/hooks/useTelegram.ts`**: Integrates with the Telegram Web App SDK for user data and haptic feedback.
- **`src/services/adService.ts`**: Handles rewarded video ads (Google IMA and Yandex YAN) to grant bonus rolls.
- **`src/utils/yatzy.ts`**: Pure functions for calculating scores based on dice combinations.

### Server-Side (`/server`)
- **`src/index.ts`**: The main Socket.io hub. Manages room creation, player matchmaking, session recovery (handling temporary disconnects), and game flow synchronization.
- **`src/game/yatzyLogic.ts`**: Authoritative game rules and scoring to prevent client-side cheating in multiplayer mode.

## Key Features
- **Multiplayer**: Real-time play using `socket.io`.
- **Session Recovery**: Players can reconnect to an ongoing game within 3 minutes if their connection drops.
- **Bot Mode**: Playable locally without a network connection.
- **Telegram Integration**: Automatic name/avatar retrieval and native haptics.
- **Ads Integration**: Rewarded ads for game bonuses, with auto-detection of the best provider based on the user's locale.
