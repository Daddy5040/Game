import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import type {
  ChatMessage,
  ClientToServerEvents,
  IdentityPayload,
  InterServerEvents,
  MatchResultRow,
  MiniGameId,
  PlayerSummary,
  RoomSettings,
  RoomSnapshot,
  ServerToClientEvents,
  SocketData,
  TankInput,
  TankState
} from '@stickman/shared';
import { AVATAR_COLORS } from '@stickman/shared';
import { GameDatabase } from './db.js';
import { TankBattleGame } from './tankBattle.js';

type GameServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

interface InternalPlayer extends PlayerSummary {
  socketId: string;
  disconnectTimer?: NodeJS.Timeout;
}

interface InternalRoom {
  code: string;
  hostId: string;
  phase: RoomSnapshot['phase'];
  players: Map<string, InternalPlayer>;
  settings: RoomSettings;
  votesByPlayer: Map<string, MiniGameId>;
  selectedMiniGame: MiniGameId;
  currentRound: number;
  results: MatchResultRow[];
  tournamentComplete: boolean;
  game?: TankBattleGame;
  matchId?: string;
  chat: ChatMessage[];
}

const DEFAULT_SETTINGS: RoomSettings = {
  rounds: 3,
  timeLimitSeconds: 90,
  friendlyFire: true,
  randomEvents: true
};

const EMOJIS = new Set(['😀', '😂', '🔥', '👏', '☕', '💥', '😱', '🏆']);

function createRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

function sanitizeIdentity(payload: IdentityPayload): IdentityPayload | undefined {
  const playerId = String(payload.playerId ?? '').trim();
  const nickname = String(payload.nickname ?? '').trim().slice(0, 18);
  const avatarColor = AVATAR_COLORS.includes(payload.avatarColor as (typeof AVATAR_COLORS)[number])
    ? payload.avatarColor
    : AVATAR_COLORS[0];
  if (!playerId || !nickname) return undefined;
  return { playerId, nickname, avatarColor };
}

function sanitizeSettings(settings: RoomSettings): RoomSettings {
  return {
    rounds: Math.round(Math.max(1, Math.min(10, Number(settings.rounds) || 3))),
    timeLimitSeconds: Math.round(Math.max(30, Math.min(240, Number(settings.timeLimitSeconds) || 90))),
    friendlyFire: Boolean(settings.friendlyFire),
    randomEvents: Boolean(settings.randomEvents)
  };
}

export class RoomManager {
  private readonly rooms = new Map<string, InternalRoom>();
  private readonly io: GameServer;
  private readonly db: GameDatabase;

  constructor(io: GameServer, db: GameDatabase) {
    this.io = io;
    this.db = db;
  }

  createRoom(socketId: string, payload: IdentityPayload): { roomCode: string } | { error: string } {
    const identity = sanitizeIdentity(payload);
    if (!identity) return { error: 'Nickname or player identity is invalid.' };

    let code = createRoomCode();
    while (this.rooms.has(code)) code = createRoomCode();

    const player: InternalPlayer = {
      id: identity.playerId,
      nickname: identity.nickname,
      avatarColor: identity.avatarColor,
      socketId,
      connected: true,
      ready: false,
      isHost: true,
      isSpectator: false,
      score: 0,
      wins: 0,
      gamesPlayed: 0,
      achievements: []
    };

    const room: InternalRoom = {
      code,
      hostId: player.id,
      phase: 'lobby',
      players: new Map([[player.id, player]]),
      settings: { ...DEFAULT_SETTINGS },
      votesByPlayer: new Map([[player.id, 'tank-battle']]),
      selectedMiniGame: 'tank-battle',
      currentRound: 0,
      results: [],
      tournamentComplete: false,
      chat: []
    };

    this.rooms.set(code, room);
    this.db.upsertPlayer(identity);
    this.db.createRoom(code, player.id, room.settings);
    return { roomCode: code };
  }

  joinRoom(socketId: string, payload: IdentityPayload & { roomCode: string }): { roomCode: string; spectator: boolean } | { error: string } {
    const identity = sanitizeIdentity(payload);
    const code = String(payload.roomCode ?? '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!identity) return { error: 'Nickname or player identity is invalid.' };
    if (!room) return { error: 'Room not found. Check the invite code.' };

    const existing = room.players.get(identity.playerId);
    if (existing) {
      if (existing.disconnectTimer) clearTimeout(existing.disconnectTimer);
      existing.socketId = socketId;
      existing.nickname = identity.nickname;
      existing.avatarColor = identity.avatarColor;
      existing.connected = true;
      this.db.upsertPlayer(identity);
      this.emitRoom(room);
      return { roomCode: code, spectator: existing.isSpectator };
    }

    const activeCount = Array.from(room.players.values()).filter((player) => !player.isSpectator).length;
    const spectator = room.phase === 'playing' || activeCount >= 8;
    const player: InternalPlayer = {
      id: identity.playerId,
      nickname: identity.nickname,
      avatarColor: identity.avatarColor,
      socketId,
      connected: true,
      ready: spectator,
      isHost: false,
      isSpectator: spectator,
      score: 0,
      wins: 0,
      gamesPlayed: 0,
      achievements: []
    };
    room.players.set(player.id, player);
    if (!spectator) room.votesByPlayer.set(player.id, 'tank-battle');
    this.db.upsertPlayer(identity);
    this.emitRoom(room);
    return { roomCode: code, spectator };
  }

  bindSocket(socketId: string, playerId: string, roomCode: string): void {
    const room = this.rooms.get(roomCode);
    const player = room?.players.get(playerId);
    if (!room || !player) return;
    player.socketId = socketId;
    player.connected = true;
  }

  disconnect(playerId: string | undefined, roomCode: string | undefined): void {
    if (!playerId || !roomCode) return;
    const room = this.rooms.get(roomCode);
    const player = room?.players.get(playerId);
    if (!room || !player) return;

    player.connected = false;
    player.ready = false;
    room.game?.markDisconnected(playerId);
    this.emitRoom(room);

    player.disconnectTimer = setTimeout(() => {
      room.players.delete(playerId);
      room.votesByPlayer.delete(playerId);
      if (room.hostId === playerId) this.transferHost(room);
      if (room.players.size === 0) {
        room.game?.stop();
        this.rooms.delete(room.code);
        this.db.closeRoom(room.code);
      } else {
        this.recalculateVote(room);
        this.emitRoom(room);
      }
    }, 30_000);
  }

  setReady(playerId: string, roomCode: string, ready: boolean): void {
    const room = this.rooms.get(roomCode);
    const player = room?.players.get(playerId);
    if (!room || !player || player.isSpectator || room.phase === 'playing') return;
    player.ready = Boolean(ready);
    this.emitRoom(room);
  }

  updateSettings(playerId: string, roomCode: string, settings: RoomSettings): void {
    const room = this.rooms.get(roomCode);
    if (!room || room.hostId !== playerId || room.phase === 'playing') return;
    room.settings = sanitizeSettings(settings);
    this.db.updateRoomSettings(room.code, room.settings);
    this.emitRoom(room);
  }

  vote(playerId: string, roomCode: string, miniGame: MiniGameId): void {
    const room = this.rooms.get(roomCode);
    const player = room?.players.get(playerId);
    if (!room || !player || player.isSpectator || room.phase === 'playing') return;
    room.votesByPlayer.set(playerId, miniGame);
    this.recalculateVote(room);
    this.emitRoom(room);
  }

  startGame(playerId: string, roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (!room || room.hostId !== playerId || room.phase === 'playing') return;
    const activePlayers = Array.from(room.players.values()).filter((player) => !player.isSpectator && player.connected);
    if (activePlayers.length < 2) return this.errorTo(playerId, room, 'At least two active players are required.');
    if (!activePlayers.every((player) => player.ready)) return this.errorTo(playerId, room, 'Every active player must be ready.');
    if (room.currentRound >= room.settings.rounds) return this.errorTo(playerId, room, 'The party is complete. Start a new party first.');

    room.phase = 'playing';
    room.currentRound += 1;
    room.results = [];
    room.tournamentComplete = false;
    for (const player of activePlayers) player.ready = false;
    room.matchId = this.db.startMatch(room.code, room.currentRound, activePlayers.map((player) => player.id));

    room.game = new TankBattleGame(activePlayers, room.settings, room.currentRound, {
      onSnapshot: (snapshot) => this.io.to(room.code).emit('tank:snapshot', snapshot),
      onEvent: (event) => this.io.to(room.code).emit('tank:event', event),
      onFinished: (winnerId, tanks, eliminations) => this.finishGame(room, winnerId, tanks, eliminations)
    });
    this.emitRoom(room);
    room.game.start();
  }

  resetParty(playerId: string, roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (!room || room.hostId !== playerId || room.phase === 'playing') return;
    room.currentRound = 0;
    room.phase = 'lobby';
    room.results = [];
    room.tournamentComplete = false;
    for (const player of room.players.values()) {
      player.score = 0;
      player.wins = 0;
      player.ready = player.isSpectator;
    }
    this.emitRoom(room);
  }

  sendChat(playerId: string, roomCode: string, text: string): void {
    const room = this.rooms.get(roomCode);
    const player = room?.players.get(playerId);
    const cleanText = String(text ?? '').trim().replace(/\s+/g, ' ').slice(0, 180);
    if (!room || !player || !cleanText) return;
    const message: ChatMessage = {
      id: randomUUID(),
      playerId,
      nickname: player.nickname,
      text: cleanText,
      sentAt: Date.now()
    };
    room.chat.push(message);
    if (room.chat.length > 50) room.chat.shift();
    this.io.to(room.code).emit('chat:message', message);
  }

  sendEmoji(playerId: string, roomCode: string, emoji: string): void {
    const room = this.rooms.get(roomCode);
    if (!room?.players.has(playerId) || !EMOJIS.has(emoji)) return;
    this.io.to(room.code).emit('emoji:show', { playerId, emoji, sentAt: Date.now() });
  }

  applyTankInput(playerId: string, roomCode: string, input: TankInput): void {
    const room = this.rooms.get(roomCode);
    const player = room?.players.get(playerId);
    if (!room || room.phase !== 'playing' || !player || player.isSpectator) return;
    room.game?.applyInput(playerId, input);
  }

  getRoomSnapshot(roomCode: string): RoomSnapshot | undefined {
    const room = this.rooms.get(roomCode);
    return room ? this.snapshot(room) : undefined;
  }

  private finishGame(room: InternalRoom, winnerId: string | undefined, tanks: TankState[], eliminations: Map<string, number>): void {
    room.game?.stop();
    room.game = undefined;
    room.phase = 'results';

    const ranked = [...tanks].sort((a, b) => {
      if (a.id === winnerId) return -1;
      if (b.id === winnerId) return 1;
      if (a.alive !== b.alive) return Number(b.alive) - Number(a.alive);
      if (a.hp !== b.hp) return b.hp - a.hp;
      return b.eliminations - a.eliminations;
    });

    room.results = ranked.map((tank, index) => {
      const player = room.players.get(tank.id)!;
      const roundScore = tank.id === winnerId ? 100 : Math.max(10, 60 - index * 10) + tank.eliminations * 10;
      player.score += roundScore;
      player.gamesPlayed += 1;
      if (tank.id === winnerId) player.wins += 1;
      return {
        playerId: player.id,
        nickname: player.nickname,
        avatarColor: player.avatarColor,
        placement: index + 1,
        roundScore,
        totalScore: player.score,
        wins: player.wins,
        alive: tank.alive,
        hp: tank.hp
      };
    });

    for (const player of room.players.values()) {
      if (!player.isSpectator && player.connected) player.ready = true;
    }
    room.tournamentComplete = room.currentRound >= room.settings.rounds;
    if (room.matchId) this.db.finishMatch(room.matchId, winnerId, room.results, eliminations);
    this.emitRoom(room);
  }

  private recalculateVote(room: InternalRoom): void {
    const counts = new Map<MiniGameId, number>();
    for (const vote of room.votesByPlayer.values()) counts.set(vote, (counts.get(vote) ?? 0) + 1);
    const ordered: MiniGameId[] = ['tank-battle', 'football', 'racing', 'chicken-hunt', 'survival-arena', 'bomb-tag'];
    room.selectedMiniGame = ordered.reduce((best, game) => (counts.get(game) ?? 0) > (counts.get(best) ?? 0) ? game : best, 'tank-battle');
    // Only Tank Battle is playable in the MVP. Votes for future games are visible but fall back safely.
    if (room.selectedMiniGame !== 'tank-battle') room.selectedMiniGame = 'tank-battle';
  }

  private transferHost(room: InternalRoom): void {
    const nextHost = Array.from(room.players.values()).find((player) => player.connected && !player.isSpectator)
      ?? Array.from(room.players.values()).find((player) => player.connected);
    if (!nextHost) return;
    room.hostId = nextHost.id;
    for (const player of room.players.values()) player.isHost = player.id === nextHost.id;
  }

  private errorTo(playerId: string, room: InternalRoom, message: string): void {
    const player = room.players.get(playerId);
    if (player) this.io.to(player.socketId).emit('server:error', message);
  }

  private emitRoom(room: InternalRoom): void {
    this.io.to(room.code).emit('room:snapshot', this.snapshot(room));
  }

  private snapshot(room: InternalRoom): RoomSnapshot {
    const votes: RoomSnapshot['votes'] = {};
    for (const vote of room.votesByPlayer.values()) votes[vote] = (votes[vote] ?? 0) + 1;
    return {
      code: room.code,
      hostId: room.hostId,
      phase: room.phase,
      settings: room.settings,
      players: Array.from(room.players.values()).map(({ socketId: _socket, disconnectTimer: _timer, ...player }) => player),
      votes,
      selectedMiniGame: room.selectedMiniGame,
      currentRound: room.currentRound,
      results: room.results,
      tournamentComplete: room.tournamentComplete
    };
  }
}
