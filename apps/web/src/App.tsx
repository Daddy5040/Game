import { useEffect, useMemo, useState } from 'react';
import { Copy, Gamepad2, LogIn, MessageCircle, Settings2, Shield, Sparkles, Trophy, Users } from 'lucide-react';
import {
  AVATAR_COLORS,
  type ChatMessage,
  type IdentityPayload,
  type MiniGameId,
  type RoomSettings,
  type RoomSnapshot,
  type TankGameSnapshot
} from '@stickman/shared';
import { socket } from './socket';
import { TankBattleCanvas } from './components/TankBattleCanvas';

const GAME_CARDS: Array<{ id: MiniGameId; name: string; icon: string; playable: boolean }> = [
  { id: 'tank-battle', name: 'Tank Battle', icon: '💥', playable: true },
  { id: 'football', name: 'Football', icon: '⚽', playable: false },
  { id: 'racing', name: 'Racing', icon: '🏎️', playable: false },
  { id: 'chicken-hunt', name: 'Chicken Hunt', icon: '🐔', playable: false },
  { id: 'survival-arena', name: 'Survival', icon: '🌀', playable: false },
  { id: 'bomb-tag', name: 'Bomb Tag', icon: '💣', playable: false }
];

function getOrCreatePlayerId(): string {
  const stored = localStorage.getItem('stickman-player-id');
  if (stored) return stored;
  const id = crypto.randomUUID();
  localStorage.setItem('stickman-player-id', id);
  return id;
}

function App() {
  const [identity, setIdentity] = useState<IdentityPayload>(() => ({
    playerId: getOrCreatePlayerId(),
    nickname: localStorage.getItem('stickman-nickname') || '',
    avatarColor: localStorage.getItem('stickman-color') || AVATAR_COLORS[1]
  }));
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [room, setRoom] = useState<RoomSnapshot>();
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState('');
  const [game, setGame] = useState<TankGameSnapshot>();
  const [error, setError] = useState('');
  const [emojis, setEmojis] = useState<Array<{ id: string; playerId: string; emoji: string }>>([]);

  useEffect(() => {
    const onRoom = (snapshot: RoomSnapshot) => setRoom(snapshot);
    const onChat = (message: ChatMessage) => setChat((current) => [...current.slice(-49), message]);
    const onGame = (snapshot: TankGameSnapshot) => setGame(snapshot);
    const onError = (message: string) => { setError(message); window.setTimeout(() => setError(''), 4000); };
    const onEmoji = ({ playerId, emoji, sentAt }: { playerId: string; emoji: string; sentAt: number }) => {
      const id = `${playerId}-${sentAt}`;
      setEmojis((current) => [...current, { id, playerId, emoji }]);
      window.setTimeout(() => setEmojis((current) => current.filter((item) => item.id !== id)), 1600);
    };
    socket.on('room:snapshot', onRoom);
    socket.on('chat:message', onChat);
    socket.on('tank:snapshot', onGame);
    socket.on('server:error', onError);
    socket.on('emoji:show', onEmoji);
    return () => {
      socket.off('room:snapshot', onRoom);
      socket.off('chat:message', onChat);
      socket.off('tank:snapshot', onGame);
      socket.off('server:error', onError);
      socket.off('emoji:show', onEmoji);
    };
  }, []);

  const persistIdentity = () => {
    const nickname = identity.nickname.trim().slice(0, 18);
    if (!nickname) { setError('Choose a nickname first.'); return false; }
    localStorage.setItem('stickman-nickname', nickname);
    localStorage.setItem('stickman-color', identity.avatarColor);
    setIdentity((current) => ({ ...current, nickname }));
    return true;
  };

  const createRoom = () => {
    if (!persistIdentity()) return;
    socket.emit('room:create', { ...identity, nickname: identity.nickname.trim() }, (response) => {
      if (!response.ok) return setError(response.error || 'Unable to create the room.');
      setRoomCodeInput(response.data!.roomCode);
    });
  };

  const joinRoom = () => {
    if (!persistIdentity()) return;
    const roomCode = roomCodeInput.trim().toUpperCase();
    if (!roomCode) return setError('Enter an invite code.');
    socket.emit('room:join', { ...identity, nickname: identity.nickname.trim(), roomCode }, (response) => {
      if (!response.ok) setError(response.error || 'Unable to join the room.');
    });
  };

  const me = room?.players.find((player) => player.id === identity.playerId);
  const activePlayers = room?.players.filter((player) => !player.isSpectator) ?? [];
  const canStart = Boolean(room && me?.isHost && activePlayers.length >= 2 && activePlayers.every((player) => player.ready));

  if (!room) {
    return (
      <main className="party-bg min-h-screen px-4 py-8 sm:px-8">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center">
          <div className="grid w-full gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="flex flex-col justify-center">
              <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-violet-200 bg-white/70 px-4 py-2 text-sm font-bold text-violet-700">
                <Sparkles size={16} /> Browser party game for office teams
              </div>
              <h1 className="max-w-3xl text-5xl font-black leading-[0.95] tracking-tight text-slate-900 sm:text-7xl">
                Stickman <span className="text-violet-600">Office</span> Party
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
                Create a private room, invite 2–8 colleagues, and settle the next coffee break with fast real-time mini-games.
              </p>
              <div className="mt-8 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['💥', 'Tank Battle'], ['⚽', 'Football'], ['🏎️', 'Racing'], ['💣', 'Bomb Tag']
                ].map(([icon, name]) => (
                  <div key={name} className="rounded-2xl border border-white bg-white/60 p-3 font-bold text-slate-700 shadow-sm">
                    <span className="mr-2">{icon}</span>{name}
                  </div>
                ))}
              </div>
            </section>

            <section className="card p-6 sm:p-8">
              <div className="mb-6 flex items-center gap-3">
                <div className="rounded-2xl bg-violet-100 p-3 text-violet-700"><Gamepad2 /></div>
                <div><h2 className="text-2xl font-black">Join the party</h2><p className="text-sm text-slate-500">No account or installation required.</p></div>
              </div>

              <label className="mb-2 block text-sm font-bold text-slate-700">Nickname</label>
              <input className="input" maxLength={18} placeholder="e.g. CoffeeBoss" value={identity.nickname} onChange={(event) => setIdentity({ ...identity, nickname: event.target.value })} />

              <label className="mb-3 mt-5 block text-sm font-bold text-slate-700">Avatar color</label>
              <div className="flex flex-wrap gap-3">
                {AVATAR_COLORS.map((color) => (
                  <button
                    key={color}
                    aria-label={`Choose ${color}`}
                    className={`h-10 w-10 rounded-full border-4 transition hover:scale-110 ${identity.avatarColor === color ? 'border-slate-900' : 'border-white'}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setIdentity({ ...identity, avatarColor: color })}
                  />
                ))}
              </div>

              <button className="btn-primary mt-7 flex w-full items-center justify-center gap-2" onClick={createRoom}>
                <Users size={19} /> Create private room
              </button>

              <div className="my-5 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                <span className="h-px flex-1 bg-slate-200" /> or join <span className="h-px flex-1 bg-slate-200" />
              </div>
              <div className="flex gap-2">
                <input className="input uppercase tracking-[0.25em]" maxLength={6} placeholder="ABC123" value={roomCodeInput} onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase())} />
                <button className="btn-secondary flex items-center gap-2" onClick={joinRoom}><LogIn size={18} /> Join</button>
              </div>

              {error && <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
            </section>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="party-bg min-h-screen p-3 sm:p-5">
      <div className="mx-auto max-w-[1500px]">
        <header className="card mb-4 flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-violet-600 p-2 text-white"><Gamepad2 /></div>
            <div><h1 className="font-black">Stickman Office Party</h1><p className="text-xs text-slate-500">Room {room.code}</p></div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary !px-3 !py-2" onClick={() => navigator.clipboard.writeText(room.code)}><Copy size={16} /> <span className="ml-1 hidden sm:inline">Copy code</span></button>
            <span className="rounded-full bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-700">{socket.connected ? '● Online' : '○ Reconnecting'}</span>
          </div>
        </header>

        {error && <div className="mb-4 rounded-2xl bg-rose-600 px-4 py-3 font-bold text-white shadow-lg">{error}</div>}

        {room.phase === 'playing' ? (
          <div className="relative">
            <TankBattleCanvas playerId={identity.playerId} snapshot={game} spectator={Boolean(me?.isSpectator)} />
            {emojis.map((item) => {
              const tank = game?.tanks.find((candidate) => candidate.id === item.playerId);
              if (!tank || !game) return null;
              return <div key={item.id} className="emoji-float pointer-events-none absolute z-30 text-4xl" style={{ left: `${(tank.x / game.arena.width) * 100}%`, top: `${(tank.y / game.arena.height) * 100}%` }}>{item.emoji}</div>;
            })}
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[300px_1fr_330px]">
            <PlayersPanel room={room} currentPlayerId={identity.playerId} />
            {room.phase === 'results' ? (
              <ResultsPanel room={room} currentPlayerId={identity.playerId} />
            ) : (
              <LobbyPanel
                room={room}
                me={me}
                canStart={canStart}
                onSettings={(settings) => socket.emit('room:settings', settings)}
              />
            )}
            <ChatPanel chat={chat} chatText={chatText} setChatText={setChatText} onSend={() => {
              if (!chatText.trim()) return;
              socket.emit('chat:send', chatText);
              setChatText('');
            }} />
          </div>
        )}
      </div>
    </main>
  );
}

function PlayersPanel({ room, currentPlayerId }: { room: RoomSnapshot; currentPlayerId: string }) {
  const sorted = useMemo(() => [...room.players].sort((a, b) => b.score - a.score), [room.players]);
  return (
    <aside className="card p-5">
      <div className="mb-4 flex items-center justify-between"><h2 className="flex items-center gap-2 font-black"><Users size={18} /> Players</h2><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">{room.players.filter((p) => !p.isSpectator).length}/8</span></div>
      <div className="space-y-2">
        {sorted.map((player, index) => (
          <div key={player.id} className={`relative flex items-center gap-3 rounded-2xl border p-3 ${player.id === currentPlayerId ? 'border-violet-300 bg-violet-50' : 'border-slate-100 bg-white/70'}`}>
            <span className="w-5 text-center text-xs font-black text-slate-400">{index + 1}</span>
            <span className="h-10 w-10 rounded-full border-4 border-white shadow" style={{ backgroundColor: player.avatarColor }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1"><p className="truncate text-sm font-black">{player.nickname}</p>{player.isHost && <span title="Host">👑</span>}</div>
              <p className="text-xs text-slate-500">{player.score} pts · {player.wins} wins</p>
            </div>
            <div className="text-right text-[10px] font-black uppercase tracking-wide">
              {player.isSpectator ? <span className="text-amber-600">Spectator</span> : player.ready ? <span className="text-emerald-600">Ready</span> : <span className="text-slate-400">Waiting</span>}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function LobbyPanel({ room, me, canStart, onSettings }: { room: RoomSnapshot; me: RoomSnapshot['players'][number] | undefined; canStart: boolean; onSettings: (settings: RoomSettings) => void }) {
  return (
    <section className="space-y-4">
      <div className="card p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between"><div><h2 className="text-2xl font-black">Choose a mini-game</h2><p className="text-sm text-slate-500">Vote now. More games are wired into the roadmap.</p></div><Trophy className="text-amber-500" /></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {GAME_CARDS.map((game) => (
            <button
              key={game.id}
              disabled={!game.playable}
              onClick={() => socket.emit('room:vote', game.id)}
              className={`relative rounded-3xl border p-4 text-left transition ${game.playable ? 'border-violet-200 bg-gradient-to-br from-violet-50 to-white hover:-translate-y-1 hover:shadow-lg' : 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-55'}`}
            >
              <span className="text-4xl">{game.icon}</span>
              <h3 className="mt-3 font-black">{game.name}</h3>
              <p className="mt-1 text-xs text-slate-500">{game.playable ? `${room.votes[game.id] ?? 0} vote(s) · Playable now` : 'Coming incrementally'}</p>
              {game.id === room.selectedMiniGame && <span className="absolute right-3 top-3 rounded-full bg-violet-600 px-2 py-1 text-[10px] font-black text-white">SELECTED</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="card grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_auto]">
        <div>
          <h3 className="mb-4 flex items-center gap-2 font-black"><Settings2 size={18} /> Room rules</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-bold text-slate-600">Rounds
              <input className="input mt-1" type="number" min={1} max={10} disabled={!me?.isHost} value={room.settings.rounds} onChange={(event) => onSettings({ ...room.settings, rounds: Number(event.target.value) })} />
            </label>
            <label className="text-sm font-bold text-slate-600">Time limit
              <select className="input mt-1" disabled={!me?.isHost} value={room.settings.timeLimitSeconds} onChange={(event) => onSettings({ ...room.settings, timeLimitSeconds: Number(event.target.value) })}>
                <option value={60}>60 seconds</option><option value={90}>90 seconds</option><option value={120}>120 seconds</option><option value={180}>180 seconds</option>
              </select>
            </label>
            <Toggle label="Friendly fire" checked={room.settings.friendlyFire} disabled={!me?.isHost} onChange={(friendlyFire) => onSettings({ ...room.settings, friendlyFire })} />
            <Toggle label="Random events" checked={room.settings.randomEvents} disabled={!me?.isHost} onChange={(randomEvents) => onSettings({ ...room.settings, randomEvents })} />
          </div>
        </div>
        <div className="flex min-w-[210px] flex-col justify-end gap-3">
          {!me?.isSpectator && <button className={me?.ready ? 'btn-secondary' : 'btn-primary'} onClick={() => socket.emit('room:ready', !me?.ready)}>{me?.ready ? 'Cancel ready' : 'I am ready'}</button>}
          {me?.isHost && <button className="btn-primary bg-emerald-600 hover:bg-emerald-700" disabled={!canStart} onClick={() => socket.emit('room:start')}>Start game</button>}
          {me?.isHost && !canStart && <p className="text-center text-xs text-slate-500">Need 2+ players and everyone ready.</p>}
        </div>
      </div>
    </section>
  );
}

function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600">
      {label}
      <button disabled={disabled} className={`relative h-7 w-12 rounded-full transition ${checked ? 'bg-violet-600' : 'bg-slate-300'} disabled:opacity-50`} onClick={() => onChange(!checked)}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'left-6' : 'left-1'}`} />
      </button>
    </label>
  );
}

function ResultsPanel({ room, currentPlayerId }: { room: RoomSnapshot; currentPlayerId: string }) {
  const me = room.players.find((player) => player.id === currentPlayerId);
  const overall = [...room.players].filter((player) => !player.isSpectator).sort((a, b) => b.score - a.score);
  return (
    <section className="card overflow-hidden p-6">
      <div className="rounded-3xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500 p-7 text-center text-white">
        <div className="text-6xl">{room.tournamentComplete ? '🏆' : '💥'}</div>
        <h2 className="mt-3 text-3xl font-black">{room.tournamentComplete ? 'Office Champion' : `Round ${room.currentRound} complete`}</h2>
        <p className="mt-2 text-white/80">{room.tournamentComplete ? `${overall[0]?.nickname ?? 'Someone'} rules the office today.` : `${room.results[0]?.nickname ?? 'Someone'} survived the arena.`}</p>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div><h3 className="mb-3 font-black">Round scoreboard</h3><div className="space-y-2">{room.results.map((row) => <ScoreRow key={row.playerId} rank={row.placement} name={row.nickname} color={row.avatarColor} detail={`+${row.roundScore} pts · ${row.hp} HP`} />)}</div></div>
        <div><h3 className="mb-3 font-black">Overall ranking</h3><div className="space-y-2">{overall.map((player, index) => <ScoreRow key={player.id} rank={index + 1} name={player.nickname} color={player.avatarColor} detail={`${player.score} pts · ${player.wins} wins`} />)}</div></div>
      </div>

      {me?.isHost && (
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {!room.tournamentComplete && <button className="btn-primary" onClick={() => socket.emit('room:start')}>Start next round</button>}
          <button className="btn-secondary" onClick={() => socket.emit('room:resetParty')}>New party</button>
        </div>
      )}
      {!me?.isHost && <p className="mt-6 text-center text-sm text-slate-500">The host controls the next round.</p>}
    </section>
  );
}

function ScoreRow({ rank, name, color, detail }: { rank: number; name: string; color: string; detail: string }) {
  return <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3"><span className="w-7 text-center text-lg font-black">{rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}</span><span className="h-9 w-9 rounded-full" style={{ backgroundColor: color }} /><div className="flex-1"><p className="font-black">{name}</p><p className="text-xs text-slate-500">{detail}</p></div></div>;
}

function ChatPanel({ chat, chatText, setChatText, onSend }: { chat: ChatMessage[]; chatText: string; setChatText: (text: string) => void; onSend: () => void }) {
  return (
    <aside className="card flex min-h-[420px] flex-col p-5">
      <h2 className="mb-4 flex items-center gap-2 font-black"><MessageCircle size={18} /> Office chat</h2>
      <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl bg-slate-50 p-3">
        {chat.length === 0 && <div className="flex h-full flex-col items-center justify-center text-center text-sm text-slate-400"><MessageCircle className="mb-2" />Break the silence. Talk strategy or blame IT.</div>}
        {chat.map((message) => <div key={message.id}><p className="text-xs font-black text-violet-700">{message.nickname}</p><p className="break-words text-sm text-slate-700">{message.text}</p></div>)}
      </div>
      <div className="mt-3 flex gap-2"><input className="input" maxLength={180} placeholder="Type a message…" value={chatText} onChange={(event) => setChatText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onSend(); }} /><button className="btn-primary !px-4" onClick={onSend}>Send</button></div>
      <div className="mt-3 flex justify-between text-xl">{['😀', '😂', '🔥', '👏', '☕', '💥'].map((emoji) => <button key={emoji} className="hover:scale-125" onClick={() => socket.emit('emoji:send', emoji)}>{emoji}</button>)}</div>
      <div className="mt-4 rounded-2xl bg-amber-50 p-3 text-xs text-amber-800"><Shield className="mr-1 inline" size={14} /> Game outcomes are calculated by the server, not by browsers.</div>
    </aside>
  );
}

export default App;
