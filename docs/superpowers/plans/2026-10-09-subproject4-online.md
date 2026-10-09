# サブプロジェクト④ オンライン対戦（最大4人・通ルール） 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 部屋コードで 2〜4 人が集まって、通ルールで先取制のオンライン対戦ができ、GitHub Pages で公開されている状態にする。

**Architecture:** 各プレイヤーは自分の `Player` だけを動かし、「L（置いた場所）」「G（降ったおじゃまの列）」のログを Firebase に書く。相手の盤面は同じシードの `Player` を **再生モード**（`replay` ソース付き）で動かし、ログどおりに置く・降らせる。攻撃と確定はメッセージ（`attacks/{round}` への push）で送る。部屋・ラウンド進行は前作 Puzzle Battle の `Room` を 4 人・先取制に作り直したもの。

**Tech Stack:** TypeScript, Firebase Realtime Database（匿名認証）, PixiJS v8, Vitest（`MemoryTransport` でテスト）

**Spec:** `docs/superpowers/specs/2026-10-09-puyo-esports-practice-design.md` §8

## Global Constraints

- Firebase プロジェクトは前作と同じ `puzbattle`。**セキュリティルールは変えない**。既存ルールで書ける `rooms/{id}/info`（ホストのみ）、`players/{uid}`（本人のみ）、`boards/{uid}`（本人のみ・文字列 20000 字未満）、`attacks/{round}/{push}`（`from`=自分・`ap` が数値）、`losses/{round}/{uid}`（部屋のメンバーなら誰でも）だけを使う
- 部屋コードは 7 文字（前作の 6 文字の部屋とぶつからないように）。`info.app = 'puyo'` で前作の部屋と区別する
- 最大 4 人。2 人以上が全員準備 OK でホストが開始
- 自分の盤面の操作感はネットワークに左右されない（自分の `Player` はローカルで動く）
- `src/engine` は DOM・Firebase を import しない
- 公開は GitHub Pages（`.github/workflows/deploy.yml` は用意済み）

## Review Focus

1. **再生のずれ**: 相手の盤面の再生が、本人の盤面と同じ結果（連鎖・おじゃま・負け）になること
2. **ラグ**: ログが遅れて届いても、再生がそこで待つだけで壊れないこと
3. **途中で抜ける**: 対戦中にタブを閉じた人はそのラウンドの負けになり、残りで続くこと
4. **4 人のとき**: 攻撃先の決まり方が全員の画面でだいたい一致し、負けた人がいても残りで続くこと
5. **部屋に入れない**: 存在しない・満員・期限切れ・対戦中の部屋では、理由が表示されること

---

### Task 1: 再生モードとログ（エンジン）

**Files:** Modify `src/engine/player.ts`, `src/engine/events.ts`; Create `src/net/boardLog.ts`; Test `tests/engine/replay.test.ts`, `tests/net/boardLog.test.ts`

- `lock` イベントに `x, dir`、`garbage` イベントに `cols: number[]` を追加
- `PlayerOptions.replay?: ReplaySource`、`interface ReplaySource { placement(i): { x: number; dir: Dir } | undefined; garbage(i): number[] | undefined }`
  - 再生モードでは、ツモ i が出たらログ L(i) が来るまで止まり、来たらその位置に落として固定する
  - ターンの終わりにはログ G(i)（0 個なら `000000`）が来るまで待ち、その列どおりに降らせる。自前の予告は使わない
- `boardLog.ts`: `class BoardLogWriter { lock(i, x, dir); garbage(i, cols); toString(): string }`、`parseBoardLog(s): ReplaySource & { round: number }`。形式 `R{round}|L{i}:{x}{dir};G{i}:{c1..c6};…`
- テスト: ローカルの `Match`（2 人、片方に攻撃）を 300 手ぶん動かしてログを取り、同じシードの再生モード `Player` が同じ盤面・スコア・負けになる。ログが途中までしかないと、そこで止まって進まない（壊れない）

### Task 2: 部屋（Room）

**Files:** Create `src/net/transport.ts`（前作から移植）, `src/net/firebaseConfig.ts`, `src/net/connect.ts`, `src/net/firebaseTransport.ts`, `src/net/room.ts`; Test `tests/net/room.test.ts`

- `Room.create(t, name, firstTo)` / `Room.join(t, id, name)`（not_found / full / expired / playing / not_puyo）
- `info: { app: 'puyo', createdAt, hostId, state, round, seed, startAt, firstTo, members: string[] }`
- 全員 ready（2 人以上・全員 online）でホストが `startRound`。`losses[round]` が「メンバー − 1」人以上でラウンド終了 → 2.5 秒後に次へ。誰かが `firstTo` 勝したら `finished`
- ホストは、対戦中に offline になったメンバーを負けとして書く
- `wins(uid)`、`sendAttack(round, to, n)`、`sendConfirm(round)`、`onAttack(round, cb)`、`writeBoard(log)`、`onBoard(uid, cb)`
- テスト（MemoryHub）: 作成・参加・満員（5 人目）・存在しない・前作の部屋・全員 ready で開始・負けで勝ち数・先取で finished・切断で負け

### Task 3: オンラインの試合（OnlineMatch）

**Files:** Create `src/net/onlineMatch.ts`; Test `tests/net/onlineMatch.test.ts`

- `class OnlineMatch { constructor(room, round, seed, members, myUid); players: Player[]; myIndex; step(input); dispose() }`
- 自分: 通常の `Player`。イベントから `BoardLogWriter` を更新して `boards/{uid}` に書く（ツモが出るたび・負けたとき）。`clear.send > 0` → `sendAttack(target)`、`chainEnd` → `sendConfirm`、`dead` → `reportLose`
- 相手: 再生モードの `Player`（`onBoard` で受け取ったログを渡す）
- 届いた攻撃: `to === 自分` なら `receive(fromIndex, n)`、確定なら `confirm(fromIndex)`
- 攻撃先: 生き残っている相手のうち、この試合で自分が受け取った…ではなく「これまでに送られた攻撃の合計が一番少ない相手 → 盤面が一番低い相手 → 番号が小さい相手」
- テスト（MemoryHub で 2 人ぶんの OnlineMatch を同時に動かす）: A の 2 連鎖が B の予告に届き、A の連鎖終了で確定して B に降る。B 側から見た A の再生盤面が A 本人の盤面と一致する

### Task 4: 画面（ロビー・部屋・3〜4 人のレイアウト）

**Files:** Create `src/ui/screens/online.ts`（名前と部屋コードの入力、作る/入る）, `src/ui/screens/onlineRoom.ts`（待機と対戦）, `src/render/layout.ts` に `cardLayout(i, n)` を追加; Modify `title.ts`

- 入力は HTML のテキスト欄を重ねる（日本語の名前が打てるように）。URL の `#room=XXXXXXX` で直接参加できる。部屋画面に「招待リンクをコピー」
- 待機: 参加者（最大 4 枠）と準備 OK の表示。Enter で準備 OK の切り替え、Esc で退出
- 対戦: 2 人なら `versusSide`、3〜4 人なら縦長カードを横一列（設計書 §6.3）。READY/GO、勝ち星、WIN/ばたんきゅ〜、先取で結果表示（もう一回＝全員の準備 OK を待つ）
- [ ] `npm run check` → ローカルでブラウザのタブ 2 つで対戦して確認 → コミット

### Task 5: 公開

- GitHub に public リポジトリ `tsubasakanke/puyo-esports-practice` を作って push、Pages を GitHub Actions で有効化（ユーザーが 2026-10-09 にチャットで許可）
- 公開 URL で、ひとり練習・CPU 対戦・オンライン（2 タブ）を確認
