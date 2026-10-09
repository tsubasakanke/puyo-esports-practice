# サブプロジェクト① エンジン（通）＋描画＋ひとり練習 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 通ルールの決定的なフレーム単位エンジンを作り、PixiJS でぷにっとした質感のぷよを描いて、キーボードでひとり練習ができるところまで作る。

**Architecture:** `src/engine` は DOM・描画に依存しない純粋な TypeScript。`Player.step(input)` で1フレーム進み、出来事を `events` に積む。`src/render` はエンジンの状態とイベントを読んで PixiJS で描き、`src/ui` が画面遷移とゲームループ（1/60 秒の固定ステップ＋描画補間）を持つ。

**Tech Stack:** TypeScript, Vite, Vitest, PixiJS v8

**Spec:** `docs/superpowers/specs/2026-10-09-puyo-esports-practice-design.md`

## Global Constraints

- SEGA の画像・音楽・キャラクター・ボイス・ロゴを使わない。ぷよの目は原作のデザインをまねしない
- `src/engine` は `src/render`・`src/ui`・`pixi.js`・DOM API を import しない
- エンジンは 1/60 秒の固定ステップ。`Math.random` を使わない（乱数はシードから）
- 盤面は 6 列 × 14 段（見える 12 段＋13 段目＋14 段目）。窒息点は 3 列目 12 段目
- 操作の定数・タイミング定数はすべて `src/engine/rules/tsu.ts` に置く
- UI の文言は日本語
- 基準解像度 1920×1080、ウィンドウに合わせて拡大縮小

## Review Focus

1. **壁際・天井際の回転**: 1列目・6列目、13段目付近での回転、両側ふさがりのクイックターン。原作どおり回れること（回れないときは何も起きず、固まらない）
2. **14段目の扱い**: 回転で14段目に入ったぷよが設置後に消えること、13段目のぷよが連鎖に参加しないこと
3. **長時間プレイ**: 128手（配ぷよ1周）を超えても配ぷよがループして続くこと
4. **タブの切り替え**: 裏に回って戻ったとき、時間が飛んでもゲームが壊れない（最大30フレームだけ追いつく）
5. **同時押し**: 左右同時押し・回転と移動の同時押しで、状態がおかしくならない

---

## ファイル構成

```
package.json, tsconfig.json, vite.config.ts, index.html
src/
  engine/
    types.ts         Color, Cell, Dir などの基本型
    rng.ts           eスポ互換 LCG と配ぷよ生成
    field.ts         Field クラス（盤面・連結・消去・落下）
    score.ts         得点計算
    piece.ts         ツモ（ペア）の位置・回転・壁蹴り・クイックターン
    rules/tsu.ts     定数
    events.ts        エンジンイベント型
    player.ts        Player 状態機械
  input/keyboard.ts  キー状態 → 1フレームの入力（DAS/ARR はエンジン側で処理）
  render/
    puyoTextures.ts  ぷよのテクスチャ生成（色×連結16パターン）
    fieldView.ts     1人分の盤面描画＋アニメーション
    hud.ts           NEXT、スコア、連鎖表示
    background.ts    背景・枠（通）
    layout.ts        1920×1080 基準の配置と拡大縮小
  audio/sfx.ts       Web Audio の効果音
  ui/
    app.ts           PixiJS アプリと画面切り替え
    loop.ts          固定ステップのゲームループ
    screens/title.ts, screens/solo.ts, screens/settings.ts
  settings.ts        キー割り当て・DAS/ARR・音量（localStorage）
  main.ts
tests/engine/*.test.ts, tests/ui/loop.test.ts
.github/workflows/deploy.yml
```

---

### Task 1: 土台と配ぷよ生成

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/engine/types.ts`, `src/engine/rng.ts`
- Test: `tests/engine/rng.test.ts`

**Interfaces:**
- Produces:
  - `type Color = 0|1|2|3|4|5|6`（0=空, 1..5=赤緑青黄紫, 6=おじゃま）
  - `class Lcg { constructor(seed: number); next(): number /*0..0xFFFF*/; nextMod(n: number): number; get state(): number }`
  - `generateTsumo(seed: number, colors: 3|4|5): { colorMap: Color[]; pairs: [Color, Color][] }`（128 ペア。`colorMap[i]` はプール値 i の色）
  - `class TsumoQueue { constructor(seed: number, colors: 3|4|5); get(index: number): [Color, Color] }`（index は 128 でループ）

- [ ] **Step 1: 土台を作る**

```bash
cd ~/puyo-esports-practice
npm init -y
npm i pixi.js@^8
npm i -D typescript vite vitest
```
`package.json` の scripts: `"dev": "vite"`, `"build": "vite build"`, `"typecheck": "tsc --noEmit"`, `"test": "vitest run"`, `"check": "npm run typecheck && npm test && npm run build"`, `"type": "module"`。
`vite.config.ts` は `base: './'`。`tsconfig.json` は `strict: true`, `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`, `include: ["src","tests"]`。

- [ ] **Step 2: 失敗するテストを書く**（正解は Puyo Nexus の参照 Python 実装の出力）

```ts
import { describe, it, expect } from 'vitest';
import { generateTsumo, TsumoQueue } from '../../src/engine/rng';

// 参照実装のプール値（色マップ前）。index 0..31
const RAW4: Record<number, string> = {
  0x0000: '00202323011121120003113221330223',
  0x0001: '01211123310322221121033310331223',
  0x1234: '01001022101320201302223223203331',
  0xffff: '02220113001330100123112323200003',
};
const MAP: Record<number, string> = { 0x0000: 'RBPYG', 0x0001: 'GPRBY', 0x1234: 'RGBPY', 0xffff: 'RPYGB' };
const LETTER = ['', 'R', 'G', 'B', 'Y', 'P'];

describe('generateTsumo', () => {
  for (const seed of Object.keys(RAW4).map(Number)) {
    it(`seed ${seed.toString(16)} は参照実装と一致する`, () => {
      const { colorMap, pairs } = generateTsumo(seed, 4);
      expect(colorMap.map((c) => LETTER[c]).join('')).toBe(MAP[seed]);
      const raw = pairs.flat().slice(0, 32).map((c) => colorMap.indexOf(c)).join('');
      expect(raw).toBe(RAW4[seed]);
    });
  }
  it('3色・5色も参照実装と一致し、最初の2手は3色プールと同じ', () => {
    const t3 = generateTsumo(0, 3), t5 = generateTsumo(0, 5);
    expect(t3.pairs.flat().slice(0, 16).map((c) => t3.colorMap.indexOf(c)).join('')).toBe('0020112102101011');
    expect(t5.pairs.flat().slice(0, 16).map((c) => t5.colorMap.indexOf(c)).join('')).toBe('0020411231213120');
  });
  it('128ペアでループする', () => {
    const q = new TsumoQueue(7, 4);
    expect(q.get(128)).toEqual(q.get(0));
    expect(q.get(300)).toEqual(q.get(300 - 256));
  });
});
```

- [ ] **Step 3: テストが落ちるのを確かめる** — `npx vitest run tests/engine/rng.test.ts` → モジュールがなくて FAIL

- [ ] **Step 4: 実装する**

```ts
// src/engine/rng.ts
import type { Color } from './types';

export class Lcg {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0; }
  get state() { return this.s; }
  next(): number {
    this.s = (Math.imul(this.s, 0x5d588b65) + 0x269ec3) >>> 0;
    return this.s >>> 16;
  }
  nextMod(n: number): number { return (this.next() * n) >>> 16; }
}

function shuffle(rng: Lcg, n: number): number[] {
  const p = Array.from({ length: 256 }, (_, i) => i % n);
  for (const len of [16, 32, 64]) {
    for (let row = 0; row < 256 / len - 1; row++) {
      for (let k = 0; k < len >> 1; k++) {
        const a = row * len + rng.nextMod(len);
        const b = (row + 1) * len + rng.nextMod(len);
        [p[a], p[b]] = [p[b], p[a]];
      }
    }
  }
  return p;
}

export function generateTsumo(seed: number, colors: 3 | 4 | 5) {
  const rng = new Lcg(seed & 0xffff);
  const left: Color[] = [1, 2, 3, 4, 5];
  const colorMap: Color[] = [];
  for (let n = 5; n > 0; n--) colorMap.push(left.splice(rng.nextMod(n), 1)[0]);
  const pools: Record<number, number[]> = {};
  for (const n of [3, 4, 5]) pools[n] = shuffle(rng, n);
  for (const n of [4, 5]) for (let i = 0; i < 4; i++) pools[n][i] = pools[3][i];
  const raw = pools[colors];
  const pairs: [Color, Color][] = [];
  for (let i = 0; i < 256; i += 2) pairs.push([colorMap[raw[i]], colorMap[raw[i + 1]]]);
  return { colorMap, pairs };
}

export class TsumoQueue {
  private pairs: [Color, Color][];
  constructor(readonly seed: number, colors: 3 | 4 | 5) { this.pairs = generateTsumo(seed, colors).pairs; }
  get(index: number): [Color, Color] { return this.pairs[index % 128]; }
}
```
`types.ts`: `export type Color = 0|1|2|3|4|5|6; export const EMPTY = 0, GARBAGE = 6;`

- [ ] **Step 5: テストが通るのを確かめる** — 同じコマンドで PASS
- [ ] **Step 6: コミット** — `git add -A && git commit -m "feat: 土台と eスポ互換の配ぷよ生成"`（`node_modules` と `dist` は `.gitignore` に入れる）

---

### Task 2: 盤面と得点

**Files:**
- Create: `src/engine/field.ts`, `src/engine/score.ts`
- Test: `tests/engine/field.test.ts`, `tests/engine/score.test.ts`

**Interfaces:**
- Consumes: `Color`, `EMPTY`, `GARBAGE`
- Produces:
  - `const COLS = 6, ROWS = 14, VISIBLE = 12, HIDDEN_ROW = 13`（段は 1 始まり、下が 1）
  - `class Field { get(x: number, y: number): Color; set(x,y,c); clone(): Field; height(x): number; static fromStrings(rows: string[]): Field /*上の段から、'.RGBYPO'*/; toStrings(): string[] }`（x は 1..6）
  - `findGroups(f: Field): { cells: [number, number][]; color: Color }[]`（4 個以上・1..12 段だけ）
  - `clearGroups(f, groups): void`（隣接するおじゃまも消す）
  - `applyGravity(f): { maxDrop: number }`（14 段目に残ったぷよはこのとき消す）
  - `chainStepScore(chain: number, groups: {cells, color}[]): number`
  - `CHAIN_BONUS: number[]`, `GROUP_BONUS(size)`, `COLOR_BONUS: number[]`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// tests/engine/field.test.ts
import { describe, it, expect } from 'vitest';
import { Field, findGroups, clearGroups, applyGravity } from '../../src/engine/field';

describe('Field', () => {
  it('4個つながると消える。13段目は数えない', () => {
    const f = Field.fromStrings([
      // 14段目から1段目まで、14行
      '......', 'R.....', 'R.....', 'R.....', '......', '......', '......',
      '......', '......', '......', '......', '......', '......', '......',
    ]);
    // 13,12,11 段目に R が3個（13段目は対象外）→ 1..12 段にあるのは2個
    expect(findGroups(f)).toEqual([]);
  });
  it('連結判定とおじゃまの巻き込み', () => {
    const f = Field.fromStrings([...Array(10).fill('......'), '......', 'O.....', 'RR....', 'RRO...']);
    const g = findGroups(f);
    expect(g).toHaveLength(1);
    expect(g[0].cells).toHaveLength(4);
    clearGroups(f, g);
    expect(f.toStrings().slice(-3)).toEqual(['......', '......', '......']);
  });
  it('落下は最大段数を返し、14段目に残ったぷよは消える', () => {
    const f = Field.fromStrings(['G.....', ...Array(10).fill('......'), 'R.....', '......', '......']);
    const { maxDrop } = applyGravity(f);
    expect(maxDrop).toBe(2);
    expect(f.get(1, 1)).toBe(1); // R
    expect(f.get(1, 14)).toBe(0); // 14段目の G は消えた
  });
});
```
（`applyGravity` は「設置後に14段目へ残ったぷよを消してから落とす」。原作では14段目は回転用で、設置後に残らない前提。テストの G は 14 段目に直置きしたケース）

```ts
// tests/engine/score.test.ts
import { it, expect } from 'vitest';
import { chainStepScore } from '../../src/engine/score';
const g = (n: number, color = 1) => ({ cells: Array.from({ length: n }, (_, i) => [1, i + 1] as [number, number]), color });
it('1連鎖4個は 40 点', () => expect(chainStepScore(1, [g(4)])).toBe(40));
it('2連鎖4個は 4*10*8 = 320 点', () => expect(chainStepScore(2, [g(4)])).toBe(320));
it('連結・色数ボーナス', () => expect(chainStepScore(1, [g(5, 1), g(4, 2)])).toBe(9 * 10 * (2 + 3)));
it('19連鎖の上限', () => expect(chainStepScore(19, [g(4)])).toBe(4 * 10 * 512));
it('11個以上は連結ボーナス 10', () => expect(chainStepScore(1, [g(12)])).toBe(12 * 10 * 10));
```

- [ ] **Step 2: 落ちるのを確かめる** — `npx vitest run tests/engine` → FAIL
- [ ] **Step 3: 実装する**

`field.ts`: `Uint8Array(6*14)`、`idx = (y-1)*6 + (x-1)`。`findGroups` は 1..12 段の色ぷよ（1..5）から BFS、4 個以上を返す（返す順は左下から走査した順）。`clearGroups` は各グループのセルを消し、その上下左右（1..12 段）にあるおじゃまも消す。`applyGravity` は最初に 14 段目を空にし、列ごとに下から詰め、各ぷよの落下段数の最大を返す。

`score.ts`:
```ts
export const CHAIN_BONUS = [0, 8, 16, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 480, 512];
export const COLOR_BONUS = [0, 0, 3, 6, 12, 24];
export const GROUP_BONUS = (n: number) => (n >= 11 ? 10 : [0, 0, 0, 0, 0, 2, 3, 4, 5, 6, 7][n]);
export function chainStepScore(chain: number, groups: { cells: unknown[]; color: number }[]): number {
  const count = groups.reduce((s, g) => s + g.cells.length, 0);
  const colors = new Set(groups.map((g) => g.color)).size;
  const bonus = CHAIN_BONUS[Math.min(chain, 19) - 1] + groups.reduce((s, g) => s + GROUP_BONUS(g.cells.length), 0) + COLOR_BONUS[colors];
  return count * 10 * Math.min(999, Math.max(1, bonus));
}
```
- [ ] **Step 4: 通るのを確かめる** → PASS
- [ ] **Step 5: コミット** — `feat: 盤面・連結・落下と得点計算`

---

### Task 3: ツモの移動と回転

**Files:**
- Create: `src/engine/piece.ts`, `src/engine/rules/tsu.ts`
- Test: `tests/engine/piece.test.ts`

**Interfaces:**
- Consumes: `Field`, `Color`
- Produces:
  - `type Dir = 0|1|2|3`（子ぷよの向き。0=上, 1=右, 2=下, 3=左）
  - `interface PieceState { x: number; y: number /*軸の段。半段は .5*/; dir: Dir; colors: [Color, Color] /*[軸, 子]*/ }`
  - `childPos(p): [number, number]`
  - `canPlace(f, x, y, dir): boolean`（両方のセルが 1..6 列・1 段以上・空き。y は切り上げで判定。14 段目までは入れる）
  - `tryMove(f, p, dx): PieceState | null`
  - `tryRotate(f, p, turn: 1 | -1, quickArmed: boolean): { piece: PieceState; quickTurn: boolean } | null`（壁蹴り＝横に1マス押し出し、床蹴り＝上に1段押し上げ。左右両方ふさがりで子が上下にしか行けないときは、1回目は `quickTurn:false` で null を返して `quickArmed` を立て、2回目で 180 度回す）
  - `TSU`（rules/tsu.ts）: `{ GRAVITY_FRAMES: 16, SOFT_DROP_FRAMES: 2, DAS: 8, ARR: 2, LOCK_DELAY: 32, MAX_FLOOR_KICKS: 8, FIRST_SPAWN_EXTRA: 7, CLEAR_FRAMES: 55, DROP_BASE: 25, DROP_PER_ROW: 2, CHIGIRI_EXTRA: [0,19,24,28,31,34,37,40,42,44,46,48], SPAWN_X: 3, SPAWN_Y: 12 }`

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, it, expect } from 'vitest';
import { Field } from '../../src/engine/field';
import { tryMove, tryRotate, type PieceState } from '../../src/engine/piece';
const empty = () => Field.fromStrings(Array(14).fill('......'));
const P = (x: number, y: number, dir: 0 | 1 | 2 | 3): PieceState => ({ x, y, dir, colors: [1, 2] });

describe('piece', () => {
  it('6列目で右回転すると壁蹴りで5列目に寄る', () => {
    const r = tryRotate(empty(), P(6, 10, 0), 1, false)!;
    expect(r.piece).toMatchObject({ x: 5, dir: 1 });
  });
  it('床で下向きに回すと1段押し上がる', () => {
    const r = tryRotate(empty(), P(3, 1, 1), 1, false)!;
    expect(r.piece).toMatchObject({ x: 3, y: 2, dir: 2 });
  });
  it('両側ふさがりは2回押しでクイックターン', () => {
    const f = Field.fromStrings([...Array(4).fill('......'), ...Array(10).fill('RR.RRR')]);
    const p = P(3, 11, 0);
    expect(tryRotate(f, p, 1, false)).toBeNull();
    const r = tryRotate(f, p, 1, true)!;
    expect(r.quickTurn).toBe(true);
    expect(r.piece.dir).toBe(2);
    expect(r.piece.y).toBe(12); // 子が下（11段目）、軸は12段目
  });
  it('壁の外には動かない', () => {
    expect(tryMove(empty(), P(1, 10, 0), -1)).toBeNull();
    expect(tryMove(empty(), P(1, 10, 0), 1)).toMatchObject({ x: 2 });
  });
  it('14段目までは回せるが15段目には行かない', () => {
    expect(tryRotate(empty(), P(3, 13, 3), 1, false)!.piece.dir).toBe(0); // 子が14段目
    expect(tryRotate(empty(), P(3, 14, 3), 1, false)).not.toBeNull(); // 押し下げはしないので壁蹴り/床蹴り不要の向きは可
  });
});
```
（最後のケースは「15段目に子が出る向きは不可。その場合は回転失敗」で書き直してよい。実装時に原作挙動 = 天井は 14 段目、で確定させる）

- [ ] **Step 2: 落ちるのを確かめる**
- [ ] **Step 3: 実装する** — 回転の候補順: その場 → 壁蹴り（子がぶつかる方向と逆へ 1 マス）→ 床蹴り（子が下向きのとき上へ 1 段）。全部だめで、左右が両方ふさがっていて回転が上下方向（dir 0↔2）にしかならないときはクイックターン。`canPlace` は 15 段目以上のセルを不可にする。
- [ ] **Step 4: 通るのを確かめる**
- [ ] **Step 5: コミット** — `feat: ツモの移動・回転・壁蹴り・クイックターン`

---

### Task 4: プレイヤーの状態機械とフレームの正確さ

**Files:**
- Create: `src/engine/events.ts`, `src/engine/player.ts`
- Test: `tests/engine/player.test.ts`, `tests/engine/timing.test.ts`

**Interfaces:**
- Consumes: Task 1〜3 のすべて
- Produces:
  - `interface FrameInput { left: boolean; right: boolean; down: boolean; rotL: boolean /*押した瞬間*/; rotR: boolean /*押した瞬間*/ }`（left/right/down は押しっぱなし状態。DAS/ARR はエンジン側で処理する）
  - `type Phase = 'spawnWait' | 'control' | 'chigiri' | 'clear' | 'fall' | 'garbage' | 'dead'`
  - `type EngineEvent = { t: 'spawn'; index: number } | { t: 'move' } | { t: 'rotate'; quick: boolean } | { t: 'lock'; cells: { x: number; y: number; c: Color }[] } | { t: 'chigiri'; drops: number } | { t: 'clear'; chain: number; groups: { cells: [number, number][]; color: Color }[]; score: number } | { t: 'fall'; maxDrop: number } | { t: 'allClear' } | { t: 'chainEnd'; chain: number } | { t: 'dead' }`
  - `class Player { constructor(opts: { seed: number; colors?: 3|4|5; rules?: typeof TSU }); field: Field; piece: PieceState | null; phase: Phase; phaseFrame: number; frame: number; score: number; chain: number; tsumoIndex: number; events: EngineEvent[]; step(input: FrameInput): void; next(n: 1 | 2): [Color, Color]; snapshot(): PlayerSnapshot; restore(s: PlayerSnapshot): void }`
  - `type PlayerSnapshot`（構造化クローン可能なプレーンオブジェクト）

**フレームのモデル**（`timing.test.ts` で守る値。実測は puyo-camp.jp/posts/71019）
- ツモ出現から次のツモ出現まで（ちぎりなし・消去なし、最速入力）= `28 + 2×(12 − 軸の段) + 2×|軸の列 − 3|`
- 1手目だけ +7
- ちぎりがあれば `CHIGIRI_EXTRA[段差]` を足す
- 連鎖があれば1連鎖ごとに `55`（落下なし）または `80 + 2×(最大落下段数 − 1)` を足す
- 最速入力 = 1フレーム目から下を押しっぱなし、横移動はタップを 2F ごと（押す→離す→押す）。横移動した次のフレームは落下しない（これで「列 1 つにつき +2F」になる）
- `28` の内訳は「設置の確定までと、次のツモが出るまで」の合計。実装で定数（`LOCK_ANIM_FRAMES` と `NEXT_DELAY`）に分け、テストに合わせて決める

- [ ] **Step 1: 失敗するテストを書く**

```ts
// tests/engine/timing.test.ts
import { describe, it, expect } from 'vitest';
import { Player } from '../../src/engine/player';
import { Field } from '../../src/engine/field';
import type { FrameInput } from '../../src/engine/player';

const idle: FrameInput = { left: false, right: false, down: false, rotL: false, rotR: false };

/** 軸を targetX へ運んで落とし、次の spawn イベントまでのフレーム数を返す */
function framesToNextSpawn(p: Player, targetX: number): number {
  const start = p.frame;
  let tap = false;
  for (let i = 0; i < 2000; i++) {
    const cur = p.piece;
    const dx = cur ? targetX - cur.x : 0;
    tap = !tap;
    p.step({ ...idle, down: true, left: dx < 0 && tap, right: dx > 0 && tap });
    if (p.events.some((e) => e.t === 'spawn')) return p.frame - start;
  }
  throw new Error('spawn しなかった');
}

function playerWithStack(heights: number[]): Player {
  const p = new Player({ seed: 0 });
  // 2手目以降で測るので 1 手進めてから盤面を差し替える
  framesToNextSpawn(p, 3);
  const rows = Array.from({ length: 14 }, (_, r) => {
    const y = 14 - r;
    return heights.map((h, i) => (y <= h ? 'OOOOOO'[i] : '.')).join('');
  });
  p.field = Field.fromStrings(rows);
  return p;
}

describe('設置フレーム（実測）', () => {
  it('3列目12段目に置く = 28F', () => {
    const p = playerWithStack([0, 0, 11, 0, 0, 0]);
    expect(framesToNextSpawn(p, 3)).toBe(28);
  });
  it('3列目1段目 = 50F', () => {
    expect(framesToNextSpawn(playerWithStack([0, 0, 0, 0, 0, 0]), 3)).toBe(50);
  });
  it('6列目1段目 = 56F', () => {
    expect(framesToNextSpawn(playerWithStack([0, 0, 0, 0, 0, 0]), 6)).toBe(56);
  });
  it('1手目は +7F', () => {
    const p = new Player({ seed: 0 });
    expect(framesToNextSpawn(p, 3)).toBe(57);
  });
});

describe('ちぎりと連鎖のフレーム', () => {
  it('段差1のちぎりは +19F', () => {
    // 3列目だけ1段高い盤面で横向きに置く → 4列目の子が1段ちぎれる
    const p = playerWithStack([0, 0, 1, 0, 0, 0]);
    p.piece = { ...p.piece!, dir: 1 };
    expect(framesToNextSpawn(p, 3)).toBe(28 + 2 * 10 + 19);
  });
  it('1連鎖（落下なし）は +55F', () => {
    const p = playerWithStack([0, 0, 0, 0, 0, 0]);
    // 3列目に同色を2個積んでおき、同色ツモを縦に置いて4個消す
    const [a] = p.next(1);
    p.field.set(3, 1, a); p.field.set(3, 2, a);
    p.piece = { ...p.piece!, colors: [a, a] };
    expect(framesToNextSpawn(p, 3)).toBe(28 + 2 * 8 + 55);
  });
});
```

```ts
// tests/engine/player.test.ts
import { it, expect } from 'vitest';
import { Player } from '../../src/engine/player';
import { Field } from '../../src/engine/field';
const idle = { left: false, right: false, down: false, rotL: false, rotR: false };

it('同じシード・同じ入力なら同じ結果（決定性）', () => {
  const run = () => {
    const p = new Player({ seed: 42 });
    for (let i = 0; i < 3000; i++) p.step({ ...idle, down: i % 3 === 0, left: i % 50 < 3, rotR: i % 40 === 0 });
    return JSON.stringify(p.snapshot());
  };
  expect(run()).toBe(run());
});
it('窒息点が埋まっていると負け', () => {
  const p = new Player({ seed: 1 });
  p.field = Field.fromStrings(['......', '......', ...Array(12).fill('..O...')]);
  for (let i = 0; i < 400 && p.phase !== 'dead'; i++) p.step({ ...idle, down: true });
  expect(p.phase).toBe('dead');
});
it('snapshot / restore で1手戻せる', () => {
  const p = new Player({ seed: 3 });
  const s = p.snapshot();
  for (let i = 0; i < 200; i++) p.step({ ...idle, down: true });
  p.restore(s);
  expect(JSON.stringify(p.snapshot())).toBe(JSON.stringify(s));
});
it('左右同時押しは動かない', () => {
  const p = new Player({ seed: 3 });
  for (let i = 0; i < 10; i++) p.step(idle);
  const x = p.piece!.x;
  for (let i = 0; i < 20; i++) p.step({ ...idle, left: true, right: true });
  expect(p.piece!.x).toBe(x);
});
it('128手を超えてもツモがループして続く', () => {
  const a = new Player({ seed: 5 }), b = new Player({ seed: 5 });
  a.tsumoIndex = 300; b.tsumoIndex = 300 - 256;
  expect(a.next(1)).toEqual(b.next(1));
  expect(a.next(2)).toEqual(b.next(2));
});
```

- [ ] **Step 2: 落ちるのを確かめる**
- [ ] **Step 3: 実装する** — `step` の中身:
  1. `events = []`、`frame++`
  2. phase ごとの処理。`control` では (a) 回転（押した瞬間）→ (b) 横移動（押した瞬間に 1 マス、`DAS` フレーム押し続けたら以後 `ARR` ごと。左右同時は無視）→ (c) 落下（横移動したフレームは落下しない。`down` なら `SOFT_DROP_FRAMES` ごとに 1 段＋落下ボーナス 1 点、そうでなければ `GRAVITY_FRAMES` ごと）→ (d) 接地判定（`down` なら即固定、そうでなければ `LOCK_DELAY` で固定。床蹴りが `MAX_FLOOR_KICKS` に達したら即固定）
  3. 固定 → `lock` イベント → 段差があれば `chigiri` に `CHIGIRI_EXTRA[段差]` フレーム → 消去判定 → グループがあれば `clear`（`CLEAR_FRAMES`）→ `applyGravity` → `fall`（`DROP_BASE + DROP_PER_ROW*(maxDrop-1)`、0 なら 0）→ 消去判定に戻る
  4. 連鎖が終わったら `chainEnd`、全消しなら `allClear`、`garbage` フェーズ（①では何もしない、②で使う）→ 窒息点チェック → `spawnWait` → `spawn`
  5. タイミング定数は `timing.test.ts` が通るように決めて `rules/tsu.ts` に書く
- [ ] **Step 4: 全テストが通るのを確かめる** — `npm test`
- [ ] **Step 5: コミット** — `feat: プレイヤーの状態機械（実測フレームに一致）`

---

### Task 5: ゲームループとキーボード入力

**Files:**
- Create: `src/ui/loop.ts`, `src/input/keyboard.ts`, `src/settings.ts`
- Test: `tests/ui/loop.test.ts`

**Interfaces:**
- Consumes: `FrameInput`
- Produces:
  - `class FixedLoop { constructor(step: () => void, render: (alpha: number) => void); tick(nowMs: number): void /*requestAnimationFrame から呼ぶ*/; reset(nowMs: number): void }`（1/60 秒ごとに `step`、1 回の tick で最大 30 回まで。余りは捨てる。`alpha` は 0..1）
  - `class Keyboard { constructor(target: Window, binds: KeyBinds); sample(): FrameInput /*押した瞬間フラグは sample のたびにリセット*/; dispose(): void }`
  - `interface KeyBinds { left: string[]; right: string[]; down: string[]; rotL: string[]; rotR: string[]; pause: string[]; undo: string[]; restart: string[] }`（`KeyboardEvent.code`）
  - `loadSettings(): Settings; saveSettings(s: Settings): void`、`Settings = { binds: KeyBinds; das: number; arr: number; volume: number; colorMarks: boolean }`。初期値: 左右 `ArrowLeft/ArrowRight`、下 `ArrowDown`、回転 `KeyZ`(左) / `KeyX`(右)、ポーズ `Escape`、1手戻す `KeyU`、やり直し `KeyR`。localStorage が使えなくても初期値で動く

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { it, expect } from 'vitest';
import { FixedLoop } from '../../src/ui/loop';
it('1/60秒ごとに step し、余りを alpha で渡す', () => {
  let steps = 0, alpha = -1;
  const l = new FixedLoop(() => steps++, (a) => (alpha = a));
  l.reset(0);
  l.tick(1000 / 60 * 2.5);
  expect(steps).toBe(2);
  expect(alpha).toBeCloseTo(0.5, 5);
});
it('大きく時間が飛んでも 30 フレームまでしか進めない', () => {
  let steps = 0;
  const l = new FixedLoop(() => steps++, () => {});
  l.reset(0);
  l.tick(10_000);
  expect(steps).toBe(30);
  l.tick(10_000 + 1000 / 60);
  expect(steps).toBe(31);
});
```
- [ ] **Step 2: 落ちるのを確かめる**
- [ ] **Step 3: 実装する**（`Keyboard` は `keydown`（`repeat` は無視）/`keyup` と `blur`（全部離したことにする）を見る。ゲームに使うキーは `preventDefault`）。DAS/ARR は `Player` の `rules` に `settings.das/arr` を渡して反映する
- [ ] **Step 4: 通るのを確かめる**
- [ ] **Step 5: コミット** — `feat: 固定ステップのゲームループとキーボード入力`

---

### Task 6: ぷよの質感（テクスチャ生成）

**Files:**
- Create: `src/render/puyoTextures.ts`
- 確認: ブラウザでテクスチャ一覧のデバッグ画面（`?debug=puyo`）を出して目で見る

**Interfaces:**
- Produces: `class PuyoTextures { static async create(renderer: Renderer, cell: number): Promise<PuyoTextures>; get(color: Color, links: number /*bit0=上,1=右,2=下,3=左*/): Texture; eyes(color: Color): Texture }`

- [ ] **Step 1: 描き方を実装する** — 1 マス `cell`px（基準 64px）。各テクスチャは `Graphics` で描いて `renderer.generateTexture` で焼く
  - 本体: 色の丸（半径 0.46cell）。`links` の方向は、隣のマスの端まで同じ色の帯（幅 0.62cell）で伸ばして溶け合わせる
  - 縁: 本体より暗い色で 0.04cell の外周
  - 影: 下半分にうっすら暗いグラデーション（`FillGradient` の縦グラデーション）
  - ツヤ: 左上に白の楕円（不透明度 0.75）と、その右下に小さい白い点。全体の上部に白→透明の弱いグラデーション
  - 目: 白目の楕円 2 つ＋黒目（丸）。原作の目とは違う形（縦長の白目に丸い黒目、まゆなし）。テクスチャを分けて、アニメで目だけ動かせるようにする
  - おじゃま: 半透明の乳白色、目は黒い点 2 つ
  - 色（基準）: 赤 `#f2384a`、緑 `#3fd14a`、青 `#2f7cf2`、黄 `#f7cf2a`、紫 `#a54ce8`、おじゃま `#e8ecf2`
- [ ] **Step 2: `?debug=puyo` で 5 色 × 16 パターン＋おじゃまを並べる画面を作り、ブラウザで確認してスクリーンショットを撮る**
- [ ] **Step 3: コミット** — `feat: ぷよのテクスチャ（ツヤ・影・連結）`

---

### Task 7: 盤面の描画とアニメーション

**Files:**
- Create: `src/render/fieldView.ts`, `src/render/anim.ts`
- Test: `tests/render/anim.test.ts`（イージングとバウンドの計算だけ。PixiJS は使わない）

**Interfaces:**
- Consumes: `Player`（読み取りのみ）、`EngineEvent`、`PuyoTextures`
- Produces:
  - `class FieldView extends Container { constructor(tex: PuyoTextures, cell: number); update(p: Player, events: EngineEvent[]): void /*step ごと*/; render(alpha: number): void /*描画フレームごと*/ }`
  - `anim.ts`: `squash(t: number): { sx: number; sy: number }`（t=0..1、設置のつぶれ→戻り。0 で 1,1、0.25 付近で sx≈1.18, sy≈0.8、1 で 1,1）、`bounce(t: number): number`（着地後の上下オフセット、0 と 1 で 0）

- [ ] **Step 1: `anim.test.ts` を書く**

```ts
import { it, expect } from 'vitest';
import { squash, bounce } from '../../src/render/anim';
it('squash は最初と最後が 1、途中で横に広がる', () => {
  expect(squash(0)).toEqual({ sx: 1, sy: 1 });
  expect(squash(1)).toEqual({ sx: 1, sy: 1 });
  const m = squash(0.25);
  expect(m.sx).toBeGreaterThan(1.1);
  expect(m.sy).toBeLessThan(0.9);
});
it('bounce は 0 と 1 で 0', () => {
  expect(bounce(0)).toBe(0);
  expect(bounce(1)).toBeCloseTo(0, 5);
});
```
- [ ] **Step 2: 落ちるのを確かめてから実装する**
- [ ] **Step 3: FieldView を実装する**
  - 盤面のぷよはスプライトで、連結はエンジンの盤面から毎 step 計算する（13 段目は連結表示しない）
  - 操作中のツモは前回位置と今の位置を `alpha` で補間して描く（なめらかな落下・横移動・回転）。回転は軸を中心に子ぷよを円弧で動かす（4F）
  - `lock` → 置いたぷよに squash（8F）。`fall` / `chigiri` → 落ちる途中を補間して描き、着地で bounce と squash。上のぷよほど 1F ずつ遅らせる
  - `clear` → 消えるぷよを点滅（前半）→ 膨らんで消える（後半）＋粒子 8 個。消えた位置に「n連鎖」の文字
  - 12 段目より上（13・14 段目）は枠の外として半分隠す
  - 窒息点（3 列目 12 段目）に×印
- [ ] **Step 4: コミット** — `feat: 盤面の描画と、設置・落下・消去のアニメーション`

---

### Task 8: 画面レイアウト・背景・HUD・効果音

**Files:**
- Create: `src/render/layout.ts`, `src/render/background.ts`, `src/render/hud.ts`, `src/audio/sfx.ts`

**Interfaces:**
- Produces:
  - `layout.ts`: `const BASE_W = 1920, BASE_H = 1080; fitStage(stage: Container, w: number, h: number): void`（全体を縮小・拡大してレターボックス）、`soloLayout(): { field: {x,y}; next: {x,y}; next2: {x,y}; score: {x,y}; cell: number }`
  - `background.ts`: `makeBackground(rule: 'tsu' | 'fever'): Container`、`makeFrame(rule, cell): Container`（フィールド枠）
  - `hud.ts`: `class Hud extends Container { setNext(a: [Color,Color], b: [Color,Color]): void; setScore(n: number): void; showChain(n: number, x: number, y: number): void }`
  - `sfx.ts`: `class Sfx { constructor(volume: number); move(); rotate(); lock(); chain(n: number); allClear(); lose(); setVolume(v) }`（Web Audio の OscillatorNode で生成。最初のキー入力で AudioContext を resume）

- [ ] **Step 1: レイアウトを実装する** — 設計書 §6.3 の値を使う。1 マス 64px、フィールド内寸 384×768。ひとり練習は 2 人対戦の 1P 側の配置（フィールド中心が画面幅 25%、y≈165〜885、NEXT/NEXT2 は内側に段違い、スコアは 8 桁で y≈920）。2P 側の場所に練習情報パネル（シード・手数・操作ヘルプ）
- [ ] **Step 2: 背景と枠** — 通: 森のような屋外（奥に木のシルエット、木漏れ日の光の粒がゆっくり動く）。フィーバー: スタジアム（暗い背景にスポットライトの光の帯と観客の光の点）。枠は少し傾いたカード形で、1P 青・2P 赤ピンク、内側に模様の帯。フィールドの中は暗い単色に薄い模様。どちらもオリジナルの絵柄を Graphics で描く
- [ ] **Step 3: HUD と効果音** — スコアは右寄せの数字（等幅の太字）。連鎖表示は連鎖数で大きく、色を変える
- [ ] **Step 4: ブラウザで確認してスクリーンショット**
- [ ] **Step 5: コミット** — `feat: レイアウト・背景・枠・HUD・効果音`

---

### Task 9: 画面遷移とひとり練習モード

**Files:**
- Create: `src/ui/app.ts`, `src/ui/screens/title.ts`, `src/ui/screens/solo.ts`, `src/ui/screens/settings.ts`, `src/main.ts`
- Test: `tests/ui/practice.test.ts`（履歴の積み方だけ）

**Interfaces:**
- Consumes: ここまでのすべて
- Produces:
  - `class PracticeHistory { push(s: PlayerSnapshot): void; pop(): PlayerSnapshot | undefined; clear(): void }`（最大 200 手）
  - `interface Screen { enter(app: App): void; leave(): void }`、`App.go(screen: Screen)`

- [ ] **Step 1: `PracticeHistory` のテストを書いて実装する**

```ts
import { it, expect } from 'vitest';
import { PracticeHistory } from '../../src/ui/screens/solo';
it('最大200手まで覚えて、古いものから捨てる', () => {
  const h = new PracticeHistory();
  for (let i = 0; i < 205; i++) h.push({ i } as any);
  let n = 0;
  while (h.pop()) n++;
  expect(n).toBe(200);
});
```
（`PracticeHistory` は DOM・PixiJS に依存しない別ファイル `src/ui/practiceHistory.ts` に置き、solo.ts から re-export する）

- [ ] **Step 2: 画面を作る**
  - タイトル: ロゴ風の文字「ぷよぷよ eスポーツ 練習場」（オリジナルの書体表現）、メニュー「ひとり練習」「CPU対戦（準備中）」「オンライン（準備中）」「設定」。キーボードの上下＋決定（Enter/X）で選ぶ
  - ひとり練習: 開始時にシード（0〜65535、空ならランダム）と色数（3/4/5、初期値 4）を選ぶ。プレイ中 `U` で1手戻す（spawn のたびに snapshot を積む）、`R` で同じシードを最初から、`Esc` でポーズメニュー
  - 設定: キー割り当て（押したキーを登録）、DAS・ARR（フレーム数）、音量、色のマーク表示
- [ ] **Step 3: `npm run check` が通るのを確かめる**
- [ ] **Step 4: ブラウザで最初から最後まで遊んで確認する**（連鎖、全消し、窒息、1手戻す、やり直し、設定変更が効くこと）。スクリーンショットを撮る
- [ ] **Step 5: コミット** — `feat: タイトル・設定・ひとり練習モード`

---

### Task 10: 公開

**Files:**
- Create: `.github/workflows/deploy.yml`, `README.md`

- [ ] **Step 1: GitHub Actions** — main に push したら `npm ci && npm run check`、`dist` を GitHub Pages に公開（前作 `~/puzzle-battle/.github/workflows` と同じ形）
- [ ] **Step 2: README** — 遊び方、キー操作、開発の始め方（`npm install` → `npm run dev`）、著作権の注意（ファンメイド・非公式、SEGA の素材は使っていない）
- [ ] **Step 3: コミット**
- [ ] **Step 4: GitHub のリポジトリ作成と push はユーザーに確認してから行う**（外部への公開になるため）
