# Database schema

The executable schema is in `apps/server/src/db.ts`.

```sql
CREATE TABLE players (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  avatar_color TEXT NOT NULL,
  games_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  total_score INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE rooms (
  code TEXT PRIMARY KEY,
  host_player_id TEXT NOT NULL,
  settings_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT,
  FOREIGN KEY (host_player_id) REFERENCES players(id)
);

CREATE TABLE matches (
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

CREATE TABLE match_players (
  match_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  placement INTEGER,
  score INTEGER NOT NULL DEFAULT 0,
  eliminations INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, player_id),
  FOREIGN KEY (match_id) REFERENCES matches(id),
  FOREIGN KEY (player_id) REFERENCES players(id)
);

CREATE TABLE achievements (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE player_achievements (
  player_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (player_id, achievement_id),
  FOREIGN KEY (player_id) REFERENCES players(id),
  FOREIGN KEY (achievement_id) REFERENCES achievements(id)
);
```

Achievement rules planned for the party engine:

- `rage_quit`: disconnect while alive during a match.
- `office_champion`: finish first in a completed party.
- `coffee_addict`: collect five coffee power-ups across matches.
- `professional_loser`: finish last in three consecutive rounds.
