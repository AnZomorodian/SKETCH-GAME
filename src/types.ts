export interface Player {
  id: string;
  name: string;
  points: number;
}

export interface Guess {
  playerId: string;
  playerName?: string;
  text: string;
  isCorrect: boolean;
}

export interface GameSettings {
  roundTime: number;
  maxPlayers: number;
  language: 'en' | 'fa';
  guessingTimeAfterFinish: number;
  winningPoints: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface GameState {
  id: string;
  hostId: string;
  players: Player[];
  status: 'lobby' | 'playing' | 'round_end' | 'game_over';
  phase?: 'drawing' | 'guessing';
  currentDrawerId: string | null;
  currentWord: string | null;
  roundTimeLeft: number;
  isPaused?: boolean;
  guesses: Guess[];
  drawingData: any[];
  settings: GameSettings;
}
