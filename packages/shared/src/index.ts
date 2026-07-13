export const AVATAR_COLORS = [
  '#ff5d8f',
  '#7c5cff',
  '#22c55e',
  '#06b6d4',
  '#f59e0b',
  '#ef4444',
  '#84cc16',
  '#ec4899'
] as const;

export type AvatarColor = (typeof AVATAR_COLORS)[number];
export type RoomPhase = 'lobby' | 'countdown' | 'playing' | 'results';
export type MiniGameId =
  | 'tank-battle'
  | 'football'
  | 'racing'
  | 'chicken-hunt'
  | 'survival-arena'
  | 'bomb-tag';

export interface RoomSettings {
  rounds: number;
  timeLimitSeconds: number;
  friendlyFire: boolean;
  randomEvents: boolean;
}

export interface PlayerSummary {
  id: string;
  nickname: string;
  avatarColor: string;
  connected: boolean;
  ready: boolean;
  isHost: boolean;
  isSpectator: boolean;
  score: number;
  wins: number;
  gamesPlayed: number;
  achievements: string[];
}

export interface ChatMessage {
  id: string;
  playerId: string;
  nickname: string;
  text: string;
  sentAt: number;
}

export interface MatchResultRow {
  playerId: string;
  nickname: string;
  avatarColor: string;
  placement: number;
  roundScore: number;
  totalScore: number;
  wins: number;
  alive: boolean;
  hp: number;
}

export interface RoomSnapshot {
  code: string;
  hostId: string;
  phase: RoomPhase;
  settings: RoomSettings;
  players: PlayerSummary[];
  votes: Partial<Record<MiniGameId, number>>;
  selectedMiniGame: MiniGameId;
  currentRound: number;
  results: MatchResultRow[];
  tournamentComplete: boolean;
}

export interface ArenaObstacle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TankState {
  id: string;
  nickname: string;
  color: string;
  x: number;
  y: number;
  turretAngle: number;
  hp: number;
  alive: boolean;
  eliminations: number;
}

export interface BulletState {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface TankGameSnapshot {
  tick: number;
  serverTime: number;
  round: number;
  timeLeftSeconds: number;
  arena: {
    width: number;
    height: number;
    obstacles: ArenaObstacle[];
  };
  tanks: TankState[];
  bullets: BulletState[];
  winnerId?: string;
}

export interface TankInput {
  sequence: number;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  aimX: number;
  aimY: number;
  shoot: boolean;
}

export type TankGameEvent =
  | { type: 'shot'; x: number; y: number; playerId: string }
  | { type: 'hit'; x: number; y: number; playerId: string; targetId: string }
  | { type: 'eliminated'; x: number; y: number; playerId: string; targetId: string }
  | { type: 'victory'; x: number; y: number; playerId: string };

export interface IdentityPayload {
  playerId: string;
  nickname: string;
  avatarColor: string;
}

export interface Ack<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface ClientToServerEvents {
  'room:create': (payload: IdentityPayload, ack: (response: Ack<{ roomCode: string }>) => void) => void;
  'room:join': (payload: IdentityPayload & { roomCode: string }, ack: (response: Ack<{ roomCode: string; spectator: boolean }>) => void) => void;
  'room:ready': (ready: boolean) => void;
  'room:settings': (settings: RoomSettings) => void;
  'room:vote': (miniGame: MiniGameId) => void;
  'room:start': () => void;
  'room:resetParty': () => void;
  'chat:send': (text: string) => void;
  'emoji:send': (emoji: string) => void;
  'tank:input': (input: TankInput) => void;
}

export interface ServerToClientEvents {
  'room:snapshot': (snapshot: RoomSnapshot) => void;
  'chat:message': (message: ChatMessage) => void;
  'emoji:show': (payload: { playerId: string; emoji: string; sentAt: number }) => void;
  'tank:snapshot': (snapshot: TankGameSnapshot) => void;
  'tank:event': (event: TankGameEvent) => void;
  'server:error': (message: string) => void;
}

export interface InterServerEvents {}
export interface SocketData {
  playerId?: string;
  roomCode?: string;
}
