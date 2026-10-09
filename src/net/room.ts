import type { Transport } from './transport';

export type RoomError = 'not_found' | 'full' | 'expired' | 'playing' | 'not_puyo';

export const MAX_PLAYERS = 4;
export const ROOM_TTL_MS = 6 * 3600 * 1000;
export const ROUND_END_DELAY_MS = 2500;
export const COUNTDOWN_MS = 2000;
/** 対戦中にこれだけ盤面ログが届かない人は負け（設計書 §8.4） */
export const SILENT_LOSE_MS = 10_000;

export interface RoomInfo {
  /** 前作 Puzzle Battle の部屋と区別する */
  app: 'puyo';
  createdAt: number;
  hostId: string;
  state: 'lobby' | 'playing' | 'finished';
  round: number;
  /** 今の試合の最初のラウンドの 1 つ前（勝ち数はこれより後だけ数える） */
  baseRound: number;
  seed: number;
  /** ラウンド開始のサーバー時刻 */
  startAt: number;
  firstTo: number;
  /** 今の試合に出ている人（並び順がプレイヤー番号） */
  members: string[];
}

export interface PlayerInfo {
  name: string;
  ready: boolean;
  online: boolean;
  joinedAt: number;
}

export interface RoomState {
  info: RoomInfo;
  players: Record<string, PlayerInfo>;
  /** losses[round][uid] = true */
  losses: Record<string, Record<string, boolean>>;
  /** 盤面ログ（boardLog.ts の形式） */
  boards: Record<string, string>;
}

export interface AttackMessage {
  from: string;
  /** 送り先の uid。確定のときは '*' */
  to: string;
  ap: number;
  /** 1 なら「from の連鎖が終わった（from からのおじゃまを確定）」 */
  c?: 1;
}

const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 7 文字（前作の 6 文字の部屋とぶつからない） */
export function makeRoomId(): string {
  let s = '';
  for (let i = 0; i < 7; i++) s += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  return s;
}

/** オンライン対戦の部屋。ホストがラウンドの開始・終了・切断の負けを書く */
export class Room {
  state: RoomState;
  private cbs = new Set<() => void>();
  offs: (() => void)[] = [];
  private scheduledRound = -1;
  private roundTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  /** uid ごとの、盤面ログが最後に変わったサーバー時刻 */
  private lastBoard: Record<string, number> = {};
  private left = false;

  private constructor(private t: Transport, readonly id: string, readonly myId: string, info: RoomInfo) {
    this.state = { info, players: {}, losses: {}, boards: {} };
  }

  get base(): string {
    return `rooms/${this.id}`;
  }

  get isHost(): boolean {
    return this.state.info.hostId === this.myId;
  }

  /** ホストが抜けた（ホストしか部屋を進められないので、部屋は止まる） */
  get hostGone(): boolean {
    return !this.state.players[this.state.info.hostId]?.online;
  }

  serverNow(): number {
    return this.t.serverNow();
  }

  static async create(t: Transport, name: string, firstTo = 2): Promise<Room> {
    const uid = await t.uid();
    let id = makeRoomId();
    while (await t.get(`rooms/${id}/info`)) id = makeRoomId();
    const info: RoomInfo = {
      app: 'puyo',
      createdAt: t.serverNow(),
      hostId: uid,
      state: 'lobby',
      round: 0,
      baseRound: 0,
      seed: 0,
      startAt: 0,
      firstTo,
      members: [],
    };
    await t.set(`rooms/${id}/info`, info);
    return Room.join(t, id, name);
  }

  static async join(t: Transport, id: string, name: string): Promise<Room> {
    const uid = await t.uid();
    const info: RoomInfo | null = await t.get(`rooms/${id}/info`);
    if (!info) throw new Error('not_found');
    if (info.app !== 'puyo') throw new Error('not_puyo');
    if (t.serverNow() - info.createdAt > ROOM_TTL_MS) throw new Error('expired');
    const players: Record<string, PlayerInfo> = (await t.get(`rooms/${id}/players`)) ?? {};
    const existing = players[uid];
    const online = Object.values(players).filter((p) => p && p.online).length;
    if (!existing && online >= MAX_PLAYERS) throw new Error('full');
    if (!existing && info.state === 'playing') throw new Error('playing');

    const base = `rooms/${id}`;
    await t.set(`${base}/players/${uid}`, {
      name: String(name || existing?.name || 'プレイヤー').slice(0, 12),
      ready: false,
      online: true,
      joinedAt: existing?.joinedAt ?? t.serverNow(),
    } satisfies PlayerInfo);
    // 対戦中にページを開き直した人は、そのラウンドは負け
    if (existing && info.state === 'playing' && (info.members ?? []).includes(uid)) {
      await t.set(`${base}/losses/${info.round}/${uid}`, true);
    }
    const room = new Room(t, id, uid, { ...info, members: info.members ?? [] });
    room.subscribe();
    // つながるたびに「切断されたら offline」を仕掛け直し、online に戻す
    room.offs.push(
      t.onConnected((c) => {
        if (!c || room.left) return;
        t.onDisconnectSet(`${base}/players/${uid}/online`, false);
        void t.set(`${base}/players/${uid}/online`, true);
      }),
    );
    return room;
  }

  private subscribe() {
    const b = this.base;
    this.offs.push(
      this.t.on(`${b}/info`, (v) => v && this.changed({ info: { ...v, members: v.members ?? [] } })),
      this.t.on(`${b}/players`, (v) => this.changed({ players: v ?? {} })),
      this.t.on(`${b}/losses`, (v) => this.changed({ losses: v ?? {} })),
      this.t.on(`${b}/boards`, (v) => {
        const boards: Record<string, string> = v ?? {};
        for (const [uid, log] of Object.entries(boards)) if (log !== this.state.boards[uid]) this.lastBoard[uid] = this.t.serverNow();
        this.changed({ boards });
      }),
    );
    this.watchdog = setInterval(() => this.checkSilent(), 1000);
  }

  /** ホスト: 対戦中に盤面ログが 10 秒以上届かない人を負けにする */
  private checkSilent() {
    const { info, losses } = this.state;
    if (!this.isHost || info.state !== 'playing') return;
    const now = this.t.serverNow();
    const lost = losses[info.round] ?? {};
    for (const uid of info.members) {
      if (uid === this.myId || lost[uid]) continue;
      const last = Math.max(this.lastBoard[uid] ?? 0, info.startAt);
      if (now - last >= SILENT_LOSE_MS) void this.reportLose(info.round, uid);
    }
  }

  private changed(part: Partial<RoomState>) {
    this.state = { ...this.state, ...part };
    const { info, players } = this.state;
    const me = players[this.myId];
    if (info.state === 'playing' && me?.ready) void this.t.set(`${this.base}/players/${this.myId}/ready`, false);
    if (this.isHost) this.hostLogic();
    for (const cb of this.cbs) cb();
  }

  private hostLogic() {
    const { info, players, losses } = this.state;
    if (info.state !== 'playing') {
      const list = Object.values(players).filter((p) => p && p.online);
      if (list.length >= 2 && list.every((p) => p.ready)) void this.startRound(info.round);
      return;
    }
    const lost = losses[info.round] ?? {};
    // 対戦中に切断した人は負け
    for (const uid of info.members) {
      if (!lost[uid] && !players[uid]?.online) void this.reportLose(info.round, uid);
    }
    if (this.roundDecided() && this.scheduledRound !== info.round) {
      this.scheduledRound = info.round;
      const round = info.round;
      this.roundTimer = setTimeout(() => {
        this.roundTimer = null;
        if (this.state.info.round !== round || this.left || !this.roundDecided()) {
          this.scheduledRound = -1;
          return;
        }
        const done = this.state.info.members.some((uid) => this.wins(uid) >= this.state.info.firstTo);
        // 相手が抜けて 1 人しか残っていないなら、そこで試合を終える
        const remaining = this.state.info.members.filter((uid) => this.state.players[uid]?.online).length;
        if (done || remaining < 2) void this.t.update(`${this.base}/info`, { state: 'finished' });
        else void this.startRound(this.state.info.baseRound);
      }, ROUND_END_DELAY_MS);
    }
  }

  /** 今のラウンドの決着がついたか（メンバー − 1 人以上が負け） */
  roundDecided(): boolean {
    const { info, losses } = this.state;
    if (info.state !== 'playing' || info.members.length < 2) return false;
    const lost = losses[info.round] ?? {};
    return info.members.filter((u) => lost[u]).length >= info.members.length - 1;
  }

  private async startRound(baseRound: number) {
    const { info, players } = this.state;
    const newMatch = info.state !== 'playing';
    const members = newMatch
      ? Object.entries(players)
          .filter(([, p]) => p && p.online)
          .sort((a, b) => a[1].joinedAt - b[1].joinedAt || (a[0] < b[0] ? -1 : 1))
          .slice(0, MAX_PLAYERS)
          .map(([uid]) => uid)
      : info.members.filter((uid) => players[uid]?.online);
    const next = {
      state: 'playing' as const,
      round: info.round + 1,
      baseRound,
      seed: Math.floor(Math.random() * 65536),
      startAt: this.t.serverNow() + COUNTDOWN_MS,
      members,
    };
    // 書き込みが反映されるまでに二重に始めないよう、先に手元の状態を進める
    this.state = { ...this.state, info: { ...info, ...next } };
    await this.t.update(`${this.base}/info`, next);
  }

  /** uid の今の試合での勝ち数（自分以外のメンバー全員が負けたラウンドの数） */
  wins(uid: string): number {
    const { info, losses } = this.state;
    let n = 0;
    for (let r = info.baseRound + 1; r <= info.round; r++) {
      const l = losses[r];
      if (!l || l[uid]) continue;
      if (info.members.filter((u) => u !== uid).every((u) => l[u])) n++;
    }
    return n;
  }

  onChange(cb: () => void): () => void {
    this.cbs.add(cb);
    return () => this.cbs.delete(cb);
  }

  setReady(r: boolean): Promise<void> {
    return this.t.set(`${this.base}/players/${this.myId}/ready`, r);
  }

  reportLose(round: number, uid = this.myId): Promise<void> {
    return this.t.set(`${this.base}/losses/${round}/${uid}`, true);
  }

  sendAttack(round: number, to: string, n: number): Promise<void> {
    return this.t.push(`${this.base}/attacks/${round}`, { from: this.myId, to, ap: n } satisfies AttackMessage);
  }

  sendConfirm(round: number): Promise<void> {
    return this.t.push(`${this.base}/attacks/${round}`, { from: this.myId, to: '*', ap: 0, c: 1 } satisfies AttackMessage);
  }

  /** 戻り値で購読をやめる（呼んだ側が持つ） */
  onAttacks(round: number, cb: (m: AttackMessage) => void): () => void {
    return this.t.onChildAdded(`${this.base}/attacks/${round}`, (v) => v && cb(v));
  }

  writeBoard(log: string): Promise<void> {
    return this.t.set(`${this.base}/boards/${this.myId}`, log);
  }

  link(baseUrl: string): string {
    return `${baseUrl}#room=${this.id}`;
  }

  /** 画面を離れるときに呼ぶ。ほかの人には切断と同じに見える */
  leave(): void {
    this.left = true;
    // 自分の枠を消す（満員の数に入らないように）。対戦中ならホストが負けにする
    void this.t.set(`${this.base}/players/${this.myId}`, null);
    this.dispose();
  }

  dispose(): void {
    if (this.roundTimer) clearTimeout(this.roundTimer);
    if (this.watchdog) clearInterval(this.watchdog);
    this.roundTimer = this.watchdog = null;
    for (const off of this.offs) off();
    this.offs = [];
    this.cbs.clear();
  }
}
