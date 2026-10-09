import { marginRate } from '../engine/garbage';
import { Player, type FrameInput, type ReplaySource } from '../engine/player';
import type { Rules } from '../engine/rules/tsu';
import { BoardLogWriter, parseBoardLog, type ParsedBoardLog } from './boardLog';
import type { AttackMessage, Room } from './room';

const IDLE: FrameInput = { left: false, right: false, down: false, rotL: false, rotR: false };

/** 届くたびに中身が差し替わる再生ログ */
class LiveReplay implements ReplaySource {
  log: ParsedBoardLog = parseBoardLog('');
  constructor(private round: number) {}
  update(s: string | undefined) {
    const p = parseBoardLog(s);
    if (p.round === this.round) this.log = p;
  }
  placement(i: number) {
    return this.log.placement(i);
  }
  garbage(i: number) {
    return this.log.garbage(i);
  }
}

/**
 * オンラインの 1 ラウンド。自分の Player はローカルで動かし、相手は盤面ログを再生する。
 * 攻撃・確定・負けは部屋（Room）にメッセージで書く。
 */
export class OnlineMatch {
  readonly players: Player[];
  readonly myIndex: number;
  frame = 0;
  private writer: BoardLogWriter;
  private replays: (LiveReplay | null)[];
  /** この試合で自分が各相手に送った攻撃の合計（攻撃先の決定に使う） */
  private sent: number[];
  private offs: (() => void)[] = [];

  constructor(private room: Room, readonly round: number, seed: number, readonly members: string[], rules?: Partial<Rules>) {
    this.myIndex = members.indexOf(room.myId);
    this.writer = new BoardLogWriter(round);
    this.sent = members.map(() => 0);
    this.replays = members.map((_, i) => (i === this.myIndex ? null : new LiveReplay(round)));
    this.players = members.map(
      (_, i) =>
        new Player({
          seed,
          rules: i === this.myIndex ? rules : undefined,
          garbageSeed: ((seed + 1) * 0x9e37 * (i + 1)) >>> 0,
          replay: this.replays[i] ?? undefined,
        }),
    );
    const syncBoards = () => {
      members.forEach((uid, i) => this.replays[i]?.update(room.state.boards[uid]));
    };
    syncBoards();
    this.offs.push(room.onChange(syncBoards));
    this.offs.push(room.onAttacks(round, (m) => this.onAttack(m)));
  }

  get me(): Player {
    return this.players[this.myIndex];
  }

  /** 相手 i の予告の数（相手のログに書かれた値。自分ならローカルの値） */
  pendingOf(i: number): number {
    if (i === this.myIndex) return this.me.pendingTotal();
    return this.replays[i]?.log.pending ?? 0;
  }

  /** このラウンドの負けがもう記録されている（リロードした人など）。自分は動かさず観戦する */
  get spectating(): boolean {
    return !!this.room.state.losses[this.round]?.[this.room.myId] && this.me.phase !== 'dead';
  }

  /** 部屋で負けたことになっている（切断など）か、盤面で負けたか */
  isOut(i: number): boolean {
    return this.players[i].phase === 'dead' || !!this.room.state.losses[this.round]?.[this.members[i]];
  }

  private onAttack(m: AttackMessage) {
    const from = this.members.indexOf(m.from);
    if (from < 0 || from === this.myIndex) return;
    if (m.c) this.me.confirm(from);
    // 負けた人（リロードして観戦中の人など）からの攻撃は受けない
    else if (m.to === this.room.myId && m.ap > 0 && !this.isOut(from)) this.me.receive(from, Math.min(m.ap, 99999));
  }

  /** 攻撃先: 送った合計が一番少ない相手 → 盤面が一番低い相手 → 番号が小さい相手 */
  target(): number {
    let best = -1;
    let key: [number, number] = [Infinity, Infinity];
    this.players.forEach((p, i) => {
      if (i === this.myIndex || this.isOut(i)) return;
      let h = 0;
      for (let x = 1; x <= 6; x++) h += p.field.height(x);
      if (this.sent[i] < key[0] || (this.sent[i] === key[0] && h < key[1])) {
        best = i;
        key = [this.sent[i], h];
      }
    });
    return best;
  }

  step(input: FrameInput): void {
    this.frame++;
    const me = this.me;
    const watching = this.spectating;
    me.rate = marginRate(me.rules.RATE, this.frame, me.rules);
    this.players.forEach((p, i) => {
      if (p.phase === 'dead') {
        p.events = [];
        return;
      }
      if (i === this.myIndex && watching) {
        p.events = [];
        return;
      }
      p.step(i === this.myIndex ? input : IDLE);
    });
    if (watching) return;
    for (const e of me.events) {
      if (e.t === 'clear' && e.send > 0) {
        const t = this.target();
        if (t >= 0) {
          this.sent[t] += e.send;
          void this.room.sendAttack(this.round, this.members[t], e.send);
        }
      } else if (e.t === 'chainEnd') void this.room.sendConfirm(this.round);
      else if (e.t === 'dead') void this.room.reportLose(this.round);
    }
    this.writer.observe(me);
    if (this.writer.takeChanged()) void this.room.writeBoard(this.writer.toString());
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs = [];
  }
}
