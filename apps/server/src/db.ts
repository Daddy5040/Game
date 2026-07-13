import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { MatchResultRow, RoomSettings } from '@stickman/shared';

const schema = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  avatar_color TEXT NOT NULL,
  games_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  total_score INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rooms (
  code TEXT PRIMARY KEY,
  host_player_id TEXT NOT NULL,
  settings_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT,
  FOREIGN KEY (host_player_id) REFERENCES players(id)
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  mini_game TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT,
  winner_player_id TEXT,
  state_json TEXT,
  FOREIGN KEY (room_code) REFERENCES rooms(code),
  FOREIGN KEY (winner_player_id) REFERENCES players(id)
);

CREATE TABLE IF NOT EXISTS match_players (
  match_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  placement INTEGER,
  score INTEGER NOT NULL DEFAULT 0,
  eliminations INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, player_id),
  FOREIGN KEY (match_id) REFERENCES matches(id),
  FOREIGN KEY (player_id) REFERENCES players(id)
);

CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS player_achievements (
  player_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (player_id, achievement_id),
  FOREIGN KEY (player_id) REFERENCES players(id),
  FOREIGN KEY (achievement_id) REFERENCES achievements(id)
);

INSERT OR IGNORE INTO achievements (id, label, description) VALUES
  ('rage_quit', 'Rage Quit', 'Leave a match while your stickman is still alive.'),
  ('office_champion', 'Office Champion', 'Finish first in a complete office party.'),
  ('coffee_addict', 'Coffee Addict', 'Collect five coffee power-ups.'),
  ('professional_loser', 'Professional Loser', 'Finish last in three rounds in a row.');
`;

export class GameDatabase {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(schema);
  }

  upsertPlayer(player: { playerId: string; nickname: string; avatarColor: string }): void {
    this.db.prepare(`
      INSERT INTO players (id, nickname, avatar_color)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        nickname = excluded.nickname,
        avatar_color = excluded.avatar_color,
        last_seen_at = CURRENT_TIMESTAMP
    `).run(player.playerId, player.nickname, player.avatarColor);
  }

  createRoom(code: string, hostPlayerId: string, settings: RoomSettings): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO rooms (code, host_player_id, settings_json, created_at, closed_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, NULL)
    `).run(code, hostPlayerId, JSON.stringify(settings));
  }

  updateRoomSettings(code: string, settings: RoomSettings): void {
    this.db.prepare('UPDATE rooms SET settings_json = ? WHERE code = ?').run(JSON.stringify(settings), code);
  }

  closeRoom(code: string): void {
    this.db.prepare('UPDATE rooms SET closed_at = CURRENT_TIMESTAMP WHERE code = ?').run(code);
  }

  startMatch(roomCode: string, roundNumber: number, playerIds: string[]): string {
    const matchId = randomUUID();
    this.transaction(() => {
      this.db.prepare(`
        INSERT INTO matches (id, room_code, mini_game, round_number)
        VALUES (?, ?, 'tank-battle', ?)
      `).run(matchId, roomCode, roundNumber);
      const insertPlayer = this.db.prepare('INSERT INTO match_players (match_id, player_id) VALUES (?, ?)');
      for (const playerId of playerIds) insertPlayer.run(matchId, playerId);
    });
    return matchId;
  }

  finishMatch(matchId: string, winnerId: string | undefined, rows: MatchResultRow[], eliminations: Map<string, number>): void {
    this.transaction(() => {
      this.db.prepare(`
        UPDATE matches
        SET ended_at = CURRENT_TIMESTAMP, winner_player_id = ?, state_json = ?
        WHERE id = ?
      `).run(winnerId ?? null, JSON.stringify(rows), matchId);

      const updateMatchPlayer = this.db.prepare(`
        UPDATE match_players
        SET placement = ?, score = ?, eliminations = ?
        WHERE match_id = ? AND player_id = ?
      `);
      const updatePlayer = this.db.prepare(`
        UPDATE players
        SET games_played = games_played + 1,
            wins = wins + ?,
            total_score = total_score + ?,
            last_seen_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      for (const row of rows) {
        updateMatchPlayer.run(row.placement, row.roundScore, eliminations.get(row.playerId) ?? 0, matchId, row.playerId);
        updatePlayer.run(row.playerId === winnerId ? 1 : 0, row.roundScore, row.playerId);
      }
    });
  }

  private transaction(action: () => void): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      action();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
