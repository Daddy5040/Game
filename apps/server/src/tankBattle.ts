import { randomUUID } from 'node:crypto';
import type {
  ArenaObstacle,
  PlayerSummary,
  RoomSettings,
  TankGameEvent,
  TankGameSnapshot,
  TankInput,
  TankState
} from '@stickman/shared';

const ARENA_WIDTH = 1200;
const ARENA_HEIGHT = 700;
const TANK_RADIUS = 22;
const TANK_SPEED = 220;
const BULLET_SPEED = 560;
const BULLET_RADIUS = 5;
const BULLET_TTL = 2.3;
const FIRE_COOLDOWN_MS = 420;
const DAMAGE = 34;

const obstacles: ArenaObstacle[] = [
  { x: 260, y: 150, width: 170, height: 46 },
  { x: 770, y: 150, width: 170, height: 46 },
  { x: 515, y: 290, width: 170, height: 120 },
  { x: 260, y: 505, width: 170, height: 46 },
  { x: 770, y: 505, width: 170, height: 46 }
];

interface InternalTank extends TankState {
  input: TankInput;
  lastInputSequence: number;
  lastShotAt: number;
}

interface InternalBullet {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl: number;
}

interface TankBattleCallbacks {
  onSnapshot: (snapshot: TankGameSnapshot) => void;
  onEvent: (event: TankGameEvent) => void;
  onFinished: (winnerId: string | undefined, tanks: TankState[], eliminations: Map<string, number>) => void;
}

const emptyInput = (): TankInput => ({
  sequence: 0,
  up: false,
  down: false,
  left: false,
  right: false,
  aimX: ARENA_WIDTH / 2,
  aimY: ARENA_HEIGHT / 2,
  shoot: false
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function circleRectCollision(x: number, y: number, radius: number, rect: ArenaObstacle): boolean {
  const nearestX = clamp(x, rect.x, rect.x + rect.width);
  const nearestY = clamp(y, rect.y, rect.y + rect.height);
  const dx = x - nearestX;
  const dy = y - nearestY;
  return dx * dx + dy * dy < radius * radius;
}

function validTankPosition(x: number, y: number): boolean {
  if (x < TANK_RADIUS || y < TANK_RADIUS || x > ARENA_WIDTH - TANK_RADIUS || y > ARENA_HEIGHT - TANK_RADIUS) return false;
  return !obstacles.some((obstacle) => circleRectCollision(x, y, TANK_RADIUS, obstacle));
}

export class TankBattleGame {
  private readonly tanks = new Map<string, InternalTank>();
  private readonly bullets = new Map<string, InternalBullet>();
  private readonly settings: RoomSettings;
  private readonly round: number;
  private readonly callbacks: TankBattleCallbacks;
  private tickTimer?: NodeJS.Timeout;
  private snapshotTimer?: NodeJS.Timeout;
  private finishTimer?: NodeJS.Timeout;
  private tick = 0;
  private startedAt = Date.now();
  private finished = false;

  constructor(players: PlayerSummary[], settings: RoomSettings, round: number, callbacks: TankBattleCallbacks) {
    this.settings = settings;
    this.round = round;
    this.callbacks = callbacks;

    const spawnPoints: Array<[number, number]> = [
      [95, 95], [1105, 605], [1105, 95], [95, 605],
      [600, 85], [600, 615], [110, 350], [1090, 350]
    ];

    players.forEach((player, index) => {
      const spawn: [number, number] = spawnPoints[index] ?? [100 + index * 60, 100];
      this.tanks.set(player.id, {
        id: player.id,
        nickname: player.nickname,
        color: player.avatarColor,
        x: spawn[0],
        y: spawn[1],
        turretAngle: 0,
        hp: 100,
        alive: true,
        eliminations: 0,
        input: emptyInput(),
        lastInputSequence: -1,
        lastShotAt: 0
      });
    });
  }

  start(): void {
    this.startedAt = Date.now();
    this.tickTimer = setInterval(() => this.update(1 / 30), 1000 / 30);
    this.snapshotTimer = setInterval(() => this.callbacks.onSnapshot(this.snapshot()), 1000 / 20);
    this.callbacks.onSnapshot(this.snapshot());
  }

  stop(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.snapshotTimer) clearInterval(this.snapshotTimer);
    if (this.finishTimer) clearTimeout(this.finishTimer);
  }

  applyInput(playerId: string, input: TankInput): void {
    const tank = this.tanks.get(playerId);
    if (!tank || !tank.alive || input.sequence <= tank.lastInputSequence) return;
    tank.lastInputSequence = input.sequence;
    tank.input = {
      sequence: input.sequence,
      up: Boolean(input.up),
      down: Boolean(input.down),
      left: Boolean(input.left),
      right: Boolean(input.right),
      aimX: clamp(Number(input.aimX) || ARENA_WIDTH / 2, 0, ARENA_WIDTH),
      aimY: clamp(Number(input.aimY) || ARENA_HEIGHT / 2, 0, ARENA_HEIGHT),
      shoot: Boolean(input.shoot)
    };
  }

  markDisconnected(playerId: string): void {
    const tank = this.tanks.get(playerId);
    if (!tank || !tank.alive || this.finished) return;
    tank.alive = false;
    tank.hp = 0;
    this.callbacks.onEvent({ type: 'eliminated', x: tank.x, y: tank.y, playerId, targetId: playerId });
    this.checkFinished();
  }

  snapshot(): TankGameSnapshot {
    const elapsed = (Date.now() - this.startedAt) / 1000;
    return {
      tick: this.tick,
      serverTime: Date.now(),
      round: this.round,
      timeLeftSeconds: Math.max(0, this.settings.timeLimitSeconds - elapsed),
      arena: { width: ARENA_WIDTH, height: ARENA_HEIGHT, obstacles },
      tanks: Array.from(this.tanks.values()).map(({ input: _input, lastInputSequence: _seq, lastShotAt: _shot, ...tank }) => tank),
      bullets: Array.from(this.bullets.values()).map(({ ttl: _ttl, ...bullet }) => bullet)
    };
  }

  private update(deltaSeconds: number): void {
    if (this.finished) return;
    this.tick += 1;

    for (const tank of this.tanks.values()) {
      if (!tank.alive) continue;
      this.updateTank(tank, deltaSeconds);
      this.tryShoot(tank);
    }

    this.updateBullets(deltaSeconds);

    const elapsedSeconds = (Date.now() - this.startedAt) / 1000;
    if (elapsedSeconds >= this.settings.timeLimitSeconds) {
      this.finishByTimeout();
      return;
    }

    this.checkFinished();
  }

  private updateTank(tank: InternalTank, deltaSeconds: number): void {
    let dx = Number(tank.input.right) - Number(tank.input.left);
    let dy = Number(tank.input.down) - Number(tank.input.up);
    const length = Math.hypot(dx, dy);
    if (length > 0) {
      dx /= length;
      dy /= length;
    }

    const nextX = tank.x + dx * TANK_SPEED * deltaSeconds;
    const nextY = tank.y + dy * TANK_SPEED * deltaSeconds;
    if (validTankPosition(nextX, tank.y)) tank.x = nextX;
    if (validTankPosition(tank.x, nextY)) tank.y = nextY;
    tank.turretAngle = Math.atan2(tank.input.aimY - tank.y, tank.input.aimX - tank.x);
  }

  private tryShoot(tank: InternalTank): void {
    if (!tank.input.shoot) return;
    const now = Date.now();
    if (now - tank.lastShotAt < FIRE_COOLDOWN_MS) return;
    tank.lastShotAt = now;

    const barrel = TANK_RADIUS + 12;
    const x = tank.x + Math.cos(tank.turretAngle) * barrel;
    const y = tank.y + Math.sin(tank.turretAngle) * barrel;
    const bullet: InternalBullet = {
      id: randomUUID(),
      ownerId: tank.id,
      x,
      y,
      vx: Math.cos(tank.turretAngle) * BULLET_SPEED,
      vy: Math.sin(tank.turretAngle) * BULLET_SPEED,
      ttl: BULLET_TTL
    };
    this.bullets.set(bullet.id, bullet);
    this.callbacks.onEvent({ type: 'shot', x, y, playerId: tank.id });
  }

  private updateBullets(deltaSeconds: number): void {
    for (const bullet of this.bullets.values()) {
      bullet.x += bullet.vx * deltaSeconds;
      bullet.y += bullet.vy * deltaSeconds;
      bullet.ttl -= deltaSeconds;

      const outOfBounds = bullet.x < 0 || bullet.y < 0 || bullet.x > ARENA_WIDTH || bullet.y > ARENA_HEIGHT;
      const hitObstacle = obstacles.some((obstacle) => circleRectCollision(bullet.x, bullet.y, BULLET_RADIUS, obstacle));
      if (outOfBounds || hitObstacle || bullet.ttl <= 0) {
        this.bullets.delete(bullet.id);
        continue;
      }

      for (const target of this.tanks.values()) {
        if (!target.alive || target.id === bullet.ownerId) continue;
        const dx = target.x - bullet.x;
        const dy = target.y - bullet.y;
        if (dx * dx + dy * dy > (TANK_RADIUS + BULLET_RADIUS) ** 2) continue;

        this.bullets.delete(bullet.id);
        target.hp = Math.max(0, target.hp - DAMAGE);
        this.callbacks.onEvent({ type: 'hit', x: bullet.x, y: bullet.y, playerId: bullet.ownerId, targetId: target.id });

        if (target.hp <= 0) {
          target.alive = false;
          const owner = this.tanks.get(bullet.ownerId);
          if (owner) owner.eliminations += 1;
          this.callbacks.onEvent({ type: 'eliminated', x: target.x, y: target.y, playerId: bullet.ownerId, targetId: target.id });
        }
        break;
      }
    }
  }

  private checkFinished(): void {
    const alive = Array.from(this.tanks.values()).filter((tank) => tank.alive);
    if (alive.length <= 1) this.finish(alive[0]?.id);
  }

  private finishByTimeout(): void {
    const ranked = Array.from(this.tanks.values()).sort((a, b) => {
      if (a.alive !== b.alive) return Number(b.alive) - Number(a.alive);
      if (a.hp !== b.hp) return b.hp - a.hp;
      return b.eliminations - a.eliminations;
    });
    this.finish(ranked[0]?.id);
  }

  private finish(winnerId: string | undefined): void {
    if (this.finished) return;
    this.finished = true;
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.snapshotTimer) clearInterval(this.snapshotTimer);

    const winner = winnerId ? this.tanks.get(winnerId) : undefined;
    if (winner) this.callbacks.onEvent({ type: 'victory', x: winner.x, y: winner.y, playerId: winner.id });
    this.callbacks.onSnapshot({ ...this.snapshot(), winnerId });

    this.finishTimer = setTimeout(() => {
      const publicTanks = Array.from(this.tanks.values()).map(({ input: _i, lastInputSequence: _s, lastShotAt: _l, ...tank }) => tank);
      const eliminations = new Map(publicTanks.map((tank) => [tank.id, tank.eliminations]));
      this.callbacks.onFinished(winnerId, publicTanks, eliminations);
    }, 1400);
  }
}
