# サブプロジェクト② 対戦の仕組み＋CPU 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 通ルールで CPU と先取制の対戦ができるようにする（おじゃま・相殺・マージンタイム・予告表示・勝敗・5段階の CPU）。

**Architecture:** おじゃまの計算と予告は `Player` が持ち、送り先の振り分け・レート・勝敗は新しい `Match` が持つ（どちらも `src/engine`、決定的）。CPU は `src/ai` の純粋な思考関数（盤面 → 置き場所）と、思考結果を1フレームずつのキー入力に変える `CpuController`。思考は Web Worker で動かす。画面は `ui/screens/cpuSetup.ts` と `ui/screens/versus.ts`。

**Tech Stack:** TypeScript, Vitest, PixiJS v8, Web Worker（Vite の `?worker`）

**Spec:** `docs/superpowers/specs/2026-10-09-puyo-esports-practice-design.md`（§4.6 おじゃま、§4.7 マージンタイム、§4.9 試合、§6 見た目、§7 CPU）

## Global Constraints

- `src/engine` と `src/ai/think.ts` は DOM・PixiJS を import しない。`Math.random` を使わない（CPU のミスの抽選は `CpuController` に渡す乱数関数で行う）
- レート初期値 70、マージンタイム 96 秒から 16 秒ごと（1 回目 ×0.75、以降 ÷2、切り捨て、14 回目かレート 1 で停止）
- 1 回に降るおじゃまは最大 30 個。6 の倍数ぶんは全列に均等、端数は別々の列に 1 個ずつ（試合シードから作った乱数）
- 予告: 小=1, 大=6, 岩=30, 星=180, 月=360, 王冠=720, 彗星=1440。大きい単位から最大 6 個表示
- 全消しは次の連鎖の最初の 1 連鎖目に +30 個
- おじゃまが降るのは、送った側の連鎖が終わって「確定」した分だけ、受け手が次のツモを出す直前
- UI の文言は日本語。SEGA の素材は使わない

## Review Focus

1. **相殺のタイミング**: 自分の連鎖中に相手の攻撃が届いたとき、続く連鎖で相殺され、余りが相手に飛ぶこと（どちらも予告が負にならない）
2. **確定前のおじゃま**: 相手の連鎖が終わる前に置いた手では、そのおじゃまは降らない（原作の挙動）
3. **大量のおじゃま**: 30 個を超える予告は 30 個ずつ、ターンごとに降る。窒息点まで埋まったら負け
4. **同時に負け**: 同じフレームに両方が窒息したら引き分けで、勝ち数は増えない
5. **CPU の思考が重いとき**: 思考が遅れてもゲームが止まらない（間に合わなければ自然落下で置かれる）

---

## ファイル構成

```
src/engine/
  garbage.ts        予告アイコンの分解、降る列の決定、降る時間
  rules/tsu.ts      レート・マージン・おじゃまの定数を追加
  player.ts         おじゃま（攻撃量の計算・相殺・受け取り・落下）を追加
  match.ts          Match（2〜4人の進行、送り先、レート、勝敗）
src/ai/
  think.ts          置き場所の列挙・連鎖シミュレーション・評価・ビームサーチ
  cpuController.ts  思考結果 → 1フレームずつの FrameInput、強さ設定
  worker.ts         Web Worker（think を呼ぶだけ）
src/render/
  garbageIcons.ts   予告アイコンのテクスチャ（オリジナルの絵）
  garbageQueue.ts   予告の表示
  fieldView.ts      おじゃま落下のアニメを追加
  layout.ts         （変更なし。versusSide を使う）
src/ui/screens/
  cpuSetup.ts       強さ・先取数を選ぶ
  versus.ts         2人対戦画面（カウントダウン・勝敗・先取）
  title.ts          「CPU 対戦」を有効にする
tests/engine/garbage.test.ts, tests/engine/versus.test.ts, tests/engine/match.test.ts, tests/ai/think.test.ts, tests/ai/cpuController.test.ts
```

---

### Task 1: おじゃまの道具（予告アイコン・降る列・時間）とレート

**Files:** Create `src/engine/garbage.ts`; Modify `src/engine/rules/tsu.ts`; Test `tests/engine/garbage.test.ts`

**Interfaces:**
- Produces:
  - `type IconKind = 'small' | 'large' | 'rock' | 'star' | 'moon' | 'crown' | 'comet'`
  - `queueIcons(n: number, max = 6): IconKind[]`（大きい単位から）
  - `dropColumns(n: number, rng: Lcg): number[]`（長さ 6、各列に降る個数。n は 30 以下）
  - `garbageFallFrames(columns: number[], heights: number[]): number`（列ごとの着地 F の最大＋硬直）
  - `marginRate(baseRate: number, frame: number, rules): number`
  - `TSU` に追加: `RATE: 70, MARGIN_START_FRAMES: 96*60, MARGIN_STEP_FRAMES: 16*60, MAX_GARBAGE_DROP: 30, ALL_CLEAR_BONUS: 30, GARBAGE_LAND_FRAMES: [60,59,64,56,62,58], GARBAGE_STUN: [...]`

テスト（抜粋。全部書く）:
```ts
expect(queueIcons(0)).toEqual([]);
expect(queueIcons(7)).toEqual(['large', 'small']);
expect(queueIcons(37)).toEqual(['rock', 'large', 'small']);
expect(queueIcons(1440 + 720 + 5)).toEqual(['comet', 'crown', 'small', 'small', 'small', 'small']);
const cols = dropColumns(14, new Lcg(1)); // 12 は均等に 2 個ずつ、端数 2 は別々の列に
expect(cols.reduce((a, b) => a + b)).toBe(14);
expect(cols.filter((c) => c === 3)).toHaveLength(2);
expect(marginRate(70, 96 * 60 - 1, TSU)).toBe(70);
expect(marginRate(70, 96 * 60, TSU)).toBe(52);
// 表: 70→52→35→26→17→13→8→6→4→3→2→1、以後 1
```
- マージンのレート列は設計書 §4.7 の擬似コード。1 回目 `floor(rate*3/4)`、2 回目以降「1 つ前のレート ÷ 2」…ではなく表 `70,52,35,26,17,13,8,6,4,3,2,1` と一致させる（実装: 2 回目以降は 2 つ前のレートの半分 = 原作の擬似コード。テストで表と一致を確認）
- 硬直 F: 8 個以下 0、9 個 1 … 18 個 15、30 個 25（間は線形補間で丸め）

- [ ] 失敗するテスト → 実装 → 通る → コミット `feat: おじゃまの予告アイコン・降る列・マージンタイム`

---

### Task 2: Player のおじゃま（攻撃量・相殺・受け取り・落下）

**Files:** Modify `src/engine/player.ts`, `src/engine/events.ts`; Test `tests/engine/versus.test.ts`

**Interfaces:**
- Produces（Player に追加）:
  - `rate: number`（Match が毎フレーム設定。初期値 `rules.RATE`）
  - `readonly garbageSeed`（コンストラクタの `garbageSeed?: number`。降る列の乱数）
  - `pendingTotal(): number`（予告の合計 = 確定分 + 未確定分）
  - `receive(from: number, n: number): void`（未確定として積む）
  - `confirm(from: number): void`（from からの未確定分を確定にする）
  - clear イベントに `attack: number`（このリンクで生まれた量）と `send: number`（相殺後に相手へ送る量）を追加
  - 新イベント `{ t: 'garbage'; count: number; drops: Drop[] }`（降ったおじゃま。drops.from は 14 段目より上を表す 15〜19）
- 計算: リンクごとに `total = score + (最初のリンクなら softDropScore) + leftover`、`attack = floor(total / rate)`、`leftover = total - attack*rate`。全消しの次の連鎖は最初のリンクに +30。`offset = min(attack, pendingTotal)` を確定分から先に減らし、`send = attack - offset`
- 降る: ターン終了時（`resolve` で連鎖がないか終わったとき）に確定分が 1 以上なら、`min(確定分, 30)` を `dropColumns` で決めて盤面に置き、`garbage` フェーズで `garbageFallFrames` だけ待ってから次のツモ
- `snapshot/restore` に新しい状態を含める

テスト（抜粋）:
```ts
// 1) 確定したおじゃまは次のツモの前に降る
const p = new Player({ seed: 0 }); untilFirstSpawn(p);
p.receive(1, 6); p.confirm(1);
dropNow(p); // 下を押して置く
runUntil(p, 'spawn');
expect(countGarbage(p.field)).toBe(6);
// 2) 未確定のおじゃまは降らない
// 3) 連鎖の攻撃で予告が相殺され、余りが send に出る（4個消し 1連鎖 = 40点 / 70 = 0 個…なので盤面で 2連鎖を組む）
// 4) 端数の持ち越し: 40点(0個,端数40) → 次の 1連鎖 40点 → 80/70 = 1 個
// 5) 30 個を超える予告は 30 個だけ降り、残りは予告に残る
// 6) snapshot/restore でおじゃまの状態も戻る
```

- [ ] 失敗するテスト → 実装 → 通る（既存の timing テストも通ること）→ コミット `feat: Player のおじゃま（攻撃・相殺・受け取り・落下）`

---

### Task 3: Match（試合進行）

**Files:** Create `src/engine/match.ts`; Test `tests/engine/match.test.ts`

**Interfaces:**
- Produces:
  - `class Match { constructor(opts: { players: number; seed: number; colors?: 3|4|5; rules?: Partial<Rules> }); players: Player[]; frame: number; result: null | { winner: number | null /*null=引き分け*/ }; step(inputs: FrameInput[]): void; target(from: number): number }`
  - 全員同じ配ぷよ（同じ seed）、おじゃまの列の乱数は `seed ^ (index+1)*0x9e37`
  - `step`: frame++ → 全員の `rate = marginRate(...)` → 全員 step（負けた人は step しない）→ clear の `send` を `target(from)` の `receive` に、`chainEnd` で相手の `confirm(from)` → 生き残りが 1 人以下なら result
  - `target(from)`: 2 人なら相手。3〜4 人は「予告が一番少ない相手、同じなら盤面が一番低い相手、さらに同じなら番号の小さい相手」

テスト:
```ts
// 2 人: 片方が負けたらもう片方の勝ち、result が入ったら step しても変わらない
// 同じフレームに両方負け → winner null
// 攻撃が相手の予告に積まれ、連鎖終了で確定する
// 4 人の target 規則
// 96 秒（5760F）でレートが 52 になる
```
- [ ] 失敗するテスト → 実装 → 通る → コミット `feat: 試合進行（送り先・レート・勝敗）`

---

### Task 4: CPU の思考

**Files:** Create `src/ai/think.ts`; Test `tests/ai/think.test.ts`

**Interfaces:**
- Produces:
  - `interface Placement { x: number; dir: Dir }`
  - `reachablePlacements(field: Field): Placement[]`（出現位置 3 列目 12 段目から、横移動・回転で行ける置き方。最大 22）
  - `simulate(field: Field, pair: [Color, Color], pl: Placement): { field: Field; chain: number; score: number; dead: boolean }`（置く→ちぎり→連鎖を全部終わらせた盤面）
  - `potential(field: Field): number`（どこかの列に同じ色を 1〜2 個足したら何連鎖起きるかの最大）
  - `interface ThinkParams { depth: 1|2|3; beam: number; targetChain: number; pending: number /*自分の予告*/; enemyPending: number }`
  - `think(field: Field, pieces: [Color, Color][], params: ThinkParams): { placement: Placement; score: number }`
- 評価（大きいほど良い）: 発火（その手で起きる連鎖）が `targetChain` 以上 → 大きな加点。予告が 6 個以上来ていて、それを相殺できる連鎖 → 加点。それ以外は `potential` を主に、盤面の凸凹（隣の列との高さの差の 2 乗）、3 列目の高さ、11 段目より上、13 段目のぷよを減点。窒息は最低点

テスト:
```ts
// 置けば 4 個消える形では、消える置き方を選ぶ（targetChain=1）
// 3 列目が 11 段まで積まれた盤面では、3 列目以外に置く
// 2 連鎖が仕込まれた盤面＋targetChain=2 で、2 連鎖を撃つ置き方を選ぶ
// reachablePlacements: 空の盤面で 22 通り、2 列目と 4 列目が 13 段まであると 3 列目の 2 通り（縦向き）だけ
// depth 2、beam 8 の思考 1 回が 50ms 以内（中央値）
```
- [ ] 失敗するテスト → 実装 → 通る → コミット `feat: CPU の思考（置き場所の列挙・連鎖の見積もり・ビームサーチ）`

---

### Task 5: CPU の操作と強さ、Web Worker

**Files:** Create `src/ai/cpuController.ts`, `src/ai/worker.ts`; Test `tests/ai/cpuController.test.ts`

**Interfaces:**
- Produces:
  - `const CPU_LEVELS: { name: string; depth: 1|2|3; beam: number; stepFrames: number; mistake: number; targetChain: number; softDrop: boolean }[]`（5 段階: よわい〜つよい）
  - `type Thinker = (req: { cells: number[]; pieces: [Color,Color][]; params: ThinkParams }) => Promise<{ placement: Placement }>`
  - `syncThinker: Thinker`（テストとフォールバック用。その場で think）
  - `workerThinker(): Thinker`（Worker に投げる。作れなければ syncThinker）
  - `class CpuController { constructor(level: number, thinker: Thinker, random: () => number); input(p: Player, enemy: Player): FrameInput }`
    - spawn を見たら思考を依頼。結果が来たら「回転 → 横移動 → 落とす」の入力列を作り、`stepFrames` ごとに 1 操作ずつ出す
    - `mistake` の確率で 2 番目以降の候補…ではなく、ランダムな到達可能な置き方に変える
    - 思考が終わる前は何も押さない（自然落下で進む）

テスト:
```ts
// syncThinker の CPU（レベル 3）が、おじゃまなしで 150 手置いても負けない（seed 1..3）
// レベル 5 の CPU が 150 手のうちに 5 連鎖以上を 1 回は撃つ（seed 1）
// 出す入力は 1 フレームに回転 1 回まで、左右同時押しなし
```
- [ ] 失敗するテスト → 実装 → 通る → コミット `feat: CPU の操作・強さ・Web Worker`

---

### Task 6: 予告表示とおじゃま落下の描画

**Files:** Create `src/render/garbageIcons.ts`, `src/render/garbageQueue.ts`; Modify `src/render/fieldView.ts`

**Interfaces:**
- Produces:
  - `class GarbageIcons { constructor(px: number); get(kind: IconKind): Texture }`（オリジナルの絵: 小=小さいおじゃまぷよ、大=大きいおじゃまぷよ、岩=灰色の岩、星=黄色い星、月=三日月、王冠=王冠、彗星=尾のある星）
  - `class GarbageQueueView extends Container { constructor(icons: GarbageIcons, cell: number); set(total: number): void }`（変化したら新しいアイコンがぽよんと出る）
  - FieldView: `garbage` イベントで上から落ちてくるアニメ（列ごとに着地 F が違う）

- [ ] 実装 → ブラウザで確認（`?debug=garbage` に予告 1/7/37/200/2165 を並べる）→ コミット `feat: 予告ぷよとおじゃま落下の描画`

---

### Task 7: CPU 対戦の画面

**Files:** Create `src/ui/screens/cpuSetup.ts`, `src/ui/screens/versus.ts`; Modify `src/ui/screens/title.ts`

- cpuSetup: 「CPU の強さ ◀ 1〜5 ▶」「先取 ◀ 1〜5 ▶（初期値 2）」「ルール：通（フィーバーはじゅんび中）」「スタート」「タイトルへ」
- versus: 背景（通）、1P（青）＝自分、2P（赤ピンク）＝CPU。各フィールドに枠・FieldView・HUD・予告。画面下中央に勝ち星（★）。ラウンド開始時に「READY」→「GO!」（約 1.5 秒、その間エンジンは止める）。決着したら勝った側に「WIN」、負けた側に「ばたんきゅ〜」を出し、2.5 秒後に次のラウンド（ラウンドごとにシードを変える）。先取したら結果パネル（もう一回 / 強さを変える / タイトルへ）。Esc でポーズ（つづける / タイトルへ）
- 効果音は自分の盤面だけ鳴らす。相手の連鎖は小さめの音
- [ ] 実装 → `npm run check` → ブラウザで CPU と 1 試合して確認、スクリーンショット → コミット `feat: CPU 対戦の画面`
