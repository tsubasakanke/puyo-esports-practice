import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryHub, MemoryTransport } from '../../src/net/transport';
import { Room, makeRoomId, ROUND_END_DELAY_MS } from '../../src/net/room';

let hub: MemoryHub;
const t = (uid: string) => new MemoryTransport(hub, uid);

async function room(n: number, firstTo = 2) {
  const rooms = [await Room.create(t('A'), 'えー', firstTo)];
  for (const uid of ['B', 'C', 'D'].slice(0, n - 1)) rooms.push(await Room.join(t(uid), rooms[0].id, uid));
  return rooms;
}

async function readyAll(rooms: Room[]) {
  for (const r of rooms) await r.setReady(true);
  await vi.advanceTimersByTimeAsync(10);
}

beforeEach(() => {
  hub = new MemoryHub();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('Room', () => {
  it('部屋コードは7文字', () => expect(makeRoomId()).toHaveLength(7));

  it('作成と参加で全員に全員が見える', async () => {
    const rs = await room(3);
    await vi.advanceTimersByTimeAsync(10);
    for (const r of rs) expect(Object.keys(r.state.players).sort()).toEqual(['A', 'B', 'C']);
    expect(rs[0].isHost).toBe(true);
    expect(rs[1].isHost).toBe(false);
  });

  it('5人目は満員、ない部屋・前作の部屋には入れない', async () => {
    const rs = await room(4);
    await expect(Room.join(t('E'), rs[0].id, 'いー')).rejects.toThrow('full');
    await expect(Room.join(t('E'), 'ZZZZZZZ', 'いー')).rejects.toThrow('not_found');
    await hub.write('rooms/OLDROOM/info', { createdAt: hub.now, hostId: 'X', state: 'lobby' });
    await expect(Room.join(t('E'), 'OLDROOM', 'いー')).rejects.toThrow('not_puyo');
  });

  it('期限切れの部屋には入れない', async () => {
    const rs = await room(1);
    hub.now += 7 * 3600 * 1000;
    await expect(Room.join(t('B'), rs[0].id, 'びー')).rejects.toThrow('expired');
  });

  it('2人以上が全員準備OKで開始。1人だけでは始まらない', async () => {
    const [a] = await room(1);
    await a.setReady(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(a.state.info.state).toBe('lobby');
    const b = await Room.join(t('B'), a.id, 'びー');
    await b.setReady(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(a.state.info.state).toBe('playing');
    expect(a.state.info.round).toBe(1);
    expect(a.state.info.members).toEqual(['A', 'B']);
    expect(b.state.info.seed).toBe(a.state.info.seed);
  });

  it('対戦中の部屋には入れない', async () => {
    const rs = await room(2);
    await readyAll(rs);
    await expect(Room.join(t('C'), rs[0].id, 'しー')).rejects.toThrow('playing');
  });

  it('メンバー−1人が負けたらラウンド終了、勝ち数が増え、先取で finished', async () => {
    const [a, b, c] = await room(3, 2);
    await readyAll([a, b, c]);
    await b.reportLose(1);
    await vi.advanceTimersByTimeAsync(10);
    expect(a.state.info.round).toBe(1); // まだ 2 人残っている
    await c.reportLose(1);
    await vi.advanceTimersByTimeAsync(ROUND_END_DELAY_MS + 10);
    expect(a.wins('A')).toBe(1);
    expect(a.state.info.round).toBe(2);
    await b.reportLose(2);
    await a.reportLose(2);
    await vi.advanceTimersByTimeAsync(ROUND_END_DELAY_MS + 10);
    expect(a.wins('C')).toBe(1);
    await b.reportLose(3);
    await c.reportLose(3);
    await vi.advanceTimersByTimeAsync(ROUND_END_DELAY_MS + 10);
    expect(a.wins('A')).toBe(2);
    expect(a.state.info.state).toBe('finished');
  });

  it('同時に全員負けたら引き分けで、だれの勝ちにもならない', async () => {
    const [a, b] = await room(2);
    await readyAll([a, b]);
    await a.reportLose(1);
    await b.reportLose(1);
    await vi.advanceTimersByTimeAsync(ROUND_END_DELAY_MS + 10);
    expect(a.wins('A') + a.wins('B')).toBe(0);
    expect(a.state.info.round).toBe(2);
  });

  it('対戦中に切断した人は、そのラウンドの負けになる', async () => {
    const [a, b, c] = await room(3);
    await readyAll([a, b, c]);
    hub.disconnect('C');
    await vi.advanceTimersByTimeAsync(10);
    expect(a.state.losses[1]?.C).toBe(true);
  });

  it('攻撃と確定のメッセージが届き、盤面ログが読める', async () => {
    const [a, b] = await room(2);
    await readyAll([a, b]);
    const got: unknown[] = [];
    b.onAttacks(1, (m) => got.push(m));
    await a.sendAttack(1, 'B', 5);
    await a.sendConfirm(1);
    await a.writeBoard('R1|L0:3101,0');
    await vi.advanceTimersByTimeAsync(10);
    expect(got).toEqual([
      { from: 'A', to: 'B', ap: 5 },
      { from: 'A', to: '*', ap: 0, c: 1 },
    ]);
    expect(b.state.boards.A).toBe('R1|L0:3101,0');
  });

  it('2人対戦で相手が抜けたら、残った人だけのラウンドを繰り返さずに試合を終える', async () => {
    const [a, b] = await room(2, 3);
    await readyAll([a, b]);
    hub.disconnect('B');
    await vi.advanceTimersByTimeAsync(ROUND_END_DELAY_MS * 4);
    expect(a.state.info.state).toBe('finished');
    expect(a.state.info.round).toBe(1);
  });

  it('切断から戻ったら online に戻る', async () => {
    const [a, b] = await room(2);
    hub.disconnect('B');
    await vi.advanceTimersByTimeAsync(10);
    expect(a.state.players.B.online).toBe(false);
    hub.reconnect('B');
    await vi.advanceTimersByTimeAsync(10);
    expect(a.state.players.B.online).toBe(true);
    void b;
  });

  it('抜けた人は満員の数に入らない', async () => {
    const rs = await room(4);
    rs[3].leave();
    await vi.advanceTimersByTimeAsync(10);
    const e = await Room.join(t('E'), rs[0].id, 'いー');
    expect(e.state.info.app).toBe('puyo');
  });

  it('対戦中に 10 秒以上盤面ログが届かない人は負け（ホストが判定）', async () => {
    const [a, b] = await room(2);
    await readyAll([a, b]);
    await a.writeBoard('R1|P0|');
    for (let i = 0; i < 14; i++) {
      hub.now += 1000;
      if (i % 3 === 0) await a.writeBoard(`R1|P0|L${i}:3101,0`);
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(a.state.losses[1]?.B).toBe(true);
    expect(a.state.losses[1]?.A).toBeUndefined();
  });

  it('ホストが抜けたら hostGone になる', async () => {
    const [a, b] = await room(2);
    a.leave();
    await vi.advanceTimersByTimeAsync(10);
    expect(b.hostGone).toBe(true);
  });

  it('先取後にもう一度全員準備OKで、新しい試合（勝ち数 0 から）', async () => {
    const [a, b] = await room(2, 1);
    await readyAll([a, b]);
    await b.reportLose(1);
    await vi.advanceTimersByTimeAsync(ROUND_END_DELAY_MS + 10);
    expect(a.state.info.state).toBe('finished');
    await readyAll([a, b]);
    expect(a.state.info.state).toBe('playing');
    expect(a.wins('A')).toBe(0);
  });
});
