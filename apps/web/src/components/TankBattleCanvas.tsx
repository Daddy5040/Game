import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TankGameEvent, TankGameSnapshot, TankInput } from '@stickman/shared';
import { socket } from '../socket';

interface Props {
  playerId: string;
  snapshot?: TankGameSnapshot;
  spectator: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
}

const EMOJIS = ['😀', '😂', '🔥', '👏', '☕', '💥', '😱', '🏆'];

export function TankBattleCanvas({ playerId, snapshot, spectator }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>();
  const snapshotRef = useRef(snapshot);
  const keysRef = useRef(new Set<string>());
  const inputRef = useRef<TankInput>({
    sequence: 0, up: false, down: false, left: false, right: false,
    aimX: 600, aimY: 350, shoot: false
  });
  const particlesRef = useRef<Particle[]>([]);
  const shakeRef = useRef(0);
  const [touchAim, setTouchAim] = useState({ x: 600, y: 350 });

  useEffect(() => { snapshotRef.current = snapshot; }, [snapshot]);

  const emitInput = useCallback(() => {
    if (spectator) return;
    inputRef.current.sequence += 1;
    socket.emit('tank:input', { ...inputRef.current });
  }, [spectator]);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      const code = event.code;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) event.preventDefault();
      keysRef.current.add(code);
      if (code === 'Space') inputRef.current.shoot = true;
    };
    const keyUp = (event: KeyboardEvent) => {
      keysRef.current.delete(event.code);
      if (event.code === 'Space') inputRef.current.shoot = false;
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    const timer = window.setInterval(() => {
      const keys = keysRef.current;
      inputRef.current.up = keys.has('KeyW') || keys.has('ArrowUp');
      inputRef.current.down = keys.has('KeyS') || keys.has('ArrowDown');
      inputRef.current.left = keys.has('KeyA') || keys.has('ArrowLeft');
      inputRef.current.right = keys.has('KeyD') || keys.has('ArrowRight');
      emitInput();
    }, 50);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.clearInterval(timer);
    };
  }, [emitInput]);

  useEffect(() => {
    const onEvent = (event: TankGameEvent) => {
      const count = event.type === 'eliminated' ? 26 : event.type === 'hit' ? 12 : 5;
      for (let index = 0; index < count; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 40 + Math.random() * 150;
        particlesRef.current.push({
          x: event.x,
          y: event.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.4 + Math.random() * 0.7,
          size: 2 + Math.random() * 5
        });
      }
      if ((event.type === 'hit' && event.targetId === playerId) || event.type === 'eliminated') shakeRef.current = 10;
    };
    socket.on('tank:event', onEvent);
    return () => { socket.off('tank:event', onEvent); };
  }, [playerId]);

  const pointerToWorld = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const game = snapshotRef.current;
    if (!canvas || !game) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * game.arena.width;
    const y = ((clientY - rect.top) / rect.height) * game.arena.height;
    inputRef.current.aimX = x;
    inputRef.current.aimY = y;
    setTouchAim({ x, y });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    let previous = performance.now();

    const draw = (now: number) => {
      const game = snapshotRef.current;
      const delta = Math.min(0.05, (now - previous) / 1000);
      previous = now;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      if (game) {
        const scaleX = width / game.arena.width;
        const scaleY = height / game.arena.height;
        const shakeX = (Math.random() - 0.5) * shakeRef.current;
        const shakeY = (Math.random() - 0.5) * shakeRef.current;
        shakeRef.current *= 0.88;
        context.save();
        context.translate(shakeX, shakeY);
        context.scale(scaleX, scaleY);

        const gradient = context.createLinearGradient(0, 0, game.arena.width, game.arena.height);
        gradient.addColorStop(0, '#111827');
        gradient.addColorStop(1, '#1e293b');
        context.fillStyle = gradient;
        context.fillRect(0, 0, game.arena.width, game.arena.height);

        context.strokeStyle = 'rgba(255,255,255,0.045)';
        context.lineWidth = 1;
        for (let x = 0; x <= game.arena.width; x += 50) {
          context.beginPath(); context.moveTo(x, 0); context.lineTo(x, game.arena.height); context.stroke();
        }
        for (let y = 0; y <= game.arena.height; y += 50) {
          context.beginPath(); context.moveTo(0, y); context.lineTo(game.arena.width, y); context.stroke();
        }

        for (const obstacle of game.arena.obstacles) {
          context.fillStyle = '#475569';
          context.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
          context.strokeStyle = '#64748b';
          context.lineWidth = 5;
          context.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
        }

        for (const bullet of game.bullets) {
          context.beginPath();
          context.fillStyle = '#fde047';
          context.shadowColor = '#facc15';
          context.shadowBlur = 16;
          context.arc(bullet.x, bullet.y, 6, 0, Math.PI * 2);
          context.fill();
          context.shadowBlur = 0;
        }

        for (const tank of game.tanks) {
          context.save();
          context.globalAlpha = tank.alive ? 1 : 0.24;
          context.translate(tank.x, tank.y);
          context.strokeStyle = tank.color;
          context.lineCap = 'round';
          context.lineWidth = 11;
          context.beginPath();
          context.moveTo(0, 0);
          context.lineTo(Math.cos(tank.turretAngle) * 34, Math.sin(tank.turretAngle) * 34);
          context.stroke();
          context.fillStyle = tank.color;
          context.beginPath(); context.arc(0, 0, 22, 0, Math.PI * 2); context.fill();
          context.strokeStyle = '#0f172a'; context.lineWidth = 5; context.stroke();
          context.fillStyle = '#ffffff';
          context.beginPath(); context.arc(-7, -4, 3, 0, Math.PI * 2); context.fill();
          context.beginPath(); context.arc(7, -4, 3, 0, Math.PI * 2); context.fill();
          context.strokeStyle = '#ffffff'; context.lineWidth = 3;
          context.beginPath(); context.arc(0, 3, 8, 0.15, Math.PI - 0.15); context.stroke();
          context.restore();

          context.fillStyle = 'rgba(15,23,42,0.84)';
          context.fillRect(tank.x - 31, tank.y - 42, 62, 8);
          context.fillStyle = tank.hp > 40 ? '#4ade80' : '#fb7185';
          context.fillRect(tank.x - 30, tank.y - 41, 60 * (tank.hp / 100), 6);
          context.fillStyle = '#ffffff';
          context.font = '700 14px Inter, sans-serif';
          context.textAlign = 'center';
          context.fillText(tank.nickname, tank.x, tank.y + 43);
        }

        particlesRef.current = particlesRef.current.filter((particle) => {
          particle.life -= delta;
          particle.x += particle.vx * delta;
          particle.y += particle.vy * delta;
          particle.vy += 150 * delta;
          if (particle.life <= 0) return false;
          context.globalAlpha = Math.min(1, particle.life * 2);
          context.fillStyle = '#ffffff';
          context.fillRect(particle.x, particle.y, particle.size, particle.size);
          return true;
        });
        context.globalAlpha = 1;
        context.restore();
      }
      frameRef.current = requestAnimationFrame(draw);
    };
    frameRef.current = requestAnimationFrame(draw);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, []);

  const setTouchDirection = (key: 'up' | 'down' | 'left' | 'right', value: boolean) => {
    inputRef.current[key] = value;
    emitInput();
  };

  const playerTank = useMemo(() => snapshot?.tanks.find((tank) => tank.id === playerId), [snapshot, playerId]);

  return (
    <div className="relative overflow-hidden rounded-3xl bg-slate-950 shadow-2xl">
      <div className="absolute left-3 top-3 z-20 flex gap-2 rounded-2xl bg-slate-950/65 px-3 py-2 text-sm font-bold text-white backdrop-blur">
        <span>Round {snapshot?.round ?? 1}</span>
        <span className="text-slate-400">•</span>
        <span>{Math.ceil(snapshot?.timeLeftSeconds ?? 0)}s</span>
        {spectator && <span className="rounded-full bg-amber-400 px-2 text-slate-900">Spectator</span>}
      </div>

      <div className="absolute right-3 top-3 z-20 hidden gap-1 sm:flex">
        {EMOJIS.map((emoji) => (
          <button key={emoji} className="rounded-xl bg-white/90 px-2 py-1 text-lg shadow hover:scale-110" onClick={() => socket.emit('emoji:send', emoji)}>{emoji}</button>
        ))}
      </div>

      <canvas
        ref={canvasRef}
        className="aspect-[12/7] w-full cursor-crosshair touch-none"
        onPointerMove={(event) => pointerToWorld(event.clientX, event.clientY)}
        onPointerDown={(event) => {
          pointerToWorld(event.clientX, event.clientY);
          inputRef.current.shoot = true;
          emitInput();
        }}
        onPointerUp={() => { inputRef.current.shoot = false; emitInput(); }}
        onPointerLeave={() => { inputRef.current.shoot = false; emitInput(); }}
      />

      {!spectator && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex items-end justify-between px-3 md:hidden">
          <div className="pointer-events-auto grid grid-cols-3 gap-1">
            <span />
            <button className="touch-button" onPointerDown={() => setTouchDirection('up', true)} onPointerUp={() => setTouchDirection('up', false)}>↑</button>
            <span />
            <button className="touch-button" onPointerDown={() => setTouchDirection('left', true)} onPointerUp={() => setTouchDirection('left', false)}>←</button>
            <button className="touch-button" onPointerDown={() => setTouchDirection('down', true)} onPointerUp={() => setTouchDirection('down', false)}>↓</button>
            <button className="touch-button" onPointerDown={() => setTouchDirection('right', true)} onPointerUp={() => setTouchDirection('right', false)}>→</button>
          </div>
          <div className="pointer-events-auto flex flex-col items-end gap-2">
            <div className="grid grid-cols-4 gap-1 sm:hidden">
              {EMOJIS.slice(0, 4).map((emoji) => <button key={emoji} className="rounded-lg bg-white/90 px-2 py-1" onClick={() => socket.emit('emoji:send', emoji)}>{emoji}</button>)}
            </div>
            <button
              className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white/40 bg-rose-500 text-sm font-black text-white shadow-xl active:scale-95"
              onPointerDown={() => { inputRef.current.aimX = touchAim.x; inputRef.current.aimY = touchAim.y; inputRef.current.shoot = true; emitInput(); }}
              onPointerUp={() => { inputRef.current.shoot = false; emitInput(); }}
            >FIRE</button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between bg-slate-900 px-4 py-2 text-xs text-slate-300">
        <span className="hidden md:inline">WASD / arrows to move · mouse to aim · click or Space to fire</span>
        <span>{playerTank ? `${playerTank.hp} HP · ${playerTank.eliminations} KO` : 'Watching the arena'}</span>
      </div>
    </div>
  );
}
