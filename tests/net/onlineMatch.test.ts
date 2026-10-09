import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryHub, MemoryTransport } from '../../src/net/transport';
import { Room } from '../../src/net/room';
import { OnlineMatch } from '../../src/net/onlineMatch';
import { Field } from '../../src/engine/field';
import { GARBAGE } from '../../src/engine/types';

let hub: MemoryHub;
const t = (uid: string) => new MemoryTransport(hub, uid);
const idle = { left: false, right: false, down: false, rotL: false, rotR: false };

beforeEach(() => {
  hub = new MemoryHub();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

async function setup() {
  const a = await Room.create(t('A'), 'えー');
  const b = await Room.join(t('B'), a.id, 'びー');
  await a.setReady(true);
  await b.setReady(true);
  await vi.advanceTimersByTimeAsync(10);
  const { round, seed, members } = a.state.info;
  return {
    a,
    b,
    ma: new OnlineMatch(a, round, seed, members),
    mb: new OnlineMatch(b, round, seed, members),
  };
}

function untilPieces(...ms: OnlineMatch[]) {
  for (let i = 0; i < 100 && !ms.every((m) => m.me.piece); i++) for (const m of ms) m.step(idle);
}

const countG = (f: Field) => f.cells.filter((c) => c === GARBAGE).length;

describe('OnlineMatch', () => {
  it('自分は通常、相手は再生モード。プレイヤー番号はメンバー順', async () => {
    const { ma, mb } = await setup();
    expect(ma.myIndex).toBe(0);
    expect(mb.myIndex).toBe(1);
    expect(ma.players[1].replay).not.toBeNull();
    expect(ma.players[0].replay).toBeNull();
  });

  it('A の 2 連鎖が B の予告に届き、A の連鎖終了で確定して、B が置いたあとに降る', async () => {
    const { ma, mb } = await setup();
    untilPieces(ma, mb);
    ma.me.field = Field.fromStrings([...Array(8).fill('......'), 'G.....', 'G.....', 'G.....', 'R.....', 'R.....', 'R.....']);
    ma.me.piece = { x: 2, y: 12, dir: 0, colors: [1, 2] };
    let sawWaiting = false;
    for (let i = 0; i < 400; i++) {
      ma.step({ ...idle, down: true });
      mb.step(idle);
      if (mb.me.pendingTotal() === 5 && mb.me.pendingReady() === 0) sawWaiting = true;
      if (ma.me.events.some((e) => e.t === 'chainEnd')) break;
    }
    expect(sawWaiting).toBe(true);
    expect(mb.me.pendingReady()).toBe(5);
    for (let i = 0; i < 600 && countG(mb.me.field) === 0; i++) {
      ma.step(idle);
      mb.step({ ...idle, down: true });
    }
    expect(countG(mb.me.field)).toBe(5);
  });

  it('B から見た A の盤面（再生）は、A 本人の盤面と同じになる', async () => {
    const { ma, mb } = await setup();
    untilPieces(ma, mb);
    const atSpawn = new Map<number, string>();
    for (let i = 0; i < 3000 && ma.me.phase !== 'dead'; i++) {
      ma.step({ ...idle, down: true, left: i % 40 < 2, rotR: i % 37 === 0 });
      mb.step(idle);
      for (const e of ma.me.events) if (e.t === 'spawn') atSpawn.set(e.index, ma.me.field.toStrings().join('/'));
      for (const e of mb.players[0].events) if (e.t === 'spawn') expect(mb.players[0].field.toStrings().join('/')).toBe(atSpawn.get(e.index));
    }
    expect(atSpawn.size).toBeGreaterThan(5);
  });

  it('負けたら部屋に負けを書く', async () => {
    const { a, ma, mb } = await setup();
    untilPieces(ma, mb);
    ma.me.field = Field.fromStrings(['......', '......', ...Array(12).fill('..O...')]);
    for (let i = 0; i < 400 && ma.me.phase !== 'dead'; i++) {
      ma.step({ ...idle, down: true });
      mb.step(idle);
    }
    expect(ma.me.phase).toBe('dead');
    expect(a.state.losses[1]?.A).toBe(true);
  });

  it('相手の予告の数が見える', async () => {
    const { ma, mb } = await setup();
    untilPieces(ma, mb);
    mb.me.receive(0, 7);
    ma.step(idle);
    mb.step(idle);
    expect(ma.pendingOf(1)).toBe(7);
  });
});
